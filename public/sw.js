const CACHE_NAME = 'ar-directory-v3';
const STATIC_ASSETS = ['/', '/icon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .catch(() => {})
  );
  self.clients.claim();
});

// Only cache successful responses. Opaque responses (cross-origin no-cors) and
// error responses must never be stored as a "success", or they poison the cache.
const isCacheableResponse = (response) =>
  Boolean(response) && response.status === 200 && response.type !== 'opaque' && response.type !== 'error';

const putInCache = (request, response) => {
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, response))
    .catch(() => {});
};

// Network-first: fresh data wins, fall back to cache when offline.
const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      putInCache(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
};

// Stale-while-revalidate: serve cache instantly, refresh in the background.
const staleWhileRevalidate = async (request) => {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        putInCache(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Kick off the background revalidation without blocking the response.
    network.catch(() => {});
    return cached;
  }

  const response = await network;
  if (response) return response;

  // Offline and nothing cached: provide a navigation fallback.
  if (request.mode === 'navigate') {
    const fallback = await caches.match('/');
    if (fallback) return fallback;
  }
  return Response.error();
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Network-first for data files (fresh prices/specs) and other cross-origin
  // requests (e.g. exchange-rate API). Avoids serving stale data.
  if (url.pathname.startsWith('/data/') || url.hostname !== self.location.hostname) {
    event.respondWith(
      networkFirst(request).catch(() => {
        if (request.mode === 'navigate') return caches.match('/');
        return Response.error();
      })
    );
    return;
  }

  // Stale-while-revalidate for same-origin static assets and manufacturer
  // images: instant repeat visits while still updating in the background.
  event.respondWith(staleWhileRevalidate(request));
});
