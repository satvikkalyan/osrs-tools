'use strict';
// Service Worker — OSRS Flip Finder
// Caches wiki item icons as they naturally load via <img> tags.
// No pre-fetching, no CORS issues — images are stored on first use and
// served instantly from cache on every subsequent page load.

const ICON_CACHE = 'osrs-icons-v1';

// Activate immediately and take control of all open tabs so the cache
// starts working without requiring a page reload.
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(
    // Purge stale caches from old SW versions, then claim existing clients.
    caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== ICON_CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

// Intercept fetch events for OSRS wiki image URLs only.
// All other requests (prices API, chart.js CDN, etc.) pass through untouched.
self.addEventListener('fetch', e => {
    const url = e.request.url;

    // Only cache image requests to the OSRS wiki
    const isWikiImage = url.includes('oldschool.runescape.wiki') && (
        url.includes('Special:Filepath') ||
        url.includes('Special:Redirect') ||
        url.includes('/images/')
    );
    if (!isWikiImage) return; // let everything else go straight to network

    e.respondWith(
        caches.open(ICON_CACHE).then(cache =>
            cache.match(e.request).then(cached => {
                if (cached) return cached; // cache hit — instant response

                // Cache miss — fetch from network, store result, then return it.
                return fetch(e.request).then(response => {
                    // Opaque responses (cross-origin) have type='opaque' and status=0.
                    // They're safe to cache for images — <img> onerror handles failures.
                    if (response && response.type !== 'error') {
                        cache.put(e.request, response.clone());
                    }
                    return response;
                }).catch(() => {
                    // Network failure — return a blank 204 so the <img> onerror fires
                    // and shows the placeholder instead of a broken spinner.
                    return new Response('', { status: 204 });
                });
            })
        )
    );
});
