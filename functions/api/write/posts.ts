import { getSql, json, readMinutes, type Env } from '../../../src/lib/write';

// GET /api/write/posts: published posts, newest first, for the Write tab.
export const onRequestGet = async ({ env }: { env: Env }) => {
  const sql = getSql(env);
  if (!sql) return json({ posts: [] }, 200, { 'cache-control': 'no-store' });
  try {
    const rows = await sql(`select slug, title, kind, author_name, cover_key, body, published_at from posts where status = 'published' order by published_at desc limit 200`);
    const posts = rows.map((r) => ({
      slug: r.slug, title: r.title, kind: r.kind, author: r.author_name, cover: r.cover_key,
      publishedAt: r.published_at, minutes: readMinutes(r.body),
    }));
    return json({ posts }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
};
