// Cloudflare Pages middleware: every request passes through here.
// Only the production domains may be indexed. Staging and PR previews (*.pages.dev) get
// X-Robots-Tag: noindex, so search engines do not treat them as duplicates of panenkagoal.com.
const PRODUCTION_HOSTS = new Set(['panenkagoal.com', 'www.panenkagoal.com']);

export const onRequest = async (context: { request: Request; next: () => Promise<Response> }) => {
  const response = await context.next();
  if (PRODUCTION_HOSTS.has(new URL(context.request.url).hostname)) return response;
  // Response headers can be immutable, so copy the response before adding the header.
  const copy = new Response(response.body, response);
  copy.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return copy;
};
