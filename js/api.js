'use strict';
// ---------- API ----------
async function fetchData() {
    setLoading();

    // Check what we have cached so we can update the loading message.
    const cachedMapping = lsGet(CACHE_MAPPING_KEY, CACHE_MAPPING_TTL);
    const cachedDaily   = lsGet(CACHE_DAILY_KEY,   CACHE_DAILY_TTL);

    // Update the spinner text so the user knows what's actually being fetched.
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        const fetching = ['prices'];
        if (!cachedMapping) fetching.push('item mapping (~200 KB, cached 24 h)');
        if (!cachedDaily)   fetching.push('24 h volume (cached 1 h)');
        loadingEl.innerHTML = `<span class="spinner"></span>Fetching ${fetching.join(', ')} from OSRS Wiki…`;
    }

    try {
        // /latest and /1h change every minute — always fetch live.
        // /mapping and /24h are served from cache when still fresh, saving
        // ~200 KB + one extra round-trip on every page load / auto-refresh.
        const [latest, hourly, mappingRes, dailyRes] = await Promise.all([
            fetchJson(`${API_BASE}/latest`),
            fetchJson(`${API_BASE}/1h`),
            cachedMapping ? Promise.resolve(null) : fetchJson(`${API_BASE}/mapping`),
            cachedDaily   ? Promise.resolve(null) : fetchJson(`${API_BASE}/24h`),
        ]);

        const mapping   = cachedMapping ?? mappingRes;
        const dailyData = cachedDaily   ?? dailyRes.data;

        // Persist to localStorage for next load / next refresh.
        if (!cachedMapping && mapping)   lsSet(CACHE_MAPPING_KEY, mapping);
        if (!cachedDaily   && dailyData) lsSet(CACHE_DAILY_KEY,   dailyData);

        apiCache.mapping = mapping;
        apiCache.hourly  = hourly.data;
        apiCache.daily   = dailyData;
        apiCache.latest  = latest.data;

        state.items       = computeFlips(mapping, latest.data, hourly.data, dailyData);
        // Search pool covers all items with any price data, not just profitable ones.
        state.searchItems = buildSearchItems(mapping, latest.data);
        state.fetchedAt   = Date.now();
        hideError();
        render();
        updatePriceHistoryAndDetect(state.items);
        computeDecants(mapping, latest.data);
        renderDecantTab();
        computeRepairs(mapping, latest.data);
        renderRepairTab();
        if (typeof onDataRefreshed === 'function') onDataRefreshed();
    } catch (err) {
        console.error('Flip Finder load failed:', err);
        showError(`Couldn't load prices: ${err.message || err}`);
    }
}

/**
 * Build a lightweight item list covering every tradeable item that has at
 * least one price in /latest. Used exclusively for global search so the user
 * can find any item regardless of whether it's currently profitable.
 * When an item is clicked we prefer the full entry from state.items (which
 * has complete stats) and only fall back to this if the item isn't profitable.
 */
function buildSearchItems(mapping, latest) {
    const out = [];
    for (const item of mapping) {
        const p = latest[item.id];
        if (!p || (!p.high && !p.low)) continue;
        out.push({
            id: item.id,
            name: item.name,
            icon: item.icon,
            members: !!item.members,
            buy: p.low || 0,
            sell: p.high || 0,
            buyLimit: item.limit || 0,
            taxExempt: TAX_EXEMPT_IDS.has(item.id),
            dailyVolume: 0,
            volume: 0,
            netMargin: 0,
            profitPerHour: 0,
        });
    }
    return out;
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json();
}

