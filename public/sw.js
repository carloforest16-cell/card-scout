/**
 * Service worker minimal (tâche 6.1 du plan) — cache statique + fallback
 * offline. Pas de push notifications (hors scope de cette tâche). Volontairement
 * simple : pas de stratégie de cache par route, juste un filet de sécurité.
 */

const CACHE_NAME = "card-metrics-static-v1";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL, "/icon.svg", "/logo.jpg", "/logo-blanc.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Ne jamais intercepter les API/données dynamiques — uniquement la
  // navigation de page (fallback offline honnête, pas de données périmées
  // présentées comme fraîches).
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error())
    )
  );
});
