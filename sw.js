// Service worker: network-first for this site's files (so updates show right
// away), falling back to the cache when offline or when the network is too
// slow. Bump VERSION on each release.
const VERSION = 'v5';
const NETWORK_TIMEOUT_MS = 3000;
const CACHE = `cube-coach-${VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'lib/three.module.min.js',
  'src/app.js',
  'src/core/puzzle.js',
  'src/core/notation.js',
  'src/core/store.js',
  'src/puzzles/nxn/index.js',
  'src/puzzles/nxn/state.js',
  'src/puzzles/nxn/pieces.js',
  'src/puzzles/nxn/validate.js',
  'src/puzzles/nxn/algs.js',
  'src/puzzles/nxn/lessons.js',
  'src/puzzles/nxn/parityText.js',
  'src/puzzles/nxn/solver/index.js',
  'src/puzzles/nxn/solver/client.js',
  'src/puzzles/nxn/solver/worker.js',
  'src/puzzles/nxn/solver/search.js',
  'src/puzzles/nxn/solver/centers.js',
  'src/puzzles/nxn/solver/edges.js',
  'src/puzzles/nxn/solver/parity.js',
  'src/puzzles/nxn/solver/reduce.js',
  'src/puzzles/nxn/solver/three.js',
  'src/puzzles/nxn/solver/evenParity.js',
  'src/ui/cube3d.js',
  'src/ui/net2d.js',
  'src/ui/faceEditor.js',
  'src/ui/camera.js',
  'src/ui/colorClassify.js',
  'src/ui/screens/home.js',
  'src/ui/screens/learn.js',
  'src/ui/screens/algorithms.js',
  'src/ui/screens/solve.js',
  'src/ui/screens/follow.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache each file on its own so one missing file never breaks install.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch { /* skip */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    });
    // Keep the network fetch alive (it refreshes the cache) even if we answer from cache.
    event.waitUntil(network.catch(() => {}));

    const cached = () => cache.match(req, { ignoreSearch: true }).then(async (hit) => {
      if (hit || req.mode !== 'navigate') return hit;
      return await cache.match('index.html') || await cache.match('./');
    });

    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), NETWORK_TIMEOUT_MS); });
    try {
      const first = await Promise.race([network, timeout]);
      if (first !== 'timeout') return first;
      // Network is slow: use the cached copy if there is one, else keep waiting.
      const hit = await cached();
      return hit || await network;
    } catch {
      const hit = await cached();
      if (hit) return hit;
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    } finally {
      clearTimeout(timer);
    }
  })());
});
