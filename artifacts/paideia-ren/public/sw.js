/*
 * Self-destructing service worker.
 *
 * An earlier version of the marketing site registered a PWA service worker at
 * this path (/sw.js). The current site registers none, but that old worker
 * lingers in returning visitors' browsers and keeps serving a stale, precached
 * app shell, which showed old content and 404'd deep links like /products.
 *
 * This no-op worker takes over on the next update check, clears every cache,
 * unregisters itself, and reloads open tabs so they load fresh from the network.
 * Once a browser has run this, it holds no Synops service worker at all.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch (_) {
        /* ignore */
      }
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => {
        try {
          c.navigate(c.url);
        } catch (_) {
          /* ignore */
        }
      });
    })(),
  );
});
