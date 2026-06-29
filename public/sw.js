const CACHE = 'kali-v4';
const SHELL = [
  '/',
  '/manifest.json',
  '/kali-icon.svg',
  'https://unpkg.com/xterm@5.3.0/css/xterm.css',
  'https://unpkg.com/xterm@5.3.0/lib/xterm.js',
  'https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js',
  'https://cdn.socket.io/4.7.2/socket.io.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, {cache:'reload'}))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      });
      return cached || network;
    })
  );
});
