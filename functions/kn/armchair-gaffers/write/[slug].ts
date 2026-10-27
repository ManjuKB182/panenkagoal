import { serveArticle } from '../../../../src/lib/write-article';
import type { Env } from '../../../../src/lib/write';

// /kn/armchair-gaffers/write/<slug>: the same article in Kannada chrome. Writer's text is shown as written.
export const onRequestGet = (ctx: { request: Request; env: Env; params: { slug: string }; next: () => Promise<Response> }) => serveArticle(ctx);
