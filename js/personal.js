'use strict';
// ---------- Personal watchlist (from user's trade history) ----------
const PERSONAL_KEY = 'osrs-personal-watchlist';
// Map of { id: { tradeCount, name } }, persisted to localStorage.
let personalWatchlist = (() => {
    try {
        const raw = JSON.parse(localStorage.getItem(PERSONAL_KEY) || '{}');
        return new Map(Object.entries(raw).map(([k, v]) => [parseInt(k, 10), v]));
    } catch (e) { return new Map(); }
})();

function persistPersonalWatchlist() {
    const obj = {};
    for (const [id, v] of personalWatchlist) obj[id] = v;
    try { localStorage.setItem(PERSONAL_KEY, JSON.stringify(obj)); }
    catch (e) { /* quota */ }
}

function isInPersonalWatchlist(itemId) {
    return personalWatchlist.has(itemId);
}

/**
 * Heuristic: does this look like an item you actually FLIP, vs a one-off
 * purchase / alch fodder / PvM loot dump? Returns true only if:
 *   1. The item is currently tradeable with a real GE price (>= 100gp).
 *   2. It has meaningful market liquidity (daily volume >= 1000).
 *   3. If we have buy/sell split from the import: both sides exist AND
 *      the smaller side is at least 20% of the larger (otherwise it's
 *      "sold off old stock", not flipping).
 *   4. Total transactions meet a minimum (>= 5 trades total, or >= 10
 *      across both sides when buy/sell split is known).
 *
 * Items that fail these rules stay in the imported list (we don't delete
 * data) but they don't earn the "yours" badge and don't get pinned by
 * "Yours first."
 */
function isLikelyFlip(itemId) {
    const info = personalWatchlist.get(itemId);
    if (!info) return false;
    const marketItem = state.items.find(x => x.id === itemId);
    if (!marketItem) return false;             // not in current market data
    if (!marketItem.buy || marketItem.buy < 100) return false;
    if ((marketItem.dailyVolume || 0) < 1000) return false;

    const hasSplit = (info.buyCount > 0) || (info.sellCount > 0);
    if (hasSplit) {
        if (!info.buyCount || !info.sellCount) return false; // only one side = not flipping
        const minSide = Math.min(info.buyCount, info.sellCount);
        const maxSide = Math.max(info.buyCount, info.sellCount);
        if (minSide / maxSide < 0.2) return false;            // 5× imbalance = not flipping
        if ((info.buyCount + info.sellCount) < 10) return false;
    } else {
        // No buy/sell split available — fall back to total count threshold.
        if ((info.tradeCount || 0) < 5) return false;
    }
    return true;
}

/** Are we currently filtering personal items to "likely flips only"? */
function personalFlipFilterEnabled() {
    const el = document.getElementById('personal-flips-only');
    return !el || el.checked; // default ON
}

/** Combined check used by badging + sort. */
function isPinnableYours(itemId) {
    if (!isInPersonalWatchlist(itemId)) return false;
    if (!personalFlipFilterEnabled()) return true;
    return isLikelyFlip(itemId);
}

/**
 * Parse trade-history payload (file or pasted text) and return a Map of
 * itemId -> {tradeCount, name}. Tries multiple shapes in order:
 *   1. JSON  — Flipping Utilities, Profit Tracker, or any object/array
 *              containing item-shaped fields.
 *   2. CSV   — headers like "Item Name", "Quantity", "Item ID", etc.
 *   3. Plain — whitespace/comma-separated bare item IDs.
 */
