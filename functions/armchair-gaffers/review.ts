import { denied, verifyAccess, type Env } from '../../src/lib/write';

// /armchair-gaffers/review: editors only. Serves the static review page after the Access check.
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  if (!(await verifyAccess(request, env))) return denied();
  const res = await env.ASSETS!.fetch(request);
  const out = new Response(res.body, res);
  out.headers.set('x-robots-tag', 'noindex, nofollow');
  out.headers.set('cache-control', 'private, no-store');
  return out;
};
