import { getSql, json, photoKey, sniffImage, LIMITS, verifyAccess, denied, type Env } from '../../../../../src/lib/write';
import { apiMsg } from '../../_locale';

// POST /api/write/review/cover/<id>   (multipart/form-data, field "photo")
// Editors only. Adds a cover photo to a piece that was sent in without one. A piece that already has a cover
// keeps it: this endpoint never replaces one.
export const onRequestPost = async ({ request, env, params }: { request: Request; env: Env; params: { id: string } }) => {
  if (!(await verifyAccess(request, env))) return denied();
  const sql = getSql(env);
  if (!sql || !env.POSTS_BUCKET) return json({ error: apiMsg(request, 'write.api.dbNotConfigured') }, 503);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'bad id' }, 400);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: apiMsg(request, 'write.api.wrong') }, 400); }
  const file = form.get('photo');
  if (!file || typeof file === 'string') return json({ error: apiMsg(request, 'write.api.wrong') }, 400);
  if (file.size > LIMITS.photoBytes) return json({ error: 'The photo must be under 5 MB.' }, 400);
  const data = await file.arrayBuffer();
  const kind = sniffImage(new Uint8Array(data, 0, Math.min(16, data.byteLength)));
  if (!kind) return json({ error: apiMsg(request, 'write.api.photoType') }, 400);

  const rows = await sql(`select cover_key from posts where id = $1`, [id]);
  if (!rows.length) return json({ error: apiMsg(request, 'write.api.notFound') }, 404);
  if (rows[0].cover_key) return json({ error: 'This piece already has a cover photo.' }, 409);

  const key = photoKey(kind.ext);
  try {
    await env.POSTS_BUCKET.put(key, data, { httpMetadata: { contentType: kind.type } });
    // The "cover_key is null" guard means a second editor's upload cannot overwrite the first one.
    const r = await sql(`update posts set cover_key = $2 where id = $1 and cover_key is null returning id`, [id, key]);
    if (!r.length) {
      await env.POSTS_BUCKET.delete(key);
      return json({ error: 'This piece already has a cover photo.' }, 409);
    }
  } catch {
    await Promise.allSettled([env.POSTS_BUCKET.delete(key)]);
    return json({ error: apiMsg(request, 'write.api.saveFailed') }, 500);
  }
  return json({ ok: true, key });
};
