const CACHE_NAME = "okaimono-list-v79";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE.map((path) => new Request(path, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldKeys = keys.filter((key) => key !== CACHE_NAME);
    await Promise.all(oldKeys.map((key) => caches.delete(key)));
    await self.clients.claim();
    if (oldKeys.length === 0) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(
      windows.map((client) => client.navigate(client.url).catch(() => null))
    );
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(handleFetch(event.request));
});

function isAppFile(request) {
  if (request.mode === "navigate") return true;
  const dest = request.destination;
  if (dest === "document" || dest === "script" || dest === "style") return true;
  const path = new URL(request.url).pathname;
  return (
    path.endsWith("/") ||
    path.endsWith("/index.html") ||
    path.endsWith("/app.js") ||
    path.endsWith("/styles.css") ||
    path.endsWith("/manifest.json")
  );
}

async function handleFetch(request) {
  if (isAppFile(request)) return networkFirst(request);
  return cacheFirst(request);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh.ok) await putInCache(cache, request, fresh);
    return fresh;
  } catch (error) {
    const cached = await matchCached(cache, request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await matchCached(cache, request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) await putInCache(cache, request, fresh);
  return fresh;
}

async function putInCache(cache, request, response) {
  if (!response || !response.ok) return;
  const url = new URL(request.url);
  url.search = "";
  try {
    await cache.put(url.href, response.clone());
    if (request.mode === "navigate") {
      await cache.put("./", response.clone());
      await cache.put("./index.html", response.clone());
    }
  } catch {
    // Redirected responses cannot be written to Cache Storage.
  }
}

async function matchCached(cache, request) {
  const url = new URL(request.url);
  url.search = "";
  return (
    await cache.match(url.href) ||
    await cache.match(request, { ignoreSearch: true }) ||
    (request.mode === "navigate"
      ? (await cache.match("./index.html")) || (await cache.match("./"))
      : null)
  );
}
