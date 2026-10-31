import { denied, getSql, json, LIMITS, photoKey, sniffImage, verifyAccess, type Env } from '../../../../../src/lib/write';
import { apiMsg } from '../../_locale';

// POST /api/write/review/photo/<id>   (multipart/form-data: "photo" = the new image, "old" = the key being replaced, or empty)
// Editors only. Puts a new photo on a piece, in the cover slot or in place of an inline photo, and deletes the old one.
//   old = ''            adds a cover (only when the piece has none)
//   old = its cover     replaces the cover
//   old = an inline key replaces that photo, keeping its caption and credit
// Saved at once, like the cover upload was, so unsaved text in the form is not affected.
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
  const old = String(form.get('old') ?? '');
  const data = await file.arrayBuffer();
  const kind = sniffImage(new Uint8Array(data, 0, Math.min(16, data.byteLength)));
  if (!kind) return json({ error: apiMsg(request, 'write.api.photoType') }, 400);

  const rows = await sql(`select body, cover_key from posts where id = $1`, [id]);
  if (!rows.length) return json({ error: apiMsg(request, 'write.api.notFound') }, 404);
  const { body, cover_key: cover } = rows[0];
  const key = photoKey(kind.ext);
  const changed = () => json({ error: 'The piece changed while you were working. Reload and try again.' }, 409);

  try {
    await env.POSTS_BUCKET.put(key, data, { httpMetadata: { contentType: kind.type } });
    let done: any[];
    if (!old) {
      // Guarded by "cover_key is null", so two editors cannot both add a cover.
      if (cover) { await env.POSTS_BUCKET.delete(key); return json({ error: 'This piece already has a cover photo.' }, 409); }
      done = await sql(`update posts set cover_key = $2 where id = $1 and cover_key is null returning id`, [id, key]);
    } else if (old === cover) {
      done = await sql(`update posts set cover_key = $2 where id = $1 and cover_key = $3 returning id`, [id, key, old]);
    } else if (body.some((x: any) => x.t === 'img' && x.key === old)) {
      const next = body.map((x: any) => (x.t === 'img' && x.key === old ? { ...x, key } : x));
      done = await sql(`update posts set body = $2::jsonb where id = $1 and body = $3::jsonb returning id`, [id, JSON.stringify(next), JSON.stringify(body)]);
    } else {
      await env.POSTS_BUCKET.delete(key);
      return json({ error: apiMsg(request, 'write.api.notFound') }, 404);
    }
    if (!done.length) { await env.POSTS_BUCKET.delete(key); return changed(); }
  } catch {
    await Promise.allSettled([env.POSTS_BUCKET.delete(key)]);
    return json({ error: apiMsg(request, 'write.api.saveFailed') }, 500);
  }
  if (old) await Promise.allSettled([env.POSTS_BUCKET.delete(old)]);
  return json({ ok: true, key });
};
