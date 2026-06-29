'use strict';
// ---------- Decant ----------
// Bob Barter (at the GE) decants potions for free. This tab finds profit
// opportunities from converting between dose sizes. Main use case: buy
// cheap 3-dose potions, decant to 4-dose, sell for more.
//
// Conversion ratio: 4×(3-dose) ↔ 3×(4-dose)  [both = 12 doses]

let decantResults = [];
const decantSort = { by: 'profit', dir: 'desc' };

function computeGeTax(id, price) {
    if (TAX_EXEMPT_IDS.has(id) || price < GE_TAX_MIN_PRICE) return 0;
    return Math.min(Math.floor(price * GE_TAX_RATE), GE_TAX_CAP);
}

function dailyVol(id) {
    const d = (apiCache.daily || {})[id] || {};
    return (d.highPriceVolume || 0) + (d.lowPriceVolume || 0);
}

function computeDecants(mapping, latestData) {
    // Group items by base name and dose count
    const groups = {};
    for (const item of Object.values(mapping)) {
        // Handles both "Prayer potion(4)" (no space) and "Saradomin brew (4)" (space)
        const m = item.name.match(/^(.+?)\s*\((\d)\)$/);
        if (!m) continue;
        const dose = parseInt(m[2], 10);
        if (dose < 1 || dose > 4) continue;
        const base = m[1].trim();
        if (!groups[base]) groups[base] = {};
        groups[base][dose] = {
            id: item.id,
            name: item.name,
            buyLimit: item.limit || 0,
            members: item.members,
        };
    }

    const results = [];

    for (const [base, doses] of Object.entries(groups)) {
        const d3 = doses[3];
        const d4 = doses[4];
        if (!d3 || !d4) continue;

        const p3 = latestData[d3.id];
        const p4 = latestData[d4.id];
        if (!p3 || !p4) continue;

        const buy3  = p3.low;
        const sell3 = p3.high;
        const buy4  = p4.low;
        const sell4 = p4.high;
        if (!buy3 || !sell4 || !buy4 || !sell3) continue;

        // 3→4: buy 4×(3-dose) at buy3, sell 3×(4-dose) at sell4
        {
            const tax    = computeGeTax(d4.id, sell4);
            const revenue = 3 * (sell4 - tax);
            const cost   = 4 * buy3;
            const profit = revenue - cost;
            // Profit per flip = total profit from buying the full 4h limit in one cycle.
            // buyLimit 3-dose potions → floor(buyLimit/4) batches
            const batchesPerFlip = d3.buyLimit > 0 ? Math.floor(d3.buyLimit / 4) : null;
            results.push({
                base,
                buyId:   d3.id,
                sellId:  d4.id,
                buyName: d3.name,
                sellName: d4.name,
                buyPrice: buy3,
                sellPrice: sell4,
                buyQty: 4,
                sellQty: 3,
                cost,
                revenue,
                profit,
                profitPerFlip: batchesPerFlip != null ? Math.round(profit * batchesPerFlip) : null,
                buyLimit: d3.buyLimit,
                members: !!(d3.members || d4.members),
                dailyVolume: dailyVol(d4.id),
            });
        }

        // 4→3 direction removed per user request
    }

    decantResults = results.sort((a, b) => b.profit - a.profit);
    return decantResults;
}

function renderDecantTab() {
    const tbody = document.getElementById('decant-tbody');
    const empty = document.getElementById('decant-empty');
    if (!tbody) return;

    const minProfit = parseFloat(document.getElementById('decant-min-profit').value) || 0;
    const minVolume = parseFloat(document.getElementById('decant-min-volume').value) || 0;

    const filtered = decantResults.filter(r =>
        r.profit >= minProfit && r.dailyVolume >= minVolume
    );

    if (empty) empty.style.display = filtered.length ? 'none' : 'block';

    if (!filtered.length) {
        tbody.innerHTML = '';
        return;
    }

    const sorted = applySortArr(filtered, decantSort.by, decantSort.dir);
    syncSortHeaders(tbody.closest('table'), decantSort);

    tbody.innerHTML = sorted.map(r => {
        const profitClass = r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : 'dim';
        return `
        <tr style="cursor:pointer;" data-decant-base="${escapeHtml(r.base)}">
            <td>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(r.base)}</div>
                    <div class="item-meta">
                        <span class="badge ${r.members ? 'badge-mem' : 'badge-f2p'}">${r.members ? 'P2P' : 'F2P'}</span>
                        ${r.buyLimit ? `<span class="dim tiny">limit ${r.buyLimit.toLocaleString()}/4h</span>` : ''}
                    </div>
                </div>
            </td>
            <td class="num mono mob-hide">${r.buyQty}× ${formatGp(r.buyPrice)} gp</td>
            <td class="num mono mob-hide">${r.sellQty}× ${formatGp(r.sellPrice)} gp</td>
            <td class="num mono dim mob-hide">−${formatGp(r.cost)} gp</td>
            <td class="num mono dim mob-hide">+${formatGp(Math.round(r.revenue))} gp</td>
            <td class="num mono ${profitClass} ${r.profit > 0 ? 'profit-cell' : ''}">${r.profit > 0 ? '+' : ''}${formatGp(Math.round(r.profit))} gp</td>
            <td class="num mono dim mob-hide">${r.profitPerFlip != null ? formatGp(r.profitPerFlip) + ' gp' : '—'}</td>
            <td class="num mono ${r.dailyVolume ? volClass(r.dailyVolume) : 'dim'}">${r.dailyVolume ? r.dailyVolume.toLocaleString() : '—'}</td>
            ${starTd('decant', r.base)}
        </tr>`;
    }).join('');

    // Row click → open decant chart modal
    tbody.querySelectorAll('tr[data-decant-base]').forEach(tr => {
        tr.addEventListener('click', () => {
            const base = tr.dataset.decantBase;
            const result = sorted.find(r => r.base === base);
            if (result) openDecantModal(result);
        });
    });
}
