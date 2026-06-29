'use strict';
// ---------- Scoring ----------
function computeFlips(mapping, latest, hourly, daily) {
    const now = Math.floor(Date.now() / 1000);
    const out = [];

    for (const item of mapping) {
        const p = latest[item.id];
        if (!p || !p.high || !p.low) continue;

        const high = p.high;
        const low = p.low;
        const margin = high - low;
        if (margin <= 0) continue;

        // GE tax: 1% of sell price, capped at 5M, exempt below 100gp, and
        // explicitly exempt for items in TAX_EXEMPT_IDS (most notably Old
        // School Bonds — applying 1% would make an 8M bond look like an
        // 80K loss when it's actually exempt).
        const isTaxExempt = TAX_EXEMPT_IDS.has(item.id) || high < GE_TAX_MIN_PRICE;
        const tax = isTaxExempt
            ? 0
            : Math.min(Math.floor(high * GE_TAX_RATE), GE_TAX_CAP);
        const netMargin = high - tax - low;
        if (netMargin <= 0) continue;
        const marginPct = (netMargin / low) * 100;

        // Volume — we want to flip, so the bottleneck is the slower side.
        // The 1h endpoint reports highPriceVolume (units sold at 'high')
        // and lowPriceVolume (units bought at 'low'). Use min.
        const v = hourly[item.id] || { highPriceVolume: 0, lowPriceVolume: 0 };
        const highVol = v.highPriceVolume || 0;
        const lowVol = v.lowPriceVolume || 0;
        const volMin = Math.min(highVol, lowVol);

        // Daily volume from /24h endpoint — the realistic liquidity signal.
        // Amulet of chemistry-style "huge paper profit, 42K daily" items get
        // filtered out via the Min daily volume control.
        const d = daily[item.id] || { highPriceVolume: 0, lowPriceVolume: 0 };
        const dailyVolume = (d.highPriceVolume || 0) + (d.lowPriceVolume || 0);
        const dailyMin = Math.min(d.highPriceVolume || 0, d.lowPriceVolume || 0);

        const buyLimit = item.limit || 0;
        const hourlyLimit = buyLimit > 0
            ? Math.floor(buyLimit / BUY_LIMIT_WINDOW_HRS)
            : UNLIMITED_PROXY;
        // Realistic flips per hour: bounded by both market liquidity and
        // your personal GE buy-limit allowance.
        const realisticFlips = Math.min(volMin, hourlyLimit);
        const profitPerHour = netMargin * realisticFlips;

        const oldestTime = Math.min(p.lowTime || now, p.highTime || now);
        const ageMin = (now - oldestTime) / 60;

        // Heuristic: penalize one-sided markets — if highVol is 20× lowVol
        // (or vice versa) we'll probably get stuck on the slow side. Halve
        // the projected hourly profit to reflect that.
        const lopsided = (highVol > 0 && lowVol > 0)
            && (Math.max(highVol, lowVol) / Math.min(highVol, lowVol) > 20);

        const adjustedProfit = lopsided ? Math.floor(profitPerHour / 2) : profitPerHour;

        out.push({
            id: item.id,
            name: item.name,
            icon: item.icon,
            members: !!item.members,
            buy: low,
            sell: high,
            margin,
            netMargin,
            marginPct,
            tax,
            taxExempt: TAX_EXEMPT_IDS.has(item.id),
            buyLimit,
            volume: volMin,
            highVol,
            lowVol,
            dailyVolume,
            dailyMin,
            ageMin,
            lopsided,
            profitPerHour: adjustedProfit,
            profitPerHourRaw: profitPerHour,
        });
    }
    return out;
}

// ---------- Filtering / Sorting ----------
function applyFilters() {
    const search = document.getElementById('filter-search').value.toLowerCase().trim();
    const minMargin = parseFloat(document.getElementById('filter-min-margin').value) || 0;
    const minVolRaw = document.getElementById('filter-min-volume').value;
    const minVolume = minVolRaw === '' ? 0 : (parseFloat(minVolRaw) || 0);
    const maxPriceRaw = document.getElementById('filter-max-price').value;
    const maxPrice = maxPriceRaw === '' ? Infinity : parseFloat(maxPriceRaw);
    const maxAge = parseFloat(document.getElementById('filter-stale').value);
    const members = document.getElementById('filter-members').value;

    return state.items.filter(item => {
        if (search && !item.name.toLowerCase().includes(search)) return false;
        if (item.netMargin < minMargin) return false;
        // Use daily volume as the liquidity filter — that's the realistic
        // signal. A great-margin item with 42K daily volume (e.g. amulet of
        // chemistry) is paper-only; you'll never fill the buy limit.
        if (item.dailyVolume < minVolume) return false;
        if (item.buy > maxPrice) return false;
        if (item.ageMin > maxAge) return false;
        if (members === 'mem' && !item.members) return false;
        if (members === 'f2p' && item.members) return false;
        return true;
    });
}

function sortItems(items) {
    const k = state.sortBy;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const yoursFirst = document.getElementById('filter-yours-first') &&
                       document.getElementById('filter-yours-first').checked;
    return items.slice().sort((a, b) => {
        // Pin personal-watchlist items above everything else when toggled.
        if (yoursFirst) {
            const aMine = isPinnableYours(a.id) ? 1 : 0;
            const bMine = isPinnableYours(b.id) ? 1 : 0;
            if (aMine !== bMine) return bMine - aMine;
        }
        const av = a[k], bv = b[k];
        if (typeof av === 'string') return dir * av.localeCompare(bv);
        return dir * ((av || 0) - (bv || 0));
    });
}
