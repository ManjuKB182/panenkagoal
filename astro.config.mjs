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
  integrations: [sitemap()],
  vite: { plugins: [devLiveApi] },
});
