// Horridors — Service Worker (offline cache)
// Cache-first strategy for static assets. Bump CACHE_VERSION on any meaningful change.
const CACHE_VERSION = 'horridors-v34-load-glitch';
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
  './shared-leaderboard.js',
  './shared-sprites.js',
  './props.js',
  // v1.2.5 L1 painterly props
  './props/sp_locker1_red.png',
  './props/sp_locker2_green.png',
  './props/sp_locker3_blue.png',
  './props/sp_crate1.png',
  './props/sp_shelf.png',
  './props/sp_barrel.png',
  './props/sp_mop.png',
  './props/sp_box.png',
  './props/sp_table.png',
  './props/toy_bed.png',
  './props/toy_chest.png',
  './props/toy_shelf.png',
  './props/toy_blocks.png',
  './props/toy_horse.png',
  './props/toy_dollhse.png',
  './props/toy_drawer.png',
  './props/toy_rug.png',
  './props/pz_panel.png',
  './props/pz_table.png',
  './props/pz_chair.png',
  './props/pz_cab1.png',
  './props/pz_basket.png',
  './props/pz_clock.png',
  './props/lb_shelf.png',
  './props/lb_desk.png',
  './props/lb_globe.png',
  './props/lb_bin.png',
  './props/tr_chest.png',
  './props/sh_door.png',
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
