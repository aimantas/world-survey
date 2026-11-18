// World Survey service worker. Network first, so a live visitor always gets the current build;
// the cache answers only when the network does not, which makes the game playable offline after one visit.
const VERSION = '__VERSION__';
const CORE = __CORE__;
const CACHE = `ws-${VERSION}`;
// Zoom detail and the 8k relief are large and fetched on demand: they are never stored.
const SKIP = /\/assets\/(elevation-18k-|relief-8k)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ws-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function respond(request) {
  const cache = await caches.open(CACHE);
  const navigation = request.mode === 'navigate';
  try {
    // A page load on a dead connection should fall back quickly; assets may take their time.
    const response = await (navigation ? Promise.race([fetch(request), timeout(6000)]) : fetch(request));
    if (response.ok && response.type === 'basic') cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    // Any game URL can boot from the home shell: the router reads the address.
    if (navigation) {
      const shell = await cache.match('/');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;
  event.respondWith(respond(request));
});
