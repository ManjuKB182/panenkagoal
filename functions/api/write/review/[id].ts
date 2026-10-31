import { cleanText, denied, getSql, json, LIMITS, validateEditedBlocks, verifyAccess, type Env } from '../../../../src/lib/write';
import { apiMsg } from '../_locale';

// POST /api/write/review/<id>
//   { action: 'approve' }
//   { action: 'send_back', note }
//   { action: 'delete' }   (removes the piece and its photos for good, whatever its status)
//   { action: 'edit', title, kind, author_name, photo_credit, remove_cover, body: [...blocks] }   (stays in its current status, published or not;
//     blocks left out of body and a cover with remove_cover: true are taken off the piece and their photos deleted)
export const onRequestPost = async ({ request, env, params }: { request: Request; env: Env; params: { id: string } }) => {
  if (!(await verifyAccess(request, env))) return denied();
  const sql = getSql(env);
  if (!sql) return json({ error: apiMsg(request, 'write.api.dbNotConfigured') }, 503);
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'bad id' }, 400);
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  if (b.action === 'approve') {
    const r = await sql(`update posts set status = 'published', editor_note = null, published_at = coalesce(published_at, now()) where id = $1 returning id`, [id]);
    return r.length ? json({ ok: true }) : json({ error: apiMsg(request, 'write.api.notFound') }, 404);
  }
  if (b.action === 'send_back') {
    const note = cleanText(b.note, LIMITS.note);
    if (!note) return json({ error: apiMsg(request, 'write.api.noNote') }, 400);
    const r = await sql(`update posts set status = 'sent_back', editor_note = $2 where id = $1 returning id`, [id, note]);
    return r.length ? json({ ok: true }) : json({ error: apiMsg(request, 'write.api.notFound') }, 404);
  }
  if (b.action === 'delete') {
    const rows = await sql(`delete from posts where id = $1 returning body, cover_key`, [id]);
    if (!rows.length) return json({ error: apiMsg(request, 'write.api.notFound') }, 404);
    if (env.POSTS_BUCKET) {
      const keys = new Set<string>(rows[0].body.filter((x: any) => x.t === 'img').map((x: any) => x.key));
      if (rows[0].cover_key) keys.add(rows[0].cover_key);
      await Promise.allSettled([...keys].map((k) => env.POSTS_BUCKET.delete(k)));
    }
    return json({ ok: true });
  }
  if (b.action === 'edit') {
    const rows = await sql(`select body, cover_key from posts where id = $1`, [id]);
    if (!rows.length) return json({ error: apiMsg(request, 'write.api.notFound') }, 404);
    const allowed = new Set<string>(rows[0].body.filter((x: any) => x.t === 'img').map((x: any) => x.key));
    if (rows[0].cover_key) allowed.add(rows[0].cover_key);
    const body = validateEditedBlocks(b.body, allowed);
    const title = cleanText(b.title, LIMITS.title);
    const kind = b.kind === 'analyst' ? 'analyst' : b.kind === 'fan' ? 'fan' : null;
    const author = cleanText(b.author_name, LIMITS.name);
    const photoCredit = cleanText(b.photo_credit, LIMITS.credit);
    if (!body || !title || !kind || !author) return json({ error: apiMsg(request, 'write.api.checkFields') }, 400);
    const cover = b.remove_cover === true ? null : rows[0].cover_key;
    await sql(
      `update posts set title = $2, kind = $3, body = $4::jsonb, author_name = $5, photo_credit = $6, cover_key = $7 where id = $1`,
      [id, title, kind, JSON.stringify(body), author, photoCredit, cover],
    );
    // Photos the editor took out are deleted, so they stop being served. Only after the save has gone through.
    if (env.POSTS_BUCKET) {
      const kept = new Set<string>(body.filter((x) => x.t === 'img').map((x: any) => x.key));
      if (cover) kept.add(cover);
      await Promise.allSettled([...allowed].filter((k) => !kept.has(k)).map((k) => env.POSTS_BUCKET.delete(k)));
    }
    return json({ ok: true });
  }
  return json({ error: 'unknown action' }, 400);
};
