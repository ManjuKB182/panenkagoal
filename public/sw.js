// Panenka Goal service worker. Keeps the site usable offline and makes it installable.
// Bump VERSION when the shell or offline page changes, so old caches are dropped on activate.
const VERSION = 'pg-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ['/offline.html', '/logo-192.png', '/logo-512.png', '/favicon-48.png'];

// Never cached: live scores, writer and editor routes, and anything that must be fresh.
const NEVER_CACHE = (path) =>
  path.startsWith('/api/') || path.startsWith('/armchair-gaffers/write/') || path.startsWith('/kn/armchair-gaffers/write/');
// Static files that change rarely and are safe to show from cache while refreshing.
const STATIC = (path) => ['/_astro/', '/bg/', '/players/', '/logos/'].some((p) => path.startsWith(p)) || path.startsWith('/logo-');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // YouTube, fonts and analytics go straight to the network.

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req, url));
    return;
  }
  if (STATIC(url.pathname)) event.respondWith(staleWhileRevalidate(req));
});

// Pages: fresh from the network when online; the last copy or the offline page when not.
async function navigate(req, url) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok && !NEVER_CACHE(url.pathname) && res.headers.get('cache-control') !== 'no-store') {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = NEVER_CACHE(url.pathname) ? null : await cache.match(req);
    return cached || cache.match('/offline.html');
  }
}

// Static files: answer from cache at once, refresh the copy in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(req);
  const refresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || refresh;
}
