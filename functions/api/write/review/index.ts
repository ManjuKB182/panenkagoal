import { denied, getSql, json, verifyAccess, type Env } from '../../../../src/lib/write';

// GET /api/write/review?status=pending|published|sent_back: editor list (includes author email).
// Protect /api/write/review* with Cloudflare Access (see docs/write-setup.md).
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  if (!(await verifyAccess(request, env))) return denied();
  const sql = getSql(env);
  if (!sql) return json({ error: 'Database is not configured.' }, 503);
  const status = new URL(request.url).searchParams.get('status') ?? 'pending';
  if (!['pending', 'published', 'sent_back'].includes(status)) return json({ error: 'bad status' }, 400);
  const rows = await sql(
    `select id, slug, title, kind, author_name, author_email, cover_key, body, photo_rights, photo_credit, status, editor_note, created_at, published_at
       from posts where status = $1 order by created_at desc limit 200`, [status]);
  const counts = await sql(`select status, count(*)::int as n from posts group by status`);
  return json({ posts: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
};
