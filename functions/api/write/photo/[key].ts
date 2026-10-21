import { PHOTO_KEY_RE, type Env } from '../../../../src/lib/write';

// GET /api/write/photo/<key>: serves an uploaded photo from R2. Keys are random and never reused,
// so the answer can be cached for a year.
const serve = async ({ params, env }: { params: { key: string }; env: Env }) => {
  const key = String(params.key);
  if (!PHOTO_KEY_RE.test(key) || !env.POSTS_BUCKET) return new Response('Not found', { status: 404 });
  const obj = await env.POSTS_BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
};

// Link-preview crawlers sometimes probe with HEAD first; without this they get the 404 page.
export const onRequestGet = serve;
export const onRequestHead = serve;
