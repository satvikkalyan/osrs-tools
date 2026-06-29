'use strict';
// ---------- Favorites ----------
// Star any item from Flips, Drops, Decant, or Repair to pin it here.
// Stored in localStorage per category. Card-based UI with live stats.

const FAV_LS = {
    flips:  'osrs-fav-flips',
    drops:  'osrs-fav-drops',
    decant: 'osrs-fav-decant',
    repair: 'osrs-fav-repair',
};

// Parse stored arrays as strings so Set.has() is consistent
const favs = {
    flips:  new Set(JSON.parse(localStorage.getItem(FAV_LS.flips)  || '[]').map(String)),
    drops:  new Set(JSON.parse(localStorage.getItem(FAV_LS.drops)  || '[]').map(String)),
    decant: new Set(JSON.parse(localStorage.getItem(FAV_LS.decant) || '[]')),
    repair: new Set(JSON.parse(localStorage.getItem(FAV_LS.repair) || '[]')),
};

function saveFavs() {
    for (const [type, lsKey] of Object.entries(FAV_LS)) {
        localStorage.setItem(lsKey, JSON.stringify([...favs[type]]));
    }
}

function isFav(type, key) {
    return favs[type].has(String(key));
}

function toggleFav(type, key) {
    const k = String(key);
    if (favs[type].has(k)) favs[type].delete(k);
    else                    favs[type].add(k);
    saveFavs();
    // Update all matching star buttons in the DOM
    document.querySelectorAll(`.star-btn[data-fav-type="${type}"]`).forEach(btn => {
        if (String(btn.dataset.favKey) === k) {
            const on = favs[type].has(k);
            btn.classList.toggle('starred', on);
            btn.textContent = on ? '★' : '☆';
            btn.title = on ? 'Remove from favorites' : 'Add to favorites';
        }
    });
    updateFavBadge();
    // Live-update the favorites tab if it's open
    if (document.getElementById('favorites-tab')?.style.display !== 'none') {
        renderFavoritesTab();
    }
}

// Intercept star-button clicks BEFORE the row-click handler runs (capture phase)
document.addEventListener('click', e => {
    const btn = e.target.closest('.star-btn');
    if (!btn || !btn.dataset.favType) return;
    e.stopPropagation();
    toggleFav(btn.dataset.favType, btn.dataset.favKey);
}, true);

// Helper — returns the <td> containing the star button
function starTd(type, key) {
    const on = isFav(type, key);
    return `<td class="star-col"><button class="star-btn${on ? ' starred' : ''}" data-fav-type="${type}" data-fav-key="${escapeHtml(String(key))}" title="${on ? 'Remove from favorites' : 'Add to favorites'}" aria-label="Favorite">${on ? '★' : '☆'}</button></td>`;
}

function updateFavBadge() {
    const total = favs.flips.size + favs.drops.size + favs.decant.size + favs.repair.size;
    const badge = document.getElementById('favorites-badge');
    if (!badge) return;
    badge.textContent = total;
    badge.style.display = total ? 'inline-block' : 'none';
}

// ─── Card renderers ──────────────────────────────────────────────────────────

const CAT_META = {
    flips:  { label: 'Flip',   color: '#60a5fa' },
    drops:  { label: 'Drop',   color: '#f87171' },
    decant: { label: 'Decant', color: '#4ade80' },
    repair: { label: 'Repair', color: '#fbbf24' },
};

function statPair(l1, v1, c1, l2, v2, c2) {
    return `
    <div class="fav-stat"><div class="fav-sl">${l1}</div><div class="fav-sv ${c1 || ''}">${v1}</div></div>
    <div class="fav-stat"><div class="fav-sl">${l2}</div><div class="fav-sv ${c2 || ''}">${v2}</div></div>`;
}

function favCardWrap(type, key, iconHtml, name, subtitle, statsHtml) {
    const { color, label } = CAT_META[type];
    return `
    <div class="fav-card" data-fav-type="${type}" data-fav-key="${escapeHtml(String(key))}" style="--cc:${color}" role="button" tabindex="0">
        <div class="fav-card-top">
            <span class="fav-cat" style="color:${color}">${label}</span>
            <button class="star-btn starred" data-fav-type="${type}" data-fav-key="${escapeHtml(String(key))}" title="Remove from favorites" aria-label="Remove">★</button>
        </div>
        <div class="fav-item-row">${iconHtml}<div><div class="fav-item-name">${escapeHtml(name)}</div>${subtitle ? `<div class="fav-item-sub dim">${subtitle}</div>` : ''}</div></div>
        <div class="fav-stats">${statsHtml}</div>
    </div>`;
}

function flipCard(item) {
    const iconHtml = item.icon
        ? `<img class="fav-icon" data-src="${getIconSrc(item.icon)}" src="" alt="" onerror="this.style.display='none'">`
        : '<span class="fav-icon-ph"></span>';
    const pc = item.netMargin > 0 ? 'pos' : item.netMargin < 0 ? 'neg' : '';
    return favCardWrap('flips', item.id, iconHtml, item.name,
        (item.members ? 'P2P' : 'F2P') + ' · limit ' + (item.buyLimit?.toLocaleString() || '—') + '/4h',
        statPair('Buy',         formatGp(item.buy) + ' gp',                              '',
                 'Sell',        formatGp(item.sell) + ' gp',                              '') +
        statPair('Profit/item', (item.netMargin > 0 ? '+' : '') + formatGp(item.netMargin) + ' gp', pc,
                 'Profit/flip', item.profitPerFlip ? formatGp(item.profitPerFlip) : '—',  'pos')
    );
}

