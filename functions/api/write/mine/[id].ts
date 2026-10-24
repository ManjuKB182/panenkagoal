import { cleanText, getSql, json, LIMITS, signInNeeded, validateEditedBlocks, writerIdentity, type Env } from '../../../../src/lib/write';
import { apiMsg } from '../_locale';

// POST /api/write/mine/<id>   { title, kind, body: [...blocks] }
// A writer fixes their own piece and sends it for review again. Only pieces still waiting (pending) or sent back
// can be changed; a published piece is changed by an editor. The piece goes back to pending.
export const onRequestPost = async ({ request, env, params }: { request: Request; env: Env; params: { id: string } }) => {
  const who = await writerIdentity(request, env);
  if (!who) return signInNeeded();
  const sql = getSql(env);
  if (!sql) return json({ error: apiMsg(request, 'write.api.dbNotConfigured') }, 503);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'bad id' }, 400);
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  const rows = await sql(`select body, cover_key, status from posts where id = $1 and lower(author_email) = $2`, [id, who.email]);
  if (!rows.length) return json({ error: apiMsg(request, 'write.api.notFound') }, 404);
  if (rows[0].status === 'published') return json({ error: apiMsg(request, 'write.api.alreadyPublished') }, 409);

  const allowed = new Set<string>(rows[0].body.filter((x: any) => x.t === 'img').map((x: any) => x.key));
  if (rows[0].cover_key) allowed.add(rows[0].cover_key);
  const body = validateEditedBlocks(b.body, allowed);
  const title = cleanText(b.title, LIMITS.title);
  const kind = b.kind === 'analyst' ? 'analyst' : b.kind === 'fan' ? 'fan' : null;
  if (!body || !title || !kind || !body.some((x) => x.t === 'p')) return json({ error: apiMsg(request, 'write.api.checkFields') }, 400);
  await sql(`update posts set title = $2, kind = $3, body = $4::jsonb, status = 'pending' where id = $1`, [id, title, kind, JSON.stringify(body)]);
  return json({ ok: true });
};
