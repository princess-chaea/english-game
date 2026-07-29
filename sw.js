// VOCA HERO! Service Worker - Edge Request & Cache Optimization
const CACHE_NAME = 'vocahero-v12';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/male.txt',
  '/female.txt',
  '/js/config.js',
  '/js/main.js'
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
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// Fetch: Network-First for index.html, Cache-First for others
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('neis.go.kr') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('gstatic')
  ) {
    return;
  }

  if (url.origin === self.location.origin) {
    // index.html, js, css, manifest.json 은 항상 네트워크 우선
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json' || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
      event.respondWith(
        fetch(event.request).then(networkResp => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResp;
        }).catch(() => caches.match(event.request))
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          fetch(event.request).then(networkResp => {
            if (networkResp && networkResp.status === 200) {
              const clone = networkResp.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
          }).catch(() => {});
          return cached;
        }
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