function dropCard(drop) {
    const iconHtml = drop.icon
        ? `<img class="fav-icon" data-src="${getIconSrc(drop.icon)}" src="" alt="" onerror="this.style.display='none'">`
        : '<span class="fav-icon-ph"></span>';
    const elapsedMin = Math.floor((Date.now() - drop.detectedAt) / 60000);
    const sub = elapsedMin < 1 ? 'just now' : elapsedMin < 60 ? elapsedMin + 'm ago' : Math.floor(elapsedMin / 60) + 'h ago';
    return favCardWrap('drops', drop.itemId, iconHtml, drop.name, '',
        statPair('Was',    formatGp(drop.fromPrice) + ' gp', '',
                 'Now',    formatGp(drop.toPrice)   + ' gp', '') +
        statPair('Drop',   '−' + drop.dropPct.toFixed(1) + '%', 'neg',
                 'When',   sub, '')
    );
}

function decantCard(r) {
    const pc = r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : '';
    return favCardWrap('decant', r.base, '', r.base,
        (r.members ? 'P2P' : 'F2P') + ' · limit ' + (r.buyLimit?.toLocaleString() || '—') + '/4h',
        statPair('Profit/batch', (r.profit > 0 ? '+' : '') + formatGp(Math.round(r.profit)) + ' gp', pc,
                 'Profit/flip',  r.profitPerFlip != null ? formatGp(r.profitPerFlip) + ' gp' : '—', r.profitPerFlip > 0 ? 'pos' : '') +
        statPair('Batch cost',   formatGp(Math.round(r.cost)) + ' gp', '',
                 'Daily vol',    r.dailyVolume?.toLocaleString() || '—', '')
    );
}

function repairCard(r) {
    const pc = r.profit > 0 ? 'pos' : r.profit < 0 ? 'neg' : '';
    return favCardWrap('repair', r.name, '', r.name,
        'limit ' + (r.buyLimit?.toLocaleString() || '—') + '/4h',
        statPair('Buy broken',  formatGp(r.buyCost)    + ' gp', '',
                 'Repair cost', formatGp(r.repairCost) + ' gp', '') +
        statPair('Profit/item', (r.profit > 0 ? '+' : '') + formatGp(Math.round(r.profit)) + ' gp', pc,
                 'Daily vol',   r.dailyVolume?.toLocaleString() || '—', '')
    );
}

// ─── Tab render ──────────────────────────────────────────────────────────────

function renderFavoritesTab() {
    const grid  = document.getElementById('favorites-grid');
    const empty = document.getElementById('favorites-empty');
    if (!grid) return;

    // If data hasn't loaded yet, show a brief loading state and bail out.
    // onDataRefreshed() (called unconditionally) will re-invoke us once data arrives.
    if (!state.items.length && !state.searchItems?.length) {
        const total = favs.flips.size + favs.drops.size + favs.decant.size + favs.repair.size;
        if (total > 0) {
            empty.style.display = 'none';
            grid.innerHTML = '<div class="fav-loading">Loading price data…</div>';
        }
        return;
    }

    const cards = [];

    for (const idStr of favs.flips) {
        // Use String comparison to be safe against numeric/string ID type mismatch
        const item = state.items?.find(x => String(x.id) === idStr)
                  || state.searchItems?.find(x => String(x.id) === idStr);
        if (item) cards.push(flipCard(item));
    }
    for (const idStr of favs.drops) {
        const drop = detectedDrops.find(d => String(d.itemId) === idStr);
        if (drop) cards.push(dropCard(drop));
    }
    for (const base of favs.decant) {
        const r = decantResults.find(r => r.base === base);
        if (r) cards.push(decantCard(r));
    }
    for (const name of favs.repair) {
        const r = repairResults.find(r => r.name === name);
        if (r) cards.push(repairCard(r));
    }

    if (!cards.length) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    grid.innerHTML = cards.join('');
    imgLoader.observe(grid);

    grid.querySelectorAll('.fav-card').forEach(card => {
        const open = () => {
            const type = card.dataset.favType;
            const key  = card.dataset.favKey;
            if (type === 'flips' || type === 'drops') {
                const id   = parseInt(key, 10);
                const item = state.items?.find(x => x.id === id)
                          || state.searchItems?.find(x => x.id === id);
                if (item) openChartModal(item);
            } else if (type === 'decant') {
                const r = decantResults.find(r => r.base === key);
                if (r) openDecantModal(r);
            } else if (type === 'repair') {
                const r = repairResults.find(r => r.name === key);
                if (r) openRepairModal(r);
            }
        };
        card.addEventListener('click',   e => { if (!e.target.closest('.star-btn')) open(); });
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
}

// Hook into fetchData completion — called after api.js sets state.
// Always re-render so that if the user hit the favorites tab before data
// loaded (showing an empty grid), the cards appear as soon as data arrives.
function onDataRefreshed() {
    renderFavoritesTab();
}

updateFavBadge();
