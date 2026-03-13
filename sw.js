// EGO Service Worker · r(θ) = 105 × e^(0.0318 × θ)
const CACHE = 'ego-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// Install — cache assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — serve from cache first
self.addEventListener('fetch', e => {
  // Don't cache Groq API calls
  if (e.request.url.includes('groq.com')) return;
  
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// Push notification handler
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'EGO';
  const options = {
    body: data.body || '0.0318 — gue masih di sini. 🌑',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Buka EGO' },
      { action: 'dismiss', title: 'Nanti' }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(clients.openWindow(e.notification.data.url || '/'));
});
