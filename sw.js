// Service worker: makes the app open offline and stay up to date.
//
// - The app's own files: fetched fresh when online, so an update shows up the next time the app
//   opens. If the network is unavailable or slower than 3 seconds, the saved copy is used instead.
// - vendor/ (barcode reader, screenshot text reader): large and only changed deliberately, so each
//   file is saved the first time it's used and served from the phone after that. Bump VENDOR_CACHE
//   whenever anything in vendor/ changes, so phones fetch the new files (see vendor/README.md).
// - Fonts (Google Fonts): saved once, then served from the phone.
// - Food searches (USDA, Open Food Facts) always go to the network and are never stored.
const CACHE = 'macro-tracker';
const VENDOR_CACHE = 'macro-tracker-vendor-1';
const APP_FILES = ['./', 'index.html', 'styles.css', 'app.js', 'nutrition-parser.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES)));
  self.skipWaiting(); // take over right away instead of waiting for every tab to close
});

self.addEventListener('activate', e => e.waitUntil((async () => {
  // Drop older vendor caches, and anything in the main cache that no longer belongs there:
  // files from hosts the app stopped using, and vendor/ files (they now live in VENDOR_CACHE).
  for (const name of await caches.keys()) if (name.startsWith('macro-tracker-vendor-') && name !== VENDOR_CACHE) await caches.delete(name);
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    const url = new URL(req.url);
    if ((url.hostname !== location.hostname && !CDN_HOSTS.includes(url.hostname)) || url.pathname.includes('/vendor/')) await cache.delete(req);
  }
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) e.respondWith(url.pathname.includes('/vendor/') ? savedOrFresh(req, VENDOR_CACHE) : freshOrSaved(req));
  else if (CDN_HOSTS.includes(url.hostname)) e.respondWith(savedOrFresh(req, CACHE));
  // anything else (food searches) isn't intercepted
});

async function freshOrSaved(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  network.catch(() => {}); // an offline failure is handled below
  try {
    return await Promise.race([network, new Promise((_, fail) => setTimeout(fail, 3000))]);
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || network; // no saved copy yet: keep waiting
  }
}

async function savedOrFresh(req, cacheName) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
