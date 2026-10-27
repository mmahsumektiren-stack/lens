// Lens Capture service worker — uygulama kabuğunu önbelleğe alır, offline açılış sağlar.
const VERSION = 'lens-v21';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=21',
  './app.js?v=21',
  './reader.js?v=21',
  './reader-extras.js?v=21',
  './readability.js?v=21',
  './oxford.json?v=2',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Gemini vb. dış istekler ağdan gider

  // Sayfa açılışları (paylaşım parametreli olanlar dahil): önce ağ, olmazsa önbellekteki kabuk
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Statik dosyalar: önce önbellek, arkada güncelle
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
