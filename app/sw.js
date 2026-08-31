/* Trekkr Player PWA — service worker. Cache the app shell for offline/instant
   load; never cache API or auth (always network). Bump CACHE to invalidate. */
var CACHE = "trekkr-app-v16";
var SHELL = [
  "/app",
  "/app/",
  "/app/index.html",
  "/app/app.css",
  "/app/app.js",
  "/app/api.js",
  "/app/manifest.webmanifest",
  "/app/icons/icon-192.png",
  "/app/icons/icon-512.png",
  "/app/icons/apple-touch-icon.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Never cache API or Supabase — always hit the network.
  if (url.pathname.indexOf("/api/") === 0 || url.hostname.indexOf("supabase.co") !== -1) return;

  // App-shell (same-origin under /app): cache-first, fall back to network.
  if (url.origin === location.origin && url.pathname.indexOf("/app") === 0) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy).catch(function () {}); });
          return res;
        }).catch(function () { return caches.match("/app/index.html"); });
      })
    );
  }
});
