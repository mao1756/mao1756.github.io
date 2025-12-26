/**
 * Service worker for Timekeeping.
 *
 * Why this exists:
 * - Allow the app to keep working offline / on flaky connections.
 *
 * Important implementation detail:
 * - We use **network-first** for navigations (HTML) so users don't get stuck
 *   with an old cached `index.html` after a redeploy (a common “blank page” issue
 *   when Vite asset hashes change).
 */

const CACHE_NAME = 'timekeeping-v5';

// Build absolute URLs inside the SW scope so cache keys are consistent.
const SCOPE = self.registration.scope;
const scopeUrl = (path) => new URL(path, SCOPE).toString();

const INDEX_URL = scopeUrl('index.html');
const CORE_ASSETS = [
  scopeUrl('./'),
  INDEX_URL,
  scopeUrl('manifest.webmanifest'),
  scopeUrl('icon.svg'),
  // Handoff helper (optional UI, but nice to have available offline once installed).
  scopeUrl('handoff.js')
];

self.addEventListener('install', (event) => {
  // Activate the updated SW as soon as it's installed.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('timekeeping-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Only handle requests within this service worker's scope.
  const url = new URL(request.url);
  if (!url.href.startsWith(SCOPE)) return;

  const accept = request.headers.get('accept') || '';
  const isNavigation = request.mode === 'navigate' || accept.includes('text/html');

  if (isNavigation) {
    // Network-first for HTML so deployments don't get stuck on a cached index.html.
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(INDEX_URL, response.clone());
          return response;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(INDEX_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first for static assets (JS/CSS/images). Hashed filenames mean this is safe.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })()
  );
});
