'use strict';
// ---------- Craft tab: Assembly + Combine + Barrows Repair ----------
// Unified recipe system. All recipes look up item prices live from the wiki
// API by item name. Skill requirements are checked against playerStats (from
// player.js) and filtered/flagged accordingly.

let assemblyResults = [];
const craftSort = { by: 'profit', dir: 'desc' };

// ── Tag colours ──────────────────────────────────────────────────────────────
const TAG_COLORS = {
    Combine:  '#60a5fa',  // blue  — use-item-on-item, no skill
    Smithing: '#fb923c',  // orange — smithing skill needed
    NPC:      '#c084fc',  // purple — pay an NPC fee
    Prayer:   '#4ade80',  // green  — prayer + smithing
    Charge:   '#f472b6',  // pink   — weapon charging
    Barrows:  '#fbbf24',  // gold   — Barrows repair
};

// ── Recipe definitions ───────────────────────────────────────────────────────
// feeGp        : fixed gp cost paid to NPC / per-charge coin cost
// canSkipFee   : if smithing >= reqSmith, feeGp drops to 0 (Dragonfire shield)
// reqSmith/reqPrayer/reqMagic : skill requirements for player filter
// inputs[]     : { name: <GE item name>, qty: 1 }
// output       : exact GE item name

const COMBINE_RECIPES = [

    // ── Combine (use item on item, no skill) ─────────────────────────────────
    {
        name:    'Abyssal tentacle',
        tag:     'Combine',
        inputs:  [{ name: 'Abyssal whip', qty: 1 }, { name: 'Kraken tentacle', qty: 1 }],
        output:  'Abyssal tentacle',
        feeGp:   0,
        reqNote: 'Use tentacle on whip',
    },
    {
        name:    'Dragon sq shield',
        tag:     'Combine',
        inputs:  [{ name: 'Dragon shield left half', qty: 1 }, { name: 'Dragon shield right half', qty: 1 }],
        output:  'Dragon sq shield',
        feeGp:   0,
        reqNote: 'Use halves together',
    },

    // ── Godswords ────────────────────────────────────────────────────────────
    {
        name:     'Godsword blade',
        tag:      'Smithing',
        inputs:   [
            { name: 'Godsword shard 1', qty: 1 },
            { name: 'Godsword shard 2', qty: 1 },
            { name: 'Godsword shard 3', qty: 1 },
        ],
        output:   'Godsword blade',
        feeGp:    0,
        reqSmith: 80,
        reqNote:  '80 Smithing at anvil',
    },
    {
        name:    'Armadyl godsword',
        tag:     'Combine',
        inputs:  [{ name: 'Godsword blade', qty: 1 }, { name: 'Armadyl hilt', qty: 1 }],
        output:  'Armadyl godsword',
        feeGp:   0,
        reqNote: '',
    },
    {
        name:    'Bandos godsword',
        tag:     'Combine',
        inputs:  [{ name: 'Godsword blade', qty: 1 }, { name: 'Bandos hilt', qty: 1 }],
        output:  'Bandos godsword',
        feeGp:   0,
        reqNote: '',
    },
    {
        name:    'Saradomin godsword',
        tag:     'Combine',
        inputs:  [{ name: 'Godsword blade', qty: 1 }, { name: 'Saradomin hilt', qty: 1 }],
        output:  'Saradomin godsword',
        feeGp:   0,
        reqNote: '',
    },
    {
        name:    'Zamorak godsword',
        tag:     'Combine',
        inputs:  [{ name: 'Godsword blade', qty: 1 }, { name: 'Zamorak hilt', qty: 1 }],
        output:  'Zamorak godsword',
        feeGp:   0,
        reqNote: '',
    },

    // ── Smithing / NPC fee ───────────────────────────────────────────────────
    {
        name:        'Dragonfire shield',
        tag:         'NPC',
        inputs:      [{ name: 'Anti-dragon shield', qty: 1 }, { name: 'Draconic visage', qty: 1 }],
        output:      'Dragonfire shield',
        feeGp:       1_250_000,
        reqSmith:    90,
        canSkipFee:  true,   // if smithing >= 90, no Oziach fee
        reqNote:     '90 Smith or 1.25M (Oziach)',
    },

    // ── Spirit shields ───────────────────────────────────────────────────────
    {
        name:      'Blessed spirit shield',
        tag:       'Prayer',
        inputs:    [{ name: 'Spirit shield', qty: 1 }, { name: 'Holy elixir', qty: 1 }],
        output:    'Blessed spirit shield',
        feeGp:     0,
        reqPrayer: 85,
        reqNote:   '85 Prayer',
    },
    {
        name:      'Arcane spirit shield',
        tag:       'Prayer',
        inputs:    [{ name: 'Blessed spirit shield', qty: 1 }, { name: 'Arcane sigil', qty: 1 }],
        output:    'Arcane spirit shield',
        feeGp:     0,
        reqSmith:  90,
        reqPrayer: 85,
        reqNote:   '90 Smith + 85 Prayer',
    },
    {
        name:      'Spectral spirit shield',
        tag:       'Prayer',
        inputs:    [{ name: 'Blessed spirit shield', qty: 1 }, { name: 'Spectral sigil', qty: 1 }],
        output:    'Spectral spirit shield',
        feeGp:     0,
        reqSmith:  90,
        reqPrayer: 85,
        reqNote:   '90 Smith + 85 Prayer',
    },
    {
        name:      'Elysian spirit shield',
        tag:       'Prayer',
        inputs:    [{ name: 'Blessed spirit shield', qty: 1 }, { name: 'Elysian sigil', qty: 1 }],
        output:    'Elysian spirit shield',
        feeGp:     0,
        reqSmith:  90,
        reqPrayer: 85,
        reqNote:   '90 Smith + 85 Prayer',
    },

    // ── NPC conversion ───────────────────────────────────────────────────────
    {
        name:    'Zamorakian hasta',
        tag:     'NPC',
        inputs:  [{ name: 'Zamorakian spear', qty: 1 }],
        output:  'Zamorakian hasta',
        feeGp:   300_000,
        reqNote: '300k gp (Rovin, Warriors\' Guild)',
    },

    // ── Weapon charging ──────────────────────────────────────────────────────
    // 2,500 charges. Coin cost of 10 gp × 2500 = 25,000 as feeGp.
    {
        name:     'Trident of the seas (full)',
        tag:      'Charge',
        inputs:   [
            { name: 'Trident of the seas', qty: 1 },
            { name: 'Chaos rune',          qty: 2500 },
            { name: 'Death rune',          qty: 12500 },
            { name: 'Fire rune',           qty: 12500 },
        ],
        output:   'Trident of the seas (full)',
        feeGp:    25_000,   // 10 coins × 2,500 charges
        reqMagic: 75,
        reqNote:  '75 Magic · 2,500 charges',
    },
    {
        name:     'Trident of the swamp (full)',
        tag:      'Charge',
        inputs:   [
            { name: 'Trident of the swamp', qty: 1 },
            { name: 'Chaos rune',           qty: 2500 },
            { name: 'Death rune',           qty: 12500 },
            { name: 'Zulrah\'s scales',     qty: 2500 },
        ],
        output:   'Trident of the swamp (full)',
        feeGp:    0,
        reqMagic: 78,
        reqNote:  '78 Magic · 2,500 charges',
    },
];

