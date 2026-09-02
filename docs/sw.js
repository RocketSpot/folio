/* Folio service worker — build 070aaa0b (2026-09-02)
 * Strategy:
 *   - app shell (this origin): navigations are network-first with cache fallback, other shell files cache-first
 *   - code libraries and fonts from CDNs: stale-while-revalidate in a shared runtime cache
 *   - catalog, download and speech APIs: never cached (network only)
 * Books, progress and settings live in IndexedDB and are never touched by the worker.
 */
const VERSION = '070aaa0b';
const SHELL = 'folio-shell-' + VERSION;
const RUNTIME = 'folio-runtime-v1';
const SHELL_URLS = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];
const RUNTIME_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'tessdata.projectnaptha.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(SHELL_URLS)).catch(err => console.warn('[folio-sw] precache failed', err)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('folio-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) {
      event.respondWith(
        fetch(req).then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => { c.put('./index.html', copy.clone()); c.put('./', copy); }).catch(() => {}); }
          return res;
        }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
      );
      return;
    }
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }

  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(RUNTIME).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => null);
      if (cached) { network.catch(() => {}); return cached; }
      const res = await network;
      return res || Response.error();
    }));
  }
  // anything else (Open Library, Internet Archive, Gutendex, Google Books, ElevenLabs, OpenAI): straight to the network
});
