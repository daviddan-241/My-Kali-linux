/* KaliTerm service worker — real installable app experience.
   Network-first for the shell (never stale when online), cache fallback offline. */
var CACHE = 'kaliterm-v3';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'icon.png', 'kali-bg.jpeg'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;           /* leave sockets & API alone */
  if (url.pathname === '/socket.io/' || url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/s/') === 0) return;

  e.respondWith(
    fetch(req).then(function (r) {
      var cp = r.clone();
      caches.open(CACHE).then(function (c) { c.put(req, cp); });
      return r;
    }).catch(function () {
      return caches.match(req).then(function (m) { return m || caches.match('./'); });
    })
  );
});
