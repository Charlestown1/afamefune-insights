// Afamefune Insights — Service Worker
//
// CACHING STRATEGY (deliberately conservative because this app handles
// authenticated/private trading data):
//
// 1. Never cache anything under /api/, /auth/, or /.well-known/ — these are
//    always dynamic, session-scoped, or contain private user data (trades,
//    prop-firm accounts, admin data, auth state). They always go straight
//    to the network. A stale cached API response could leak one user's
//    data to another user on a shared device, so this is a hard rule.
//
// 2. Static assets (css, js, icons, manifest, fonts) use cache-first with
//    background revalidation, so the app loads instantly offline/on slow
//    connections but still picks up updates in the background.
//
// 3. Page navigations use network-first: try the live server first (so
//    logged-in users always see current data), and only fall back to the
//    cached offline page if the network genuinely fails.
//
// 4. Every deploy that changes CACHE_VERSION automatically discards old
//    caches on activate, so users are never stuck on stale assets.

const CACHE_VERSION = 'afamefune-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_URLS = [
  '/',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.error('SW precache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('afamefune-') && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isNeverCache(url) {
  return url.pathname.startsWith('/api/') ||
         url.pathname.startsWith('/auth/') ||
         url.pathname.startsWith('/.well-known/');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests; let everything else (cross-origin
  // font/CDN requests, POST/PUT/DELETE) pass straight through untouched.
  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  // Rule 1: never cache private/dynamic endpoints.
  if (isNeverCache(url)) {
    return; // no respondWith = default browser network behavior
  }

  // Rule 3: page navigations — network-first with offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/offline.html').then((cached) => cached || Response.error())
      )
    );
    return;
  }

  // Rule 2: static assets — cache-first, revalidate in background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
