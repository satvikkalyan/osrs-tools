'use strict';
// ---------- Drop detection ----------
// Per-item rolling buffer of recent price snapshots. Key = item ID.
// Each entry: [{ ts, low, high }, …] most-recent last.
const priceHistory = new Map();
const HISTORY_BUFFER_SIZE = 10; // ~10 minutes at 60s refresh
// Detected drops list (newest first). Persisted to localStorage.
let detectedDrops = JSON.parse(localStorage.getItem('osrs-drops') || '[]');
const dropsSort = { by: 'dropPct', dir: 'desc' };
const DROPS_STORAGE_KEY = 'osrs-drops';
const MAX_STORED_DROPS = 50;
// Don't re-flag the same item more than once per cooldown window.
const REFLAG_COOLDOWN_MS = 10 * 60 * 1000;

function updatePriceHistoryAndDetect(items) {
    const now = Date.now();
    // Parse each filter input as a number, falling back to the default ONLY
    // when blank or non-numeric — not when the user explicitly types 0.
    const parseOrDefault = (id, def) => {
        const v = parseFloat(document.getElementById(id).value);
        return isNaN(v) ? def : v;
    };
    const minDropPct = parseOrDefault('drop-min-pct', 5) / 100;
    const minDropVolume = parseOrDefault('drop-min-volume', 10000);
    const minItemPrice = parseOrDefault('drop-min-price', 0);
    const windowMin = Math.max(1, Math.min(30, parseOrDefault('drop-window-min', 5)));
    const windowMs = windowMin * 60000;
    // Only flag drops on items whose current low has actually traded
    // recently. If the last buy happened 30 minutes ago, item.buy is just
    // a stale fossil — comparing it to a 5-min-ago snapshot would generate
    // noise. ageMin comes from computeFlips (= seconds since the oldest of
    // lowTime/highTime in the /latest payload).
    const MAX_LATEST_AGE_MIN = 10;

    const newDrops = [];

    for (const item of items) {
        let hist = priceHistory.get(item.id) || [];
        hist.push({ ts: now, low: item.buy, high: item.sell });
        // Keep the buffer small
        if (hist.length > HISTORY_BUFFER_SIZE) hist = hist.slice(-HISTORY_BUFFER_SIZE);
        priceHistory.set(item.id, hist);

        if (hist.length < 2) continue;
        if (item.dailyVolume < minDropVolume) continue;
        // Skip cheap collectables — a 5% drop on a 50gp item is 2.5gp,
        // not worth flagging.
        if (item.buy < minItemPrice) continue;
        // Skip items whose current price is itself stale; we'd be comparing
        // an ancient quote to a 5-min-ago snapshot of the same ancient quote.
        if (item.ageMin != null && item.ageMin > MAX_LATEST_AGE_MIN) continue;

        // Filter snapshots to the window, oldest-first.
        const cutoff = now - windowMs;
        const inWindow = hist
            .filter(snap => snap.ts >= cutoff && snap.ts <= now)
            .sort((a, b) => a.ts - b.ts);
        if (inWindow.length < 3) continue; // need at least 3 to distinguish patterns
        const oldestAgeMs = now - inWindow[0].ts;
        if (oldestAgeMs < 90_000) continue; // need at least ~1.5 min of history

        // Baseline = median of the OLDEST third of snapshots — "what was the
        // price BEFORE any drop started." Earlier code used max-in-window,
        // which created false positives for spike-then-revert patterns
        // (e.g. mithril platebody briefly hits 2600 then drifts back to
        // 2458 — looked like a 5.5% "drop" from a peak that was the
        // anomaly, not the baseline).
        const earlyCount = Math.max(2, Math.ceil(inWindow.length / 3));
        const earlyPrices = inWindow.slice(0, earlyCount).map(s => s.low).sort((a, b) => a - b);
        const baselinePrice = earlyPrices[Math.floor(earlyPrices.length / 2)];

        if (item.buy >= baselinePrice) continue; // current is above baseline = not a drop
        const dropPct = (baselinePrice - item.buy) / baselinePrice;
        if (dropPct < minDropPct) continue;

        // Current price must be at (or within 0.5% of) the window minimum.
        // If the price has already rebounded, the dump is over and there's
        // nothing actionable to do — don't notify.
        const windowMin = Math.min(...inWindow.map(s => s.low));
        if (item.buy > windowMin * 1.005) continue;

        // Dedupe — skip if we already flagged this item recently.
        const recent = detectedDrops.find(d =>
            d.itemId === item.id && (now - d.detectedAt) < REFLAG_COOLDOWN_MS
        );
        if (recent) continue;

        newDrops.push({
            itemId: item.id,
            name: item.name,
            icon: item.icon,
            fromPrice: baselinePrice,
            toPrice: item.buy,
            dropPct: dropPct * 100,
            windowMin: oldestAgeMs / 60000,
            detectedAt: now,
            buyLimit: item.buyLimit,
            dailyVolume: item.dailyVolume,
            watchlist: WATCHLIST_ITEM_IDS.has(item.id),
        });
    }

    // On every refresh, remove drops where the price has recovered above 95%
    // of its baseline. No reason to keep showing them.
    detectedDrops = detectedDrops.filter(drop => {
        const currentItem = items.find(x => x.id === drop.itemId);
        if (!currentItem || !currentItem.buy) return true; // keep if we have no price data
        return currentItem.buy < drop.fromPrice * 0.95;   // remove if recovered
    });

    if (newDrops.length) {
        // Newest at the front
        detectedDrops = [...newDrops, ...detectedDrops].slice(0, MAX_STORED_DROPS);
        persistDrops();
        if (document.getElementById('drop-notify').checked) {
            newDrops.forEach(notifyDrop);
        }
    }

    // Re-render drops tab on every refresh (new drops OR recovery status changes).
    renderDropsTab();
    persistDrops();
}