function parseTradeHistory(text) {
    const counts = new Map();
    const bump = (id, name, qty, type) => {
        const numId = parseInt(id, 10);
        if (!numId || isNaN(numId)) return;
        const prev = counts.get(numId) ||
            { tradeCount: 0, buyCount: 0, sellCount: 0, name: null };
        const q = parseInt(qty, 10) || 1;
        prev.tradeCount += q;
        if (type === 'buy') prev.buyCount += q;
        else if (type === 'sell') prev.sellCount += q;
        if (name && !prev.name) prev.name = String(name);
        counts.set(numId, prev);
    };

    // Attempt 1 — JSON
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    if (parsed != null) {
        const walk = (node) => {
            if (Array.isArray(node)) {
                for (const el of node) walk(el);
            } else if (node && typeof node === 'object') {
                const id = node.itemId ?? node.id ?? node.item_id ?? node.ItemId;
                const name = node.itemName ?? node.name ?? node.item_name ?? node.ItemName;
                const qty = node.quantity ?? node.qty ?? node.amount ?? node.Quantity ?? 1;
                // Type detection — Flipping Utilities uses isBuy, others use
                // type/side/direction with "buy"/"sell" strings.
                const typeRaw = node.type ?? node.side ?? node.direction ?? node.tradeType;
                let type = null;
                if (node.isBuy === true || node.isBuy === 'true') type = 'buy';
                else if (node.isBuy === false || node.isBuy === 'false') type = 'sell';
                else if (typeof typeRaw === 'string') {
                    const t = typeRaw.toLowerCase();
                    if (/buy|purchase|bought|in\b/.test(t)) type = 'buy';
                    else if (/sell|sale|sold|out\b/.test(t)) type = 'sell';
                }
                if (id != null && Number.isFinite(parseInt(id, 10))) {
                    bump(id, name, qty, type);
                }
                for (const k in node) walk(node[k]);
            }
        };
        walk(parsed);
        if (counts.size) return counts;
    }

    // Attempt 2 — CSV. Detect by the presence of commas + newlines and
    // a first row that contains at least one non-numeric header.
    const looksCSV = text.includes(',') && /\n/.test(text);
    if (looksCSV) {
        const csvCounts = parseCSV(text);
        if (csvCounts && csvCounts.size) return csvCounts;
    }

    // Attempt 3 — plain-text fallback: any digit group is treated as an
    // item ID. Useful for hand-rolled lists.
    for (const tok of text.split(/[\s,;]+/)) {
        if (/^\d+$/.test(tok)) bump(tok, null, 1);
    }
    return counts;
}

/**
 * CSV parser tuned for trade-export files. Tolerates quoted fields with
 * embedded commas, looks at the header row to find the item-ID and/or
 * item-name columns, and resolves names against the cached mapping when
 * only names are provided.
 */
function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (lines.length < 2) return null;

    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const idCol   = headers.findIndex(h => /^item.?id$|^id$/.test(h));
    const nameCol = headers.findIndex(h => /^item.?name$|^name$|^item$/.test(h));
    const qtyCol  = headers.findIndex(h => /quantity|qty|amount|count/i.test(h));
    const typeCol = headers.findIndex(h => /^type$|^side$|tradetype|direction|buysell|^isbuy$/i.test(h));

    if (idCol === -1 && nameCol === -1) return null;

    // Build name → id lookup from cached mapping when we only have names.
    const mapping = apiCache.mapping || [];
    const nameToId = new Map(mapping.map(m => [m.name.toLowerCase(), m.id]));

    const result = new Map();
    const bumpResult = (id, name, qty, type) => {
        const prev = result.get(id) ||
            { tradeCount: 0, buyCount: 0, sellCount: 0, name: null };
        prev.tradeCount += qty;
        if (type === 'buy') prev.buyCount += qty;
        else if (type === 'sell') prev.sellCount += qty;
        if (name && !prev.name) prev.name = name;
        result.set(id, prev);
    };

    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        let id = null;
        let name = null;
        if (idCol >= 0) {
            const raw = parseInt(row[idCol], 10);
            if (Number.isFinite(raw)) id = raw;
        }
        if (nameCol >= 0) {
            name = (row[nameCol] || '').trim();
            if (name && !id) {
                const lookup = nameToId.get(name.toLowerCase());
                if (lookup) id = lookup;
            }
        }
        if (!id) continue;
        const qty = qtyCol >= 0 ? (parseInt(row[qtyCol], 10) || 1) : 1;

        let type = null;
        if (typeCol >= 0) {
            const raw = (row[typeCol] || '').trim().toLowerCase();
            if (raw === 'true' || raw === '1') type = 'buy';   // isBuy=true
            else if (raw === 'false' || raw === '0') type = 'sell';
            else if (/buy|purchase|bought|^in$/.test(raw)) type = 'buy';
            else if (/sell|sale|sold|^out$/.test(raw)) type = 'sell';
        }
        bumpResult(id, name || null, qty, type);
    }
    return result;
}

