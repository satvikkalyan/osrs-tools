'use strict';
// ---------- localStorage cache ----------
// The /mapping endpoint (~200 KB) changes only when Jagex adds new items —
// cache it for 24 hours. The /24h volume data changes hourly — cache for 1 hour.
// /latest and /1h are the live feeds that drive flip decisions; always fetch fresh.
const CACHE_MAPPING_KEY = 'osrs-cache-mapping';
const CACHE_DAILY_KEY   = 'osrs-cache-daily';
const CACHE_MAPPING_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DAILY_TTL   =      60 * 60 * 1000;  //  1 hour

function lsGet(key, ttlMs) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { data, cachedAt } = JSON.parse(raw);
        if (Date.now() - cachedAt > ttlMs) return null; // expired
        return data;
    } catch (e) { return null; }
}

function lsSet(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }));
    } catch (e) { /* quota exceeded — non-fatal, next load will just re-fetch */ }
}

// ---------- Icon URLs ----------
// Icons are served as regular <img> tags using the wiki's Special:Filepath
// redirect. The browser loads only what's on screen (loading="lazy") and caches
// via HTTP, so no pre-fetching is needed or wanted.
//
// IMPORTANT: Do NOT use fetch() on these URLs — the wiki CDN doesn't send
// CORS headers, so blob-caching attempts will be blocked cross-origin and cause
// 429s from the sheer volume of requests.
function getIconSrc(iconName) {
    if (!iconName) return '';
    return ICON_BASE + encodeURIComponent(iconName);
}