/**
 * Lightweight refresh for the Drops tab — only fetches /latest (a single
 * small API call) and re-runs detection against the cached mapping + 1h +
 * 24h data. Cheaper than fetchData() which pulls all four endpoints, so
 * it's safe to spam.
 */
async function refreshDropsOnly() {
    if (!apiCache.mapping) {
        // First fetch hasn't completed yet; fall back to a full fetch.
        return fetchData();
    }
    const btn = document.getElementById('drops-refresh');
    const originalLabel = btn.textContent;
    btn.textContent = '↻ …';
    btn.disabled = true;
    try {
        const latest = await fetchJson(`${API_BASE}/latest`);
        const items = computeFlips(apiCache.mapping, latest.data, apiCache.hourly, apiCache.daily);
        state.items = items;
        state.fetchedAt = Date.now();
        // Don't re-render the flips table here — the user is on the Drops
        // tab and the flips view's data is now slightly stale, which will
        // self-correct on the next full auto-refresh. We just want the
        // drop detection to run on fresh prices.
        updatePriceHistoryAndDetect(items);
        renderDropsTab();
    } catch (err) {
        console.error('Drops-only refresh failed:', err);
    } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
    }
}

function persistDrops() {
    try {
        localStorage.setItem(DROPS_STORAGE_KEY, JSON.stringify(detectedDrops));
    } catch (e) { /* quota exceeded — non-fatal */ }
}

// Track whether we've already asked for notification permission this session
// so we don't re-prompt on every auto-refresh cycle.
let notificationPermissionRequested = false;

function notifyDrop(drop) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        // Only ask once. The original code called requestPermission() without
        // awaiting it, so the notification was never actually sent after the
        // user clicked Allow. Now we await it and fire immediately on grant.
        if (!notificationPermissionRequested) {
            notificationPermissionRequested = true;
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') sendDropNotification(drop);
            });
        }
        return;
    }
    if (Notification.permission !== 'granted') return;
    sendDropNotification(drop);
}

function sendDropNotification(drop) {
    const body = `${drop.fromPrice.toLocaleString()} → ${drop.toPrice.toLocaleString()} gp  ·  ${drop.dropPct.toFixed(1)}% drop in ${drop.windowMin.toFixed(0)}m`;
    new Notification(`Price drop: ${drop.name}`, {
        body,
        icon: drop.icon ? getIconSrc(drop.icon) : undefined,
        tag: `drop-${drop.itemId}`, // collapse repeats for the same item
    });
    playDropSound();
}

function playDropSound() {
    try {
        const audio = new Audio('sounds/mixkit-long-pop-2358.wav');
        audio.volume = 0.6;
        audio.play().catch(() => {}); // ignore autoplay policy errors
    } catch (e) {}
}

