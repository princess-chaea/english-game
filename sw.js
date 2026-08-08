// VOCA HERO! Service Worker - Edge Request & Cache Optimization
const CACHE_NAME = 'vocahero-v26';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/media/logo_v2.webp'
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

// Fetch: Stale-While-Revalidate for JS/CSS/Assets, Network-First for HTML/Manifest
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
    // index.html 및 manifest.json 은 네트워크 우선 (업데이트 반영)
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json') {
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

    // 게임 로직은 항상 네트워크 우선으로 가져와 배포 뒤 이전 인증·보안 코드가 남지 않게 합니다.
    if (url.pathname.startsWith('/js/')) {
      event.respondWith(
        fetch(event.request).then(networkResp => {
          if (networkResp && networkResp.status === 200) caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResp.clone()));
          return networkResp;
        }).catch(() => caches.match(event.request))
      );
      return;
    }

    // 이미지·폰트 등 정적 자산은 캐시 우선 후 백그라운드 갱신
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
