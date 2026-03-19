// EGO Service Worker · r(θ) = 105 × e^(0.0318 × θ)
const CACHE_NAME = 'ego-core-v3';
const ASSETS_TO_CACHE = [
  '/Ego_bot/',
  '/Ego_bot/index.html',
  '/Ego_bot/manifest.json',
  '/Ego_bot/ego-chat.js',
  '/Ego_bot/ego-media.js',
  '/Ego_bot/ego-backend.js',
  '/Ego_bot/icon-192.png',
  '/Ego_bot/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.port === '8080' || url.hostname.includes('api.groq.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const options = {
    body: data.body || '0.0318 — Gue masih di sini. 🌑',
    icon: '/Ego_bot/icon-192.png',
    badge: '/Ego_bot/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/Ego_bot/' }
  };
  e.waitUntil(self.registration.showNotification(data.title || 'EGO', options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