// ── Helper: check if player meets recipe requirements ────────────────────────
function playerCanDo(recipe) {
    if (!Object.keys(playerStats).length) return true; // no stats loaded → show all
    const smith  = playerStats.smithing  || 1;
    const prayer = playerStats.prayer    || 1;
    const magic  = playerStats.magic     || 1;
    if (recipe.reqSmith  && smith  < recipe.reqSmith)  return false;
    if (recipe.reqPrayer && prayer < recipe.reqPrayer) return false;
    if (recipe.reqMagic  && magic  < recipe.reqMagic)  return false;
    return true;
}

// ── Compute assembly recipes ─────────────────────────────────────────────────
function computeAssembly(mapping, latestData, smithingLevel) {
    if (!mapping || !latestData) return [];
    const lvl    = smithingLevel || parseInt(document.getElementById('craft-smithing')?.value, 10) || 1;
    const byName = new Map(mapping.map(item => [item.name.trim(), item]));
    const results = [];

    for (const recipe of COMBINE_RECIPES) {
        const outItem = byName.get(recipe.output);
        if (!outItem) continue;
        const outPrice = latestData[outItem.id];
        if (!outPrice || !outPrice.high) continue;

        let inputCost = 0;
        let valid = true;
        for (const inp of recipe.inputs) {
            const inItem = byName.get(inp.name);
            if (!inItem) { valid = false; break; }
            const inPrice = latestData[inItem.id];
            if (!inPrice || !inPrice.low) { valid = false; break; }
            inputCost += inPrice.low * inp.qty;
        }
        if (!valid) continue;

        // Fee: skip if smithing meets the threshold (Dragonfire shield)
        let feeGp = recipe.feeGp || 0;
        if (recipe.canSkipFee && lvl >= (recipe.reqSmith || 99)) feeGp = 0;

        const tax     = computeGeTax(outItem.id, outPrice.high);
        const sellNet = outPrice.high - tax;
        const profit  = sellNet - inputCost - feeGp;

        const d = (apiCache.daily || {})[outItem.id] || {};
        const dailyVolume = (d.highPriceVolume || 0) + (d.lowPriceVolume || 0);

        results.push({
            key:         recipe.name,
            name:        recipe.name,
            tag:         recipe.tag,
            inputCost,
            feeGp,
            sellGross:   outPrice.high,
            tax,
            sellNet,
            profit,
            dailyVolume,
            reqNote:     recipe.reqNote || '',
            canDo:       playerCanDo(recipe),
            // store for modal / star
            outId:       outItem.id,
            inputs:      recipe.inputs,
        });
    }

    return results;
}

