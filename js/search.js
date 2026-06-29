'use strict';
// ---------- Global search ----------
// Wiki-style search: types any item name → autocomplete dropdown of matches
// across the FULL mapping (not just filtered table), click to open chart.
const globalSearchInput = document.getElementById('global-search');
const globalSearchResults = document.getElementById('global-search-results');
let globalSearchActiveIdx = -1;
let globalSearchMatches = [];

function runGlobalSearch() {
    const q = globalSearchInput.value.trim().toLowerCase();
    // Search the full item pool (all items with price data), not just profitable ones.
    const pool = state.searchItems.length ? state.searchItems : state.items;
    if (!q || !pool.length) {
        globalSearchResults.classList.remove('open');
        globalSearchActiveIdx = -1;
        return;
    }
    // Rank: exact name match > startsWith > substring; tie-break by daily volume.
    const scored = [];
    for (const it of pool) {
        const n = it.name.toLowerCase();
        let score;
        if (n === q) score = 0;
        else if (n.startsWith(q)) score = 1;
        else if (n.includes(q)) score = 2;
        else continue;
        scored.push({ item: it, score });
    }
    scored.sort((a, b) => a.score - b.score || (b.item.dailyVolume || 0) - (a.item.dailyVolume || 0));
    globalSearchMatches = scored.slice(0, 12).map(s => s.item);
    globalSearchActiveIdx = globalSearchMatches.length ? 0 : -1;

    if (!globalSearchMatches.length) {
        globalSearchResults.innerHTML = '<div class="global-search-empty">No items match.</div>';
        globalSearchResults.classList.add('open');
        return;
    }
    globalSearchResults.innerHTML = globalSearchMatches.map((it, i) => {
        const iconUrl = it.icon ? getIconSrc(it.icon) : '';
        const icon = iconUrl
            ? `<img data-src="${iconUrl}" src="" alt="" onerror="this.style.visibility='hidden'">`
            : '<span style="width:22px;display:inline-block;"></span>';
        return `
            <div class="global-search-row ${i === 0 ? 'active' : ''}" data-idx="${i}">
                ${icon}
                <span class="gs-name">${escapeHtml(it.name)}</span>
                <span class="gs-price">${formatGp(it.buy)} gp</span>
            </div>
        `;
    }).join('');
    globalSearchResults.classList.add('open');
    imgLoader.observe(globalSearchResults);

    globalSearchResults.querySelectorAll('.global-search-row').forEach(row => {
        row.addEventListener('mousedown', e => {
            e.preventDefault();
            const idx = parseInt(row.dataset.idx, 10);
            selectGlobalSearch(idx);
        });
        row.addEventListener('mouseenter', () => {
            setActiveGlobalSearchRow(parseInt(row.dataset.idx, 10));
        });
    });
}

function setActiveGlobalSearchRow(idx) {
    globalSearchActiveIdx = idx;
    globalSearchResults.querySelectorAll('.global-search-row').forEach((r, i) => {
        r.classList.toggle('active', i === idx);
    });
}

function selectGlobalSearch(idx) {
    let item = globalSearchMatches[idx];
    if (!item) return;
    // Prefer the full profitable entry (has netMargin, profitPerHour, dailyVolume etc.)
    // over the lightweight searchItems entry. If the item isn't currently profitable
    // the lightweight entry is fine — the chart still loads correctly.
    const fullItem = state.items.find(x => x.id === item.id);
    if (fullItem) item = fullItem;
    globalSearchResults.classList.remove('open');
    globalSearchInput.blur();
    openChartModal(item);
}

let globalSearchTimer = null;
globalSearchInput.addEventListener('input', () => {
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(runGlobalSearch, 60);
});
globalSearchInput.addEventListener('focus', () => {
    if (globalSearchInput.value.trim()) runGlobalSearch();
});
globalSearchInput.addEventListener('blur', () => {
    // Delay so click on a row can fire before we close.
    setTimeout(() => globalSearchResults.classList.remove('open'), 150);
});
globalSearchInput.addEventListener('keydown', e => {
    if (!globalSearchResults.classList.contains('open')) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveGlobalSearchRow(Math.min(globalSearchActiveIdx + 1, globalSearchMatches.length - 1));
        scrollActiveRowIntoView();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveGlobalSearchRow(Math.max(globalSearchActiveIdx - 1, 0));
        scrollActiveRowIntoView();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (globalSearchActiveIdx >= 0) selectGlobalSearch(globalSearchActiveIdx);
    } else if (e.key === 'Escape') {
        globalSearchResults.classList.remove('open');
        globalSearchInput.blur();
    }
});

function scrollActiveRowIntoView() {
    const active = globalSearchResults.querySelector('.global-search-row.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

// ⌘K / Ctrl+K to focus the global search.
document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        globalSearchInput.focus();
        globalSearchInput.select();
    }
});
