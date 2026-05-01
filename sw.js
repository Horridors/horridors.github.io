// Horridors — Service Worker (offline cache)
// Cache-first strategy for static assets. Bump CACHE_VERSION on any meaningful change.
const CACHE_VERSION = 'horridors-v25-clutter-cleanup';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './shared-audio.js',
  './shared-music.js',
  './shared-story.js',
  './shared-tasks.js',
  './shared-wallet.js',
  './shared-sprites.js',
  './shared-touch.js',
  './difficulty.js',
  './fullscreen.js',
  './pwa-register.js',
  './game.js',
  './level2.js',
  './level3.js',
  './level4.js',
  './level5.js',
  './level6.js',
  './level7.js',
  './level8.js',
  './credits.js',
  './characters/chester.png',
  './characters/mum.png',
  './characters/thistle.png',
  './characters/grinpatch.png',
  './characters/hollow.png',
  './characters/drip.png',
  './characters/inkybin.png',
  './characters/expreshon.png',
  './characters/exlena.png',
  './characters/sockyshok.png',
  './characters/blacky.png',
  './characters/cast-poster.png',
  './og-image.png',
  './logo.svg',
  './logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML / JS / CSS so code updates apply immediately
  // when the user is online. Falls back to cache when offline.
  // Images and other static assets use cache-first for speed.
  const path = url.pathname;
  const isCode = /\.(html|js|css|webmanifest)$/.test(path) || path === '/' || path.endsWith('/');

  if (isCode) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for images, fonts, icons
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