function renderDropsTab() {
    const tbody = document.getElementById('drops-tbody');
    const empty = document.getElementById('drops-empty');
    const wrap = document.getElementById('drops-wrap');
    const badge = document.getElementById('drops-badge');
    if (!tbody) return;

    // Read all the same filter inputs the detector uses, so the displayed
    // list always reflects the *current* threshold values — not just the
    // thresholds that were in place when each drop was originally detected.
    // Previously, drops persisted across threshold changes (e.g. a 5% drop
    // stayed visible after raising the threshold to 10%). This re-filters
    // every render.
    const parseOrZero = (id) => {
        const v = parseFloat(document.getElementById(id).value);
        return isNaN(v) ? 0 : v;
    };
    const watchlistOnly = document.getElementById('drop-watchlist-only') &&
                          document.getElementById('drop-watchlist-only').checked;
    const minItemPrice = parseOrZero('drop-min-price');
    const minDropPct = parseOrZero('drop-min-pct');
    const minDropVolume = parseOrZero('drop-min-volume');

    let visible = detectedDrops.filter(d =>
        d.toPrice >= minItemPrice &&
        d.dropPct >= minDropPct &&
        (d.dailyVolume || 0) >= minDropVolume
    );
    if (watchlistOnly) {
        visible = visible.filter(d => d.watchlist || WATCHLIST_ITEM_IDS.has(d.itemId));
    }

    if (!visible.length) {
        tbody.innerHTML = '';
        wrap.querySelector('table').style.display = 'none';
        empty.style.display = 'block';
        empty.textContent = watchlistOnly
            ? 'No watchlisted drops yet. Switch off "Watchlist only" to see all detected drops.'
            : 'No drops detected yet. The page checks every 60s; drops will appear here as they happen.';
        badge.style.display = detectedDrops.length ? 'inline-block' : 'none';
        badge.textContent = detectedDrops.length;
        return;
    }

    badge.style.display = 'inline-block';
    badge.textContent = visible.length + (watchlistOnly ? ` / ${detectedDrops.length}` : '');
    wrap.querySelector('table').style.display = 'table';
    empty.style.display = 'none';

    const sortedDrops = applySortArr(visible, dropsSort.by, dropsSort.dir);
    syncSortHeaders(wrap.querySelector('table'), dropsSort);
    tbody.innerHTML = sortedDrops.map(dropRowHtml).join('');
    imgLoader.observe(tbody);
    tbody.querySelectorAll('tr').forEach(tr => {
        const id = parseInt(tr.dataset.itemId, 10);
        tr.addEventListener('click', e => {
            if (e.target.classList.contains('drop-dismiss')) return;
            // state.items only contains currently profitable flips; crashed items
            // won't be there, so fall back to searchItems which covers all items.
            const item = state.items.find(x => x.id === id)
                      || (state.searchItems && state.searchItems.find(x => x.id === id));
            if (item) openChartModal(item);
        });
    });
    tbody.querySelectorAll('.drop-dismiss').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.dropId, 10);
            const ts = parseInt(btn.dataset.dropTs, 10);
            detectedDrops = detectedDrops.filter(d => !(d.itemId === id && d.detectedAt === ts));
            persistDrops();
            renderDropsTab();
        });
    });
}

function dropRowHtml(drop) {
    const iconUrl = drop.icon ? getIconSrc(drop.icon) : '';
    const icon = iconUrl
        ? `<img class="drop-icon" data-src="${iconUrl}" src="" alt="" onerror="this.style.display='none'">`
        : '';
    const elapsedMs = Date.now() - drop.detectedAt;
    const elapsedMin = Math.floor(elapsedMs / 60000);
    const ago = elapsedMin < 1 ? 'just now' : elapsedMin < 60 ? elapsedMin + 'm ago' : Math.floor(elapsedMin / 60) + 'h ago';

    const isWatch = drop.watchlist || WATCHLIST_ITEM_IDS.has(drop.itemId);
    const isYours = isPinnableYours(drop.itemId);
    const watchBadge = isWatch
        ? '<span class="badge badge-watch" title="On the dump-watchlist (historically prone to crashes)">★ watchlist</span>'
        : '';
    const yoursBadge = isYours
        ? '<span class="badge badge-yours" title="In your imported trade history">★ yours</span>'
        : '';
    return `
        <tr data-item-id="${drop.itemId}">
            <td>
                <div class="item-cell">
                    ${icon}
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(drop.name)}</div>
                        <div class="item-meta dim">
                            <span>Buy limit ${drop.buyLimit ? drop.buyLimit.toLocaleString() : '—'}</span>
                            ${watchBadge}
                            ${yoursBadge}
                        </div>
                    </div>
                </div>
            </td>
            <td class="num mono">${formatGp(drop.fromPrice)}</td>
            <td class="num mono">${formatGp(drop.toPrice)}</td>
            <td class="num mono drop-pct">−${drop.dropPct.toFixed(1)}%</td>
            <td class="num mono mob-hide">${drop.windowMin.toFixed(0)}m</td>
            <td class="num mono mob-hide">${drop.dailyVolume.toLocaleString()}</td>
            <td class="num drop-time">${ago}</td>
            ${starTd('drops', drop.itemId)}
            <td class="num"><button class="drop-dismiss" data-drop-id="${drop.itemId}" data-drop-ts="${drop.detectedAt}" title="Dismiss">✕</button></td>
        </tr>
    `;
}

