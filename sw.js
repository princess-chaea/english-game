// VOCA HERO! Service Worker - KILL SWITCH v7
// 모든 캐시를 삭제하고 서비스 워커 자체를 완전 해제합니다
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        console.log('[SW] Deleting cache:', key);
        return caches.delete(key);
      }))
    ).then(() => {
      console.log('[SW] All caches cleared. Unregistering service worker...');
      return self.registration.unregister();
    }).then(() => {
      console.log('[SW] Service worker unregistered. Reloading all clients...');
      return self.clients.matchAll({ type: 'window' });
    }).then(clients => {
      clients.forEach(client => {
        client.navigate(client.url);
      });
    })
  );
  self.clients.claim();
});

// 모든 요청을 네트워크로 직접 통과 (캐시 완전 우회)
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
