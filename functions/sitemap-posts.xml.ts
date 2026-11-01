import { esc, getSql, type Env } from '../src/lib/write';

// Cloudflare Pages Function: GET /sitemap-posts.xml
// Blog posts live in Neon, not in the static build, so their URLs come from here.
// Only published pieces are listed; pending and sent-back drafts never appear.
export const onRequestGet = async (ctx: { env: Env }) => {
  const sql = getSql(ctx.env);
  const rows = sql
    ? await sql(`select slug, published_at from posts where status = 'published' order by published_at desc`, []).catch(() => [])
    : [];
  const urls = rows
    .map((r: { slug: string; published_at: string }) => {
      const lastmod = new Date(r.published_at).toISOString().slice(0, 10);
      return `  <url><loc>https://panenkagoal.com/armchair-gaffers/write/${esc(r.slug)}</loc><lastmod>${lastmod}</lastmod></url>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
