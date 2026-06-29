'use strict';
// ---------- Barrows Repair ----------
// Barrows equipment can only be traded on the GE fully repaired or fully
// degraded ("X 0"). This tab finds profit from:
//   buy broken "X 0" → repair at NPC or POH armour stand → sell "X"
//
// NPC repair is always available (no smithing needed), full price.
// Armour stand costs: NPC_cost × (1 − smithingLevel / 200)
//   → level 99 smithing ≈ 50% cheaper than NPC.

let repairResults = [];
const repairSort = { by: 'profit', dir: 'desc' };

// NPC repair cost for a fully degraded barrows piece (fixed game values).
function barrowsNpcCost(baseName) {
    const n = baseName.toLowerCase();
    if (/\bhelm\b|\bhood\b|\bcoif\b/.test(n)) return 60_000;
    if (/platebody|brassard|robetop|leathertop/.test(n)) return 90_000;
    if (/platelegs|plateskirt|chainskirt|robeskirt|leatherskirt/.test(n)) return 80_000;
    return 100_000; // weapons: greataxe, warspear, hammers, flail, staff, crossbow
}

function repairCostForLevel(baseName, smithingLevel) {
    const npc = barrowsNpcCost(baseName);
    const lvl = Math.max(1, Math.min(99, smithingLevel || 1));
    // NPC = smithing 0 effectively (no discount)
    // Stand discount only applies at armour stand; NPC always = full price.
    // We show stand cost only if user has a smithing level > 1.
    return Math.floor(npc * (1 - lvl / 200));
}

function computeRepairs(mapping, latestData, smithingLevel) {
    const lvl = smithingLevel || 1;
    const byName = new Map(mapping.map(item => [item.name, item]));
    const results = [];

    for (const item of mapping) {
        if (!item.name.endsWith(' 0')) continue;         // only "X 0" broken items
        const baseName = item.name.slice(0, -2);         // strip " 0"
        const repaired = byName.get(baseName);
        if (!repaired) continue;

        const pBroken   = latestData[item.id];
        const pRepaired = latestData[repaired.id];
        if (!pBroken || !pRepaired || !pBroken.low || !pRepaired.high) continue;

        const buyCost    = pBroken.low;
        const npcCost    = barrowsNpcCost(baseName);
        const repairCost = repairCostForLevel(baseName, lvl);
        const tax        = computeGeTax(repaired.id, pRepaired.high);
        const sellNet    = pRepaired.high - tax;
        const profit     = sellNet - buyCost - repairCost;

        const buyLimit = item.limit || repaired.limit || 15;
        const profitPerHour = Math.round((buyLimit / 4) * profit);

        // Daily volume of the repaired item (what you're selling)
        const d = (apiCache.daily || {})[repaired.id] || {};
        const dailyVolume = (d.highPriceVolume || 0) + (d.lowPriceVolume || 0);

        results.push({
            name:         baseName,
            brokenName:   item.name,
            brokenId:     item.id,
            repairedId:   repaired.id,
            buyCost,
            npcCost,
            repairCost,
            sellGross:    pRepaired.high,
            tax,
            sellNet,
            profit,
            profitPerHour,
            buyLimit,
            dailyVolume,
        });
    }

    repairResults = results.sort((a, b) => b.profit - a.profit);
    return repairResults;
}

function renderRepairTab() {
    const tbody = document.getElementById('repair-tbody');
    const empty = document.getElementById('repair-empty');
    if (!tbody) return;

    const smithing   = parseInt(document.getElementById('repair-smithing').value, 10) || 1;
    const minProfit  = parseFloat(document.getElementById('repair-min-profit').value) || 0;
    const minVolume  = parseFloat(document.getElementById('repair-min-volume').value) || 0;

    // Recompute with current smithing level so cost column updates live
    if (apiCache.mapping && apiCache.latest) {
        computeRepairs(apiCache.mapping, apiCache.latest, smithing);
    }

    const filtered = repairResults.filter(r => r.profit >= minProfit && r.dailyVolume >= minVolume);

    if (empty) empty.style.display = filtered.length ? 'none' : 'block';

    if (!filtered.length) {
        tbody.innerHTML = '';
        return;
    }

    const usingStand = smithing > 1;
    const sorted = applySortArr(filtered, repairSort.by, repairSort.dir);
    syncSortHeaders(tbody.closest('table'), repairSort);

    tbody.innerHTML = sorted.map(r => {
        const profitClass = r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : 'dim';
        const repairLabel = usingStand
            ? `${formatGp(r.repairCost)} gp <span class="dim tiny">(stand)</span>`
            : `${formatGp(r.repairCost)} gp <span class="dim tiny">(NPC)</span>`;
        return `
        <tr style="cursor:pointer;" data-repair-name="${escapeHtml(r.name)}">
            <td>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(r.name)}</div>
                    <div class="item-meta">
                        <span class="badge badge-mem">P2P</span>
                        <span class="dim tiny">limit ${r.buyLimit}/4h</span>
                    </div>
                </div>
            </td>
            <td class="num mono dim">−${formatGp(r.buyCost)} gp</td>
            <td class="num mono dim">−${repairLabel}</td>
            <td class="num mono dim mob-hide">+${formatGp(r.sellGross)} gp</td>
            <td class="num mono dim mob-hide">−${formatGp(r.tax)} gp</td>
            <td class="num mono ${profitClass} ${r.profit > 0 ? 'profit-cell' : ''}">
                ${r.profit > 0 ? '+' : ''}${formatGp(Math.round(r.profit))} gp
            </td>
            <td class="num mono dim mob-hide">
                ${r.profitPerHour > 0 ? formatGp(r.profitPerHour) + '/hr' : '—'}
            </td>
            <td class="num mono ${r.dailyVolume ? volClass(r.dailyVolume) : 'dim'}">${r.dailyVolume ? r.dailyVolume.toLocaleString() : '—'}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-repair-name]').forEach(tr => {
        tr.addEventListener('click', () => {
            const name = tr.dataset.repairName;
            const result = sorted.find(r => r.name === name);
            if (result) openRepairModal(result);
        });
    });
}
