'use strict';
// Service Worker — OSRS Flip Finder
//
// History of the icon-caching approach and why we stopped:
//   v1/v2: Intercepted wiki image requests, tried mode:'cors' to get a
//          cacheable response. Turned out the wiki does NOT send
//          Access-Control-Allow-Origin for Special:Filepath URLs, so every
//          request threw a CORS error in the console, then fell back to
//          mode:'no-cors'. Opaque responses (status=0) can't be cached safely
//          (can't tell a 200 from a 429), so nothing was ever stored.
//          Worse: by intercepting the request the SW prevented the browser's
//          own HTTP cache from working, so every page render re-fetched every
//          icon from the network → 429 storms.
//   v4 (current): Don't intercept wiki image requests at all. Native
//          <img loading="lazy"> uses the browser's HTTP cache, which handles
//          cross-origin images correctly and caches them across page reloads.

// Bump version to purge all old caches (v3 and earlier had the broken logic).
const CACHE_NAME = 'osrs-app-v4';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
    caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

// No fetch handler — let all requests go through to the network / browser cache.
// The browser's HTTP cache handles wiki image caching natively and correctly.
