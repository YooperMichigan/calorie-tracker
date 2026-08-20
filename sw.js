// Bump this version string whenever app files change, so clients pick up the update.
const CACHE_NAME = "calorie-tracker-v26";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/db.js",
  "./js/utils.js",
  "./js/foodApi.js",
  "./js/barcode.js",
  "./js/charts.js",
  "./js/backup.js",
  "./js/app.js",
  "./vendor/html5-qrcode.min.js",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/favicon-32.png",
  "./icons/glyph-header.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        // Manual fetch + put (rather than cache.addAll, which doesn't take
        // per-request options) so precaching can't silently pull a
        // browser-HTTP-cached stale copy either.
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: "no-store" }).then((res) => cache.put(url, res))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for same-origin GET requests: always try the network so you
// get the current deployed code while online (this app updates fairly
// often), and only fall back to the cache when there's no network — which is
// the one case offline support actually needs to cover. Cross-origin
// requests (e.g. Open Food Facts API lookups) are left alone so they hit the
// network directly and fail gracefully in the app when offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // cache: "no-store" so this always goes to the network instead of being
  // silently satisfied by the browser's own HTTP cache (GitHub Pages sends
  // Cache-Control: max-age=600 on these files) — otherwise "network-first"
  // can still serve a response up to 10 minutes stale.
  event.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
