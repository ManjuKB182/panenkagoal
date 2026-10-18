import { getSql, json, signInNeeded, writerIdentity, type Env } from '../../../../src/lib/write';

// GET /api/write/mine: the signed-in writer. Protect /api/write/mine* with the writers' Access app (docs/write-setup.md).
//   ?me=1            -> { email, name }   (name is the one used on their latest piece; prefills the submit form)
//   (no parameter)   -> { email, name, posts: [...] } with every piece they sent, any status
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const who = await writerIdentity(request, env);
  if (!who) return signInNeeded();
  const sql = getSql(env);
  if (!sql) return json({ error: 'Database is not configured.' }, 503);
  const rows = await sql(
    `select id, slug, title, kind, author_name, cover_key, body, status, editor_note, created_at, published_at
       from posts where lower(author_email) = $1 order by created_at desc limit 200`, [who.email]);
  const name = rows[0]?.author_name ?? null;
  if (new URL(request.url).searchParams.get('me')) return json({ email: who.email, name });
  return json({ email: who.email, name, posts: rows });
};
