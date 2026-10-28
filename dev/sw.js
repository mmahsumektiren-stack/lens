// Lens Capture service worker — uygulama kabuğunu önbelleğe alır, offline açılış sağlar.
// Asıl Lens (/lens/) ve test kopyası (/lens/dev/) aynı sitede: önbellekleri ayrı adlarla tutulur, birbirine dokunmaz.
const BASE = new URL('./', self.location).pathname;
const PREFIX = /\/dev\/$/.test(BASE) ? 'lensdev-' : 'lens-';
const VERSION = PREFIX + 'v32';
const SHELL = [
  './',
  './index.html',
  './styles.css?v=32',
  './app.js?v=32',
  './reader.js?v=32',
  './sources.js?v=32',
  './reader-extras.js?v=32',
  './discover.js?v=32',
  './icons.js?v=32',
  './readability.js?v=32',
  './page-extract.js?v=32',
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Gemini vb. dış istekler ağdan gider
  if (PREFIX === 'lens-' && url.pathname.startsWith(BASE + 'dev/')) return; // test kopyası kendi işine baksın

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
