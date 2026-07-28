// VOCA HERO! Service Worker - Edge Request & Cache Optimization
const CACHE_NAME = 'vocahero-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
  '/male.txt',
  '/female.txt'
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Cache-First for static assets, Network-First for API calls
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase, Google, NEIS API calls - always go to network
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('neis.go.kr') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('gstatic')
  ) {
    return; // Let browser handle normally
  }

  // Cache-First strategy for same-origin static files
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // Serve from cache, revalidate in background (stale-while-revalidate)
          const fetchPromise = fetch(event.request).then(networkResp => {
            if (networkResp && networkResp.status === 200) {
              const clone = networkResp.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return networkResp;
          }).catch(() => cached); // fallback to cache if offline
          return cached;
        }
        // Not in cache: fetch from network and store
        return fetch(event.request).then(networkResp => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResp;
        });
      })
    );
  }
});
