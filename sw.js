/* =========================================================
   AMOS Report Generator — Service Worker
   غيّري رقم الإصدار CACHE_VERSION عند كل تحديث للملفات
   ========================================================= */
const CACHE_VERSION = 'amos-report-v1.2.0';
const CDN_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  CDN_XLSX
];

/* ---------- install: pre-cache the app shell ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // addAll fails entirely if one request fails, so cache items individually
    await Promise.all(APP_SHELL.map(async (url) => {
      try {
        const req = new Request(url, { cache: 'reload', mode: url.startsWith('http') ? 'cors' : 'same-origin' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
      } catch (e) { /* non-fatal: a missing item shouldn't block install */ }
    }));
  })());
});

/* ---------- activate: drop old caches ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------- allow the page to activate a waiting worker ---------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- fetch strategy ----------
   Navigations : network-first, fall back to cached index.html (offline)
   Everything  : cache-first, then network (and refresh the cache)
------------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && url.href !== CDN_XLSX) return; // let other cross-origin traffic pass through

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === 'opaque')) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
