import { esc, getSql, RESERVED_SLUGS, renderArticleHtml, type Env } from '../../../src/lib/write';

declare const HTMLRewriter: any;

// /armchair-gaffers/write/<slug>: renders a published post at request time (no rebuild needed).
// The page chrome comes from the static shell /armchair-gaffers/article-shell; the article is injected into it.
export const onRequestGet = async (ctx: { request: Request; env: Env; params: { slug: string }; next: () => Promise<Response> }) => {
  const { request, env } = ctx;
  const slug = String(ctx.params.slug);
  if (RESERVED_SLUGS.includes(slug)) return ctx.next(); // /write/submit is a real static page
  const sql = getSql(env);
  const rows = sql ? await sql(`select title, kind, author_name, cover_key, body, photo_credit, published_at from posts where slug = $1 and status = 'published'`, [slug]).catch(() => []) : [];
  const shellUrl = new URL('/armchair-gaffers/article-shell', request.url);
  const shell = await env.ASSETS!.fetch(shellUrl.toString());
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
  if (!rows.length) {
    return new HTMLRewriter()
      .on('#post-root', { element(e: any) { e.setInnerContent('<div class="wr-card"><h1>Piece not found</h1><p class="wr-note">It may not be published yet. <a href="/armchair-gaffers/write">See all pieces</a></p></div>', { html: true }); } })
      .transform(new Response(shell.body, { status: 404, headers }));
  }
  const p = rows[0];
  const title = `${p.title} · Panenka Goal`;
  const firstPara = (p.body.find((b: any) => b.t === 'p')?.txt ?? '').slice(0, 160);
  const imgKey = p.cover_key ?? p.body.find((b: any) => b.t === 'img')?.key ?? null; // cover, else first inline photo
  const img = imgKey ? new URL(`/api/write/photo/${imgKey}`, request.url).href : null;
  const tw = (name: string, content: string) => `<meta name="${name}" content="${esc(content)}">`;
  const canonical = new URL(`/armchair-gaffers/write/${slug}`, request.url).href;
  const res = new HTMLRewriter()
    .on('title', { element(e: any) { e.setInnerContent(esc(title), { html: true }); } })
    .on('meta[name="robots"]', { element(e: any) { e.remove(); } })
    .on('link[rel="canonical"]', { element(e: any) { e.setAttribute('href', canonical); } })
    .on('meta[name="description"]', { element(e: any) { e.setAttribute('content', firstPara); } })
    .on('meta[property="og:title"]', { element(e: any) { e.setAttribute('content', title); } })
    .on('meta[property="og:description"]', { element(e: any) { e.setAttribute('content', firstPara); } })
    .on('meta[property="og:url"]', { element(e: any) { e.setAttribute('content', canonical); } })
    .on('meta[property="og:type"]', { element(e: any) { e.setAttribute('content', 'article'); } })
    .on('meta[property="og:image"]', { element(e: any) { if (img) e.setAttribute('content', img); } })
    .on('meta[name="twitter:card"]', { element(e: any) { e.after(tw('twitter:title', title) + tw('twitter:description', firstPara) + (img ? tw('twitter:image', img) : ''), { html: true }); } })
    .on('#post-root', { element(e: any) { e.setInnerContent(renderArticleHtml(p), { html: true }); } })
    .transform(new Response(shell.body, { status: 200, headers }));
  res.headers.set('cache-control', 'public, max-age=60, stale-while-revalidate=300');
  return res;
};
