import { digits, getLocale, localePath, t, type Locale } from '../i18n';
import { esc, getSql, readMinutes, renderArticleHtml, RESERVED_SLUGS, type Block, type Env } from './write';

declare const HTMLRewriter: any;

interface ArticleRow {
  title: string; kind: string; author_name: string; cover_key: string | null; body: Block[]; photo_credit: string; published_at: string;
}

// Kannada article markup. Same structure as renderArticleHtml; the writer's text is escaped and left as written.
function renderArticleHtmlKn(p: ArticleRow, locale: Locale): string {
  const kind = t(locale, p.kind === 'analyst' ? 'write.kind.analyst' : 'write.kind.fan');
  const fig = (key: string, cap: string, credit: string, eager = false) =>
    `<figure><img src="/api/write/photo/${esc(key)}" alt="${esc(cap)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` +
    (cap || credit ? `<figcaption>${cap ? esc(cap) : ''}${credit ? `<i>${esc(credit)}</i>` : ''}</figcaption>` : '') + '</figure>';
  const date = digits(locale, new Date(p.published_at).toLocaleDateString('kn-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }));
  const minutes = t(locale, 'write.article.minRead', { n: digits(locale, readMinutes(p.body)) });
  return `<article class="wr-art"><p class="eyebrow">${esc(t(locale, 'write.article.analysis', { kind }))}</p><h1>${esc(p.title)}</h1>` +
    `<div class="wr-by"><span class="wr-tag${p.kind === 'analyst' ? ' an' : ''}">${esc(kind)}</span> ${esc(p.author_name)} · ${minutes} · ${date}</div>` +
    (p.cover_key ? fig(p.cover_key, '', p.photo_credit, true) : '') +
    p.body.map((b) => (b.t === 'p' ? `<p>${esc(b.txt)}</p>` : fig(b.key, b.cap, b.credit))).join('') +
    `<p class="wr-note">${esc(t(locale, 'write.article.photosRemain'))}</p>` +
    `<div class="wr-card" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span><b>${esc(t(locale, 'write.article.ctaTitle'))}</b><br><span class="wr-note">${esc(t(locale, 'write.article.ctaNote'))}</span></span><a class="btn" href="${localePath(locale, '/armchair-gaffers/write/submit')}">${esc(t(locale, 'write.submit.title'))}</a></div></article>`;
}

/**
 * Serves /armchair-gaffers/write/<slug> (English) or /kn/armchair-gaffers/write/<slug> (Kannada).
 * The chrome comes from the static shell for that locale; the article is injected into #post-root.
 */
export async function serveArticle(
  ctx: { request: Request; env: Env; params: { slug: string }; next: () => Promise<Response> },
): Promise<Response> {
  const { request, env } = ctx;
  const slug = String(ctx.params.slug);
  if (RESERVED_SLUGS.includes(slug)) return ctx.next(); // /write/submit is a real static page
  const locale = getLocale(new URL(request.url));
  const sql = getSql(env);
  const rows = sql ? await sql(`select title, kind, author_name, cover_key, body, photo_credit, published_at from posts where slug = $1 and status = 'published'`, [slug]).catch(() => []) : [];
  const shellPath = locale === 'kn' ? '/kn/armchair-gaffers/article-shell' : '/armchair-gaffers/article-shell';
  const shell = await env.ASSETS!.fetch(new URL(shellPath, request.url).toString());
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
  const pagePath = localePath(locale, `/armchair-gaffers/write/${slug}`);
  if (!rows.length) {
    const nf = locale === 'kn'
      ? `<div class="wr-card"><h1>${esc(t(locale, 'write.article.notFound'))}</h1><p class="wr-note">${esc(t(locale, 'write.article.notFoundBody'))} <a href="${localePath(locale, '/armchair-gaffers/write')}">${esc(t(locale, 'write.article.seeAll'))}</a></p></div>`
      : '<div class="wr-card"><h1>Piece not found</h1><p class="wr-note">It may not be published yet. <a href="/armchair-gaffers/write">See all pieces</a></p></div>';
    return new HTMLRewriter()
      .on('#post-root', { element(e: any) { e.setInnerContent(nf, { html: true }); } })
      .transform(new Response(shell.body, { status: 404, headers }));
  }
  const p = rows[0] as ArticleRow;
  const title = `${p.title} · Panenka Goal`;
  const firstPara = ((p.body.find((b) => b.t === 'p') as { txt: string } | undefined)?.txt ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const imgKey = p.cover_key ?? (p.body.find((b) => b.t === 'img') as { key: string } | undefined)?.key ?? null; // cover, else first inline photo
  const img = imgKey ? new URL(`/api/write/photo/${imgKey}`, request.url).href : null;
  const tw = (name: string, content: string) => `<meta name="${name}" content="${esc(content)}">`;
  const canonical = new URL(pagePath, request.url).href;
  const article = locale === 'kn' ? renderArticleHtmlKn(p, locale) : renderArticleHtml(p);
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
    .on('#post-root', { element(e: any) { e.setInnerContent(article, { html: true }); } })
    .transform(new Response(shell.body, { status: 200, headers }));
  res.headers.set('cache-control', 'public, max-age=60, stale-while-revalidate=300');
  return res;
}
