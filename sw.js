// Service worker: makes the app open offline and stay up to date.
//
// - The app's own files: fetched fresh when online, so an update shows up the next time the app
//   opens. If the network is unavailable or slower than 3 seconds, the saved copy is used instead.
// - Fonts and the barcode reader (fixed versions on CDNs): saved once, then served from the phone.
// - Food searches (USDA, Open Food Facts) always go to the network and are never stored.
const CACHE = 'macro-tracker';
const APP_FILES = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES)));
  self.skipWaiting(); // take over right away instead of waiting for every tab to close
});

self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) e.respondWith(freshOrSaved(req));
  else if (CDN_HOSTS.includes(url.hostname)) e.respondWith(savedOrFresh(req));
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

async function savedOrFresh(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