// ── Merge assembly + Barrows repair into unified list ────────────────────────
function computeAllCraft(smithingLevel) {
    if (!apiCache.mapping || !apiCache.latest) return [];

    const asmResults = computeAssembly(apiCache.mapping, apiCache.latest, smithingLevel);

    // Map Barrows repair results to the unified shape
    const barrowsMapped = repairResults.map(r => ({
        key:        `barrows-${r.name}`,
        name:       r.name,
        tag:        'Barrows',
        inputCost:  r.buyCost,
        feeGp:      r.repairCost,
        sellGross:  r.sellGross,
        tax:        r.tax,
        sellNet:    r.sellNet,
        profit:     r.profit,
        dailyVolume: r.dailyVolume,
        reqNote:    'Buy broken → repair at Bob/stand',
        canDo:      true,
        // keep for modal
        _barrows:   r,
    }));

    assemblyResults = [...asmResults, ...barrowsMapped];
    return assemblyResults;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderCraftTab() {
    const tbody    = document.getElementById('craft-tbody');
    const empty    = document.getElementById('craft-empty');
    if (!tbody) return;

    const smithing  = parseInt(document.getElementById('craft-smithing')?.value,  10) || 1;
    const minProfit = parseFloat(document.getElementById('craft-min-profit')?.value) || 0;
    const minVol    = parseFloat(document.getElementById('craft-min-volume')?.value) || 0;
    const typeFilter = document.getElementById('craft-type-filter')?.value || 'all';
    const canDoOnly  = document.getElementById('craft-can-do')?.checked ?? false;

    // Recompute Barrows with current smithing
    if (apiCache.mapping && apiCache.latest) {
        computeRepairs(apiCache.mapping, apiCache.latest, smithing);
    }
    const all = computeAllCraft(smithing);

    const filtered = all.filter(r => {
        if (r.profit < minProfit) return false;
        if (r.dailyVolume && r.dailyVolume < minVol) return false;
        if (typeFilter !== 'all' && r.tag.toLowerCase() !== typeFilter) return false;
        if (canDoOnly && !r.canDo) return false;
        return true;
    });

    if (empty) empty.style.display = filtered.length ? 'none' : 'block';
    if (!filtered.length) { tbody.innerHTML = ''; return; }

    const sorted = applySortArr(filtered, craftSort.by, craftSort.dir);
    syncSortHeaders(tbody.closest('table'), craftSort);

    tbody.innerHTML = sorted.map(r => {
        const profitClass  = r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : 'dim';
        const tagColor     = TAG_COLORS[r.tag] || '#7a8089';
        const cantDoStyle  = !r.canDo ? 'opacity:0.45;' : '';
        const cantDoBadge  = !r.canDo
            ? `<span class="badge" style="background:rgba(248,113,113,0.15);color:#f87171;margin-left:4px;">Need skills</span>`
            : '';
        return `
        <tr style="cursor:pointer;${cantDoStyle}" data-craft-key="${escapeHtml(r.key)}">
            <td>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(r.name)}${cantDoBadge}</div>
                    <div class="item-meta">
                        <span class="badge" style="background:${tagColor}22;color:${tagColor};border:none;">${r.tag}</span>
                        ${r.reqNote ? `<span class="dim tiny">${escapeHtml(r.reqNote)}</span>` : ''}
                    </div>
                    <div class="item-meta mob-only" style="margin-top:3px;color:var(--text-dim);">
                        cost <span class="mono" style="color:var(--text);">${formatGp(r.inputCost + r.feeGp)}</span>
                        → sell <span class="mono" style="color:var(--text);">${formatGp(r.sellGross)}</span> gp
                    </div>
                </div>
            </td>
            <td class="num mono dim mob-hide">−${formatGp(r.inputCost)} gp</td>
            <td class="num mono dim mob-hide">${r.feeGp ? `−${formatGp(r.feeGp)} gp` : '<span class="dim">—</span>'}</td>
            <td class="num mono dim mob-hide">+${formatGp(r.sellGross)} gp</td>
            <td class="num mono ${profitClass} ${r.profit > 0 ? 'profit-cell' : ''}">
                ${r.profit > 0 ? '+' : ''}${formatGp(Math.round(r.profit))} gp
            </td>
            <td class="num mono ${r.dailyVolume ? volClass(r.dailyVolume) : 'dim'} mob-hide">
                ${r.dailyVolume ? r.dailyVolume.toLocaleString() : '—'}
            </td>
            ${starTd('repair', r.key)}
        </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-craft-key]').forEach(tr => {
        tr.addEventListener('click', () => {
            const key = tr.dataset.craftKey;
            const r   = sorted.find(x => x.key === key);
            if (!r) return;
            if (r._barrows) {
                openRepairModal(r._barrows);
            }
            // Assembly items: open the standard chart for the output item
            else {
                const item = state.items?.find(x => x.id === r.outId)
                          || state.searchItems?.find(x => x.id === r.outId);
                if (item) openChartModal(item);
            }
        });
    });
}
