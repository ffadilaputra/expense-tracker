// A small, hand-written service worker (no Workbox / PWA plugin) so the
// app shell (HTML/JS/CSS) can still be opened with no connection, after at
// least one successful online visit.
//
// Strategy: network-first, falling back to cache when offline. Every
// successful same-origin GET response gets stored for later. Requests to
// the Apps Script API (cross-origin) are intentionally left untouched here -
// offline data handling for those lives in src/offline/localCache.ts instead.

// Bumped whenever PRECACHE_URLS changes: activate deletes every cache whose
// name does not match, which is what makes the new list take effect.
const CACHE_NAME = 'finance-app-shell-v2';
// The font is precached rather than left to the fetch handler so the very
// first offline load already has it, instead of falling back to the system
// font until some later online visit happens to fetch it.
const PRECACHE_URLS = ['/', '/index.html', '/fonts/satoshi-variable.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave Apps Script requests alone

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
  );
});
