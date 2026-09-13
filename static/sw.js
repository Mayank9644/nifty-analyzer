// Antigravity Service Worker for PWA Offline Caching
const CACHE_NAME = 'agy-terminal-v7';
const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/utils.js',
  '/static/js/charts.js',
  '/static/js/recommendations.js',
  '/static/js/journal.js',
  '/static/js/sectors.js',
  '/static/js/backtest.js',
  '/static/js/institutional.js',
  '/static/js/broker_bridge.js',
  '/static/js/alerts.js',
  '/static/js/premarket.js',
  '/static/js/options_charts.js',
  '/static/js/scanner.js',
  '/static/js/screener.js',
  '/static/js/ipo.js',
  '/static/js/calendar.js',
  '/static/js/etf.js',
  '/static/js/bees.js',
  '/static/js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => console.log('Pre-cache partial error:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip API calls
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  const url = event.request.url;
  const isScriptOrDoc = url.endsWith('.js') || url.includes('.js?') || event.request.mode === 'navigate';

  if (isScriptOrDoc) {
    // Network-First for JS scripts and navigation to ensure user always gets fresh code
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first with background revalidation for other assets (CSS, images, fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
