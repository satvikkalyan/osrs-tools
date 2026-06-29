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

// ---------- IndexedDB Icon Cache ----------
// Stores item icon blobs locally so we skip 3 redirects per icon on every load.
// Falls back to the Special:Filepath URL if anything fails.
const ICON_DB_NAME    = 'osrs-icon-cache';
const ICON_DB_VERSION = 1;
const ICON_STORE_NAME = 'icons';
const ICON_BATCH_SIZE = 20; // concurrent fetches during pre-cache

let iconDB = null;
const iconObjectURLs = new Map(); // iconName → objectURL (in-memory, rebuilt each session)

function openIconDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(ICON_DB_NAME, ICON_DB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(ICON_STORE_NAME);
        req.onsuccess  = e => resolve(e.target.result);
        req.onerror    = e => reject(e.target.error);
    });
}

async function initIconCache() {
    try {
        iconDB = await openIconDB();
        const tx    = iconDB.transaction(ICON_STORE_NAME, 'readonly');
        const store = tx.objectStore(ICON_STORE_NAME);
        const [blobs, keys] = await Promise.all([
            new Promise((res, rej) => { const r = store.getAll();     r.onsuccess = e => res(e.target.result); r.onerror = rej; }),
            new Promise((res, rej) => { const r = store.getAllKeys(); r.onsuccess = e => res(e.target.result); r.onerror = rej; }),
        ]);
        keys.forEach((name, i) => iconObjectURLs.set(name, URL.createObjectURL(blobs[i])));
    } catch (e) {
        console.warn('Icon cache init failed:', e);
    }
}

function getIconSrc(iconName) {
    if (!iconName) return '';
    if (iconObjectURLs.has(iconName)) return iconObjectURLs.get(iconName);
    return ICON_BASE + encodeURIComponent(iconName);
}

async function storeIconBlob(name, blob) {
    if (!iconDB) return;
    return new Promise((resolve, reject) => {
        const tx = iconDB.transaction(ICON_STORE_NAME, 'readwrite');
        tx.objectStore(ICON_STORE_NAME).put(blob, name);
        tx.oncomplete = resolve;
        tx.onerror    = reject;
    });
}

async function preCacheIcons(mapping) {
    if (!iconDB) return;
    const names    = [...new Set(Object.values(mapping).map(i => i.icon).filter(Boolean))];
    const uncached = names.filter(n => !iconObjectURLs.has(n));
    if (!uncached.length) return;
    for (let i = 0; i < uncached.length; i += ICON_BATCH_SIZE) {
        const batch = uncached.slice(i, i + ICON_BATCH_SIZE);
        await Promise.all(batch.map(async name => {
            try {
                const blob = await fetch(ICON_BASE + encodeURIComponent(name)).then(r => r.blob());
                await storeIconBlob(name, blob);
                iconObjectURLs.set(name, URL.createObjectURL(blob));
            } catch (e) { /* non-fatal — will retry next session */ }
        }));
    }
}
