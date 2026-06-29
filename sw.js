'use strict';
// Service Worker — OSRS Flip Finder
// Caches wiki item icons persistently so repeat visits need zero wiki requests.
//
// The key problem with wiki images:
//   <img> requests go out as mode:'no-cors' → responses are opaque (status=0).
//   We can never tell if status was 200 or 429 from an opaque response.
//   Caching opaque responses risks persisting a 429 forever.
//
// Fix: we intercept and re-fetch using mode:'cors' to get real status codes.
// If the wiki sends CORS headers (it does for images), we get a proper response
// we can inspect and cache. If CORS fails, we fall through to no-cors and let
// the browser's own HTTP cache handle it (no SW caching for that response).

const ICON_CACHE  = 'osrs-icons-v3'; // bumped — purges old (potentially bad) v2 cache
const CACHE_TTL_S = 7 * 24 * 60 * 60; // serve cached icons for 7 days

// Activate immediately, purge stale cache versions.
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
    caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== ICON_CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

// ---------- Throttle queue (prevents burst to wiki on cold cache) ----------
const MAX_CONCURRENT = 3;
let inFlight = 0;
const queue  = [];

function drainQueue() {
    while (inFlight < MAX_CONCURRENT && queue.length) {
        const { url, resolve } = queue.shift();
        inFlight++;
        fetchWithRetry(url)
            .then(r  => { inFlight--; drainQueue(); resolve(r);  })
            .catch(() => { inFlight--; drainQueue(); resolve(new Response('', { status: 204 })); });
    }
}

function enqueue(url) {
    return new Promise(resolve => {
        queue.push({ url, resolve });
        drainQueue();
    });
}

// ---------- Fetch with CORS → no-cors fallback + retry on 429 ----------
const RETRY_DELAYS = [1500, 3000, 6000];

async function fetchWithRetry(url) {
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        if (attempt > 0) {
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
        }

        // 1. Try CORS mode — gives us real status codes and cacheable responses.
        try {
            const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (res.status === 429) continue;    // rate limited — retry
            if (res.ok) return res;              // got a real 200, cacheable
        } catch (_) {
            // CORS rejected (wiki doesn't send CORS headers for this URL) — fall through
        }

        // 2. Fall back to no-cors — opaque response, cannot verify status.
        //    We don't cache this; browser's HTTP cache will handle repeat requests.
        try {
            const res = await fetch(url, { mode: 'no-cors' });
            if (res.type === 'opaque') return res; // pass through, no SW caching
        } catch (_) { /* network error */ }
    }

    return new Response('', { status: 204 }); // give up gracefully
}

// ---------- Intercept wiki image requests ----------
self.addEventListener('fetch', e => {
    const url = e.request.url;

    const isWikiImage = url.includes('oldschool.runescape.wiki') && (
        url.includes('Special:Filepath') ||
        url.includes('Special:Redirect') ||
        url.includes('/images/')
    );
    if (!isWikiImage) return;

    e.respondWith(async function () {
        const cache = await caches.open(ICON_CACHE);

        // Cache hit — serve immediately (7-day TTL)
        const cached = await cache.match(url);
        if (cached) {
            const age = Date.now() - new Date(cached.headers.get('sw-cached-at') || 0).getTime();
            if (age < CACHE_TTL_S * 1000) return cached;
            cache.delete(url); // expired
        }

        // Cache miss — fetch (throttled)
        const response = await enqueue(url);

        // Only cache real (non-opaque) successful responses
        if (response.ok && response.type !== 'opaque') {
            // Stamp the response with our own cache timestamp header
            const headers = new Headers(response.headers);
            headers.set('sw-cached-at', new Date().toUTCString());
            const stamped = new Response(await response.clone().blob(), { headers });
            cache.put(url, stamped);
        }

        return response;
    }());
});
