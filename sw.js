// VOCA HERO! Service Worker - Edge Request & Cache Optimization
const CACHE_NAME = 'vocahero-v122';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/privacy',
  '/terms',
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

// Fetch: Cache-First for versioned JS/static assets, Network-First for navigation/HTML/Manifest
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
    // 화면 HTML과 manifest는 네트워크 우선 (업데이트 반영)
    if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/privacy' || url.pathname === '/terms' || url.pathname === '/manifest.json') {
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

    // JS는 쿼리 버전이 바뀌면 URL도 달라집니다. 같은 버전은 캐시에서 재사용해 전송량을 줄입니다.
    if (url.pathname.startsWith('/js/')) {
      event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request).then(networkResp => {
          if (networkResp && networkResp.status === 200) {
            const toCache = networkResp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
          }
          return networkResp;
        }))
      );
      return;
    }

    // 버전이 바뀌지 않는 이미지·폰트는 캐시 우선. 불필요한 백그라운드 재다운로드를 하지 않습니다.
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(networkResp => {
        if (networkResp && networkResp.status === 200) {
          const toCache = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        }
        return networkResp;
      }))
    );
  }
});
