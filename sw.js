'use strict';
// Service Worker — OSRS Flip Finder
// Caches wiki item icons as they naturally load via <img> tags.
// Throttles outbound requests to the wiki to avoid 429s on cold cache.

const ICON_CACHE = 'osrs-icons-v2'; // bump version to purge old cache

// Activate immediately and take control of all open tabs.
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
    caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== ICON_CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
));

// ---------- Throttled fetch queue ----------
// The browser fires all <img> requests at once; without throttling, the wiki
// CDN 429s after ~50 simultaneous requests. We queue them here and send at
// most MAX_CONCURRENT at a time so the wiki never sees a burst.
const MAX_CONCURRENT = 4;
let inFlight = 0;
const queue  = [];

function drainQueue() {
    while (inFlight < MAX_CONCURRENT && queue.length) {
        const { request, resolve, reject } = queue.shift();
        inFlight++;
        fetchAndCache(request)
            .then(r  => { inFlight--; drainQueue(); resolve(r);  })
            .catch(e => { inFlight--; drainQueue(); reject(e);   });
    }
}

function throttledFetch(request) {
    return new Promise((resolve, reject) => {
        queue.push({ request, resolve, reject });
        drainQueue();
    });
}

// Fetch from network (with one retry on 429) and store in cache.
async function fetchAndCache(request) {
    const cache = await caches.open(ICON_CACHE);

    let response = await fetch(request).catch(() => null);

    // 429 — wait 1.5 s and retry once before giving up
    if (!response || response.status === 429) {
        await new Promise(r => setTimeout(r, 1500));
        response = await fetch(request).catch(() => null);
    }

    if (response && response.type !== 'error' && response.status !== 429) {
        cache.put(request, response.clone());
        return response;
    }

    // Give up — return empty 204 so <img onerror> fires gracefully
    return new Response('', { status: 204 });
}

// ---------- Intercept fetch ----------
self.addEventListener('fetch', e => {
    const url = e.request.url;

    const isWikiImage = url.includes('oldschool.runescape.wiki') && (
        url.includes('Special:Filepath') ||
        url.includes('Special:Redirect') ||
        url.includes('/images/')
    );
    if (!isWikiImage) return;

    e.respondWith(
        caches.open(ICON_CACHE).then(cache =>
            cache.match(e.request).then(cached => {
                if (cached) return cached; // instant cache hit
                return throttledFetch(e.request); // queued network fetch
            })
        )
    );
});
