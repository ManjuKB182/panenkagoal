import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Local dev has no Cloudflare Functions, so serve /api/live from the same handler.
const devLiveApi = {
  name: 'dev-live-api',
  configureServer(server) {
    server.middlewares.use('/api/live', async (_req, res) => {
      const { liveResponse } = await server.ssrLoadModule('/src/lib/live.ts');
      const r = await liveResponse();
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await r.text());
    });
  },
};

export default defineConfig({
  site: 'https://panenkagoal.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      // English at the root, Kannada under /kn/. Each page lists its other-language twin.
      // Codes match the hreflang tags in Base.astro.
      i18n: { defaultLocale: 'en', locales: { en: 'en', kn: 'kn' } },
      // Utility pages (editor queue, drafts, submit form, 404) and the live match centre stay out of search.
      filter: (page) => !/\/armchair-gaffers\/(review|article-shell|write\/(mine|submit))/.test(page) && !/\/match\/?$/.test(page) && !/\/404\/?$/.test(page),
    }),
  ],
  vite: { plugins: [devLiveApi] },
});
