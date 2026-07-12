// ─── Service Worker for 今週末どこいく？SG ───
const CACHE_NAME = 'sg-weekend-v591';
const STATIC_ASSETS = [
  '/manifest.json',
  '/app.css',
  '/app.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Noto+Sans+JP:wght@300;400;500;700&family=DM+Serif+Display:ital@0;1&display=swap',
];

// ── Install: cache static assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('Cache addAll partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches, notify clients if this is an update ──
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldKeys = keys.filter(key => key !== CACHE_NAME);
    const isUpdate = oldKeys.length > 0;
    await Promise.all(oldKeys.map(key => caches.delete(key)));
    await self.clients.claim(); // claim してから matchAll しないと空配列になる
    if (isUpdate) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
    }
  })());
});

// ── Fetch: Network-first for API, Cache-first for static ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls: Network-only (real-time data needed)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'オフラインです。ネットワーク接続を確認してください。' }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // HTMLナビゲーション（index.html等）: Network-first（常に最新を取得）
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // その他の静的アセット: Cache-first, fallback to network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Cache successful responses for static files
        if (response.ok && (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => undefined);
    })
  );
});

// ── Push notifications ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'おでかけNavi', {
      body: data.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag: 'sg-weekend',
      renotify: true,
      data: data.data || {},
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'GET_VERSION') {
    event.source.postMessage({ type: 'SW_VERSION', version: CACHE_NAME });
  }
});