/** Single-line CSV parser — handles quoted fields with embedded commas. */
function parseCSVLine(line) {
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else { inQuote = !inQuote; }
        } else if (c === ',' && !inQuote) {
            out.push(cur);
            cur = '';
        } else {
            cur += c;
        }
    }
    out.push(cur);
    return out;
}

function mergeIntoPersonalWatchlist(newCounts) {
    let added = 0;
    let updated = 0;
    for (const [id, info] of newCounts) {
        if (personalWatchlist.has(id)) {
            const existing = personalWatchlist.get(id);
            existing.tradeCount += info.tradeCount;
            if (info.name && !existing.name) existing.name = info.name;
            updated++;
        } else {
            personalWatchlist.set(id, { tradeCount: info.tradeCount, name: info.name });
            added++;
        }
    }
    persistPersonalWatchlist();
    return { added, updated };
}

function renderPersonalList() {
    const el = document.getElementById('import-list');
    if (!el) return;
    if (!personalWatchlist.size) {
        el.innerHTML = '<div class="import-empty">No personal watchlist yet — import or paste to add items.</div>';
        return;
    }
    const mapping = apiCache.mapping || [];
    const nameById = new Map(mapping.map(m => [m.id, m.name]));

    // Sort: likely flips first (alphabetical-ish), then non-flips
    const entries = Array.from(personalWatchlist.entries())
        .sort((a, b) => {
            const af = isLikelyFlip(a[0]) ? 1 : 0;
            const bf = isLikelyFlip(b[0]) ? 1 : 0;
            if (af !== bf) return bf - af;
            return (b[1].tradeCount || 0) - (a[1].tradeCount || 0);
        });

    let flipCount = 0;
    const rows = entries.map(([id, info]) => {
        const name = info.name || nameById.get(id) || `Item ${id}`;
        const flip = isLikelyFlip(id);
        if (flip) flipCount++;
        const splitText = (info.buyCount || info.sellCount)
            ? `${info.buyCount || 0}B / ${info.sellCount || 0}S`
            : `${info.tradeCount || 0} txns`;
        const badge = flip
            ? '<span class="badge badge-yours" style="margin-left:0">★ flip</span>'
            : '<span class="badge badge-stale" style="margin-left:0" title="Filtered: low volume, no GE market, one-sided history, or too few trades.">filtered</span>';
        return `
            <div class="import-list-item">
                <span>${escapeHtml(name)} <span class="dim">· id ${id} · ${splitText}</span> ${badge}</span>
                <span class="remove" data-id="${id}" title="Remove from watchlist">✕</span>
            </div>
        `;
    }).join('');

    el.innerHTML = `
        <div class="import-list-summary">
            ${flipCount} flip-worthy / ${personalWatchlist.size} total imported.
            ${personalWatchlist.size - flipCount > 0
                ? `<span class="dim">${personalWatchlist.size - flipCount} filtered out (low volume, one-sided, or non-tradeable).</span>`
                : ''}
        </div>
        ${rows}
    `;
    el.querySelectorAll('.remove').forEach(rem => {
        rem.addEventListener('click', () => {
            personalWatchlist.delete(parseInt(rem.dataset.id, 10));
            persistPersonalWatchlist();
            renderPersonalList();
            render();
            renderDropsTab();
        });
    });
}

function showImportStatus(msg, kind /* 'ok' | 'err' */) {
    const el = document.getElementById('import-status');
    el.className = 'import-status ' + (kind || 'ok');
    el.textContent = msg;
}

