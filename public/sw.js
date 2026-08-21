"use strict";

// Service Worker for Trạm Chữ — Offline shell and chapter caching.
// Dynamic cache version generated at build time.

const CACHE_NAME = "tramchu-mt2q1dmj-57e6fe";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/library/covers/night-temple.webp",
  "/library/covers/misty-pagoda.webp",
  "/library/covers/lantern-temple.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_ALL_CACHES") {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and auth/admin routes
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // 1. HTML Navigation or root -> Network-First (always get latest HTML & bundled assets)
  if (event.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
              cache.put("/index.html", res.clone());
            });
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const rootCached = await caches.match("/index.html");
          if (rootCached) return rootCached;
          return new Response("Bạn đang ngoại tuyến. Vui lòng kết nối mạng để tải truyện.", {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        })
    );
    return;
  }

  // 2. Catalog or library manifest -> Network-First (always fetch latest novel list)
  if (url.pathname.includes("/catalog/") || url.pathname.endsWith("library.json")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Chapter content from CDN / R2 -> Cache-First (immutable versioned chapters)
  if (url.pathname.includes("/ch/") || url.pathname.includes("/chapters/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res.ok) {
            cache.put(event.request, res.clone());
          }
          return res;
        } catch {
          return cached || new Response(JSON.stringify({ error: "Offline" }), { status: 503 });
        }
      })
    );
    return;
  }

  // 4. Immutable hashed JS/CSS assets (e.g. /app.js?v=..., /style.css?v=...) -> Cache-First with Network fallback
  if (url.searchParams.has("v") || url.pathname.startsWith("/vendor/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 5. Default -> Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networked;
    })
  );
});
