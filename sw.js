const CACHE = 'claudie-v9';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // No cachegem crides al worker (han d'anar sempre frescas)
  const url = new URL(e.request.url);
  if (url.pathname === '/chat' || url.pathname === '/state' || url.pathname === '/ping') return;
  if (url.hostname.includes('workers.dev')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
