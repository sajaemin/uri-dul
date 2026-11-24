// 우리 둘 service worker: always loads the newest app files (falls back to the last copy when offline),
// shows push notifications and opens the right tab when one is tapped.
const CACHE = 'ud-app';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, {cache: 'no-cache'});
      if (res.ok && !req.url.includes('version.json')) { const c = await caches.open(CACHE); c.put(req, res.clone()).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, {ignoreSearch: req.mode === 'navigate'});
      if (hit) return hit;
      throw err;
    }
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {body: e.data ? e.data.text() : ''}; }
  const title = d.title || '우리 둘';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: {url: new URL(d.url || './', self.registration.scope).href},
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        try { await w.navigate(url); } catch (err) {}
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
