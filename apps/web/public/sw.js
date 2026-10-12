/*
 * Family Ledger service worker.
 * Caches ONLY same-origin static files under the app's base path (hashed
 * /assets/*, icons, manifest, offline page). Family financial data is never
 * cached: API calls, Supabase/cross-origin requests and anything carrying an
 * Authorization header always go straight to the network.
 */

"use strict";

var CACHE_NAME = "family-ledger-static-v1";

/**
 * Pure cache policy. Returns "static" (cache-first), "navigate"
 * (network-first, offline page fallback) or "bypass" (never touch the cache).
 * @param {{ method: string, url: string, mode?: string, headers?: { has(name: string): boolean } }} request
 * @param {{ origin: string, scopePath: string }} ctx
 */
function cacheDecision(request, ctx) {
  if (!request || request.method !== "GET") return "bypass";
  if (request.headers && typeof request.headers.has === "function" && request.headers.has("authorization")) {
    return "bypass";
  }
  var url;
  try {
    url = new URL(request.url);
  } catch {
    return "bypass";
  }
  if (url.origin !== ctx.origin) return "bypass";
  var scopePath = ctx.scopePath.endsWith("/") ? ctx.scopePath : ctx.scopePath + "/";
  if (url.pathname.indexOf(scopePath) !== 0) return "bypass";
  var rel = url.pathname.slice(scopePath.length);
  if (rel === "api" || rel.indexOf("api/") === 0 || url.pathname.indexOf("/api/") !== -1) return "bypass";
  if (url.pathname.indexOf("/auth/v1") !== -1 || url.pathname.indexOf("/rest/v1") !== -1) return "bypass";
  if (request.mode === "navigate") return "navigate";
  if (url.search) return "bypass";
  if (rel.indexOf("assets/") === 0 || rel.indexOf("icons/") === 0) return "static";
  if (rel === "manifest.webmanifest" || rel === "offline.html") return "static";
  return "bypass";
}

function scopeContext() {
  var scope = new URL(self.registration ? self.registration.scope : self.location.href);
  return { origin: scope.origin, scopePath: scope.pathname };
}

self.familyLedgerCacheDecision = cacheDecision;

self.addEventListener("install", function (event) {
  var ctx = scopeContext();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll([
          ctx.scopePath + "offline.html",
          ctx.scopePath + "manifest.webmanifest",
          ctx.scopePath + "icons/icon-192.png",
        ]);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== CACHE_NAME;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  var ctx = scopeContext();
  var decision = cacheDecision(event.request, ctx);
  if (decision === "bypass") return; // browser handles it; nothing is stored

  if (decision === "navigate") {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(ctx.scopePath + "offline.html");
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (response) {
        if (response && response.ok && response.type === "basic") {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      });
    }),
  );
});
