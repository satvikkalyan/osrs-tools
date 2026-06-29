'use strict';
// ---------- Render ----------
function render() {
    const filtered = applyFilters();
    const sorted = sortItems(filtered);

    const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const rendered = sorted.slice(start, start + state.pageSize);

    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
    document.getElementById('loading').style.display = 'none';
    document.getElementById('table-wrap').style.display = 'block';
    document.getElementById('stats').style.display = 'grid';
    // On mobile, controls start hidden — the filter toggle button reveals them.
    // On desktop, show immediately.
    if (!isMobile()) {
        document.getElementById('controls').style.display = 'grid';
    }
    // Show the filter toggle button on mobile only
    const toggleBtn = document.getElementById('flips-filter-toggle');
    if (toggleBtn) toggleBtn.style.display = isMobile() ? 'flex' : 'none';

    // Stats
    setText('stat-scanned', state.items.length.toLocaleString());
    setText('stat-scanned-sub', 'with a profitable margin');
    setText('stat-shown', filtered.length.toLocaleString());
    setText('stat-shown-sub', filtered.length === state.items.length ? 'all filters off' : 'after filters');
    if (sorted.length) {
        setText('stat-top', formatGp(sorted[0].profitPerHour) + '/hr');
        setText('stat-top-sub', sorted[0].name);
    } else {
        setText('stat-top', '—');
        setText('stat-top-sub', '');
    }
    const pcts = sorted.map(i => i.marginPct).sort((a, b) => a - b);
    const median = pcts.length ? pcts[Math.floor(pcts.length / 2)] : 0;
    setText('stat-median', median.toFixed(1) + '%');

    // Meta
    if (state.fetchedAt) {
        const when = new Date(state.fetchedAt).toLocaleTimeString();
        setText('meta', `Updated ${when} · live OSRS Wiki prices`);
    }

    // Table
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = rendered.map((it, i) => rowHtml(it, i)).join('');
    imgLoader.observe(tbody);
    tbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => {
            const id = parseInt(tr.dataset.itemId, 10);
            const item = state.items.find(x => x.id === id);
            if (item) openChartModal(item);
        });
    });
    setText('row-status', `${filtered.length.toLocaleString()} items · page ${state.page} of ${totalPages}`);

    // Pagination controls
    const paginationEl = document.getElementById('pagination');
    if (paginationEl) {
        const pages = [];
        // Always show first, last, and neighbours of current page
        const range = new Set([1, totalPages, state.page, state.page - 1, state.page + 1].filter(p => p >= 1 && p <= totalPages));
        const sorted_pages = [...range].sort((a, b) => a - b);
        let html = `<button ${state.page === 1 ? 'disabled' : ''} onclick="goToPage(${state.page - 1})">‹ Prev</button>`;
        let prev = 0;
        for (const p of sorted_pages) {
            if (p - prev > 1) html += `<span class="pagination-info">…</span>`;
            html += `<button class="${p === state.page ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
            prev = p;
        }
        html += `<button ${state.page === totalPages ? 'disabled' : ''} onclick="goToPage(${state.page + 1})">Next ›</button>`;
        html += `<select class="page-size-select" onchange="changePageSize(this.value)" title="Rows per page">
            ${[25,50,100].map(n => `<option value="${n}" ${n === state.pageSize ? 'selected' : ''}>${n} / page</option>`).join('')}
        </select>`;
        paginationEl.innerHTML = html;
    }

    // "Yours first" empty notice
    const yoursNotice = document.getElementById('yours-empty-notice');
    if (yoursNotice) {
        const yoursOn = document.getElementById('filter-yours-first') &&
                        document.getElementById('filter-yours-first').checked;
        yoursNotice.style.display = (yoursOn && personalWatchlist.size === 0) ? 'block' : 'none';
    }

    // Sort header state
    document.querySelectorAll('th[data-sort]').forEach(th => {
        const isSorted = th.dataset.sort === state.sortBy;
        th.classList.toggle('sorted', isSorted);
        th.classList.toggle('asc', isSorted && state.sortDir === 'asc');
        th.classList.toggle('desc', isSorted && state.sortDir === 'desc');
    });
}

function rowHtml(item, idx) {
    const isStale = item.ageMin > 60;
    const isVeryStale = item.ageMin > 240;
    const isHot = !isStale && item.volume > 1000 && item.marginPct > 3;
    const iconUrl = item.icon
        ? getIconSrc(item.icon)
        : '';
    const icon = iconUrl
        ? `<img class="item-icon" data-src="${iconUrl}" src="" alt="" onerror="this.outerHTML='<div class=icon-placeholder></div>'">`
        : '<div class="icon-placeholder"></div>';
    const badges = [];
    badges.push(`<span class="badge ${item.members ? 'badge-mem' : 'badge-f2p'}">${item.members ? 'P2P' : 'F2P'}</span>`);
    if (isPinnableYours(item.id)) {
        const meta = personalWatchlist.get(item.id);
        const detail = meta
            ? ` (${meta.buyCount || 0} buys / ${meta.sellCount || 0} sells)`
            : '';
        badges.push(`<span class="badge badge-yours" title="In your imported trade history${detail}">★ yours</span>`);
    }
    if (item.taxExempt) badges.push(`<span class="badge badge-hot" title="Exempt from the 1% GE tax">tax-free</span>`);
    if (isHot) badges.push(`<span class="badge badge-hot">hot</span>`);
    if (isVeryStale) badges.push(`<span class="badge badge-stale">stale</span>`);
    if (item.lopsided) badges.push(`<span class="badge badge-stale" title="Buy/sell volume is lopsided — one side may stall">1-sided</span>`);

    const marginPctClass = item.marginPct >= 3 ? 'pos' : (item.marginPct < 1 ? 'dim' : '');
    const ageDisplay = item.ageMin < 60
        ? Math.round(item.ageMin) + 'm'
        : item.ageMin < 1440 ? Math.round(item.ageMin / 60) + 'h' : Math.round(item.ageMin / 1440) + 'd';
    const ageClass = isVeryStale ? 'neg' : isStale ? 'dim' : '';

    return `
        <tr data-item-id="${item.id}">
            <td>
                <div class="item-cell">
                    ${icon}
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(item.name)}</div>
                        <div class="item-meta">${badges.join(' ')}</div>
                    </div>
                </div>
            </td>
            <td class="num mono">${formatGp(item.buy)}</td>
            <td class="num mono mob-hide">${formatGp(item.sell)}</td>
            <td class="num mono neg mob-hide">${item.tax ? '−' + formatGp(item.tax) : '<span class="dim">—</span>'}</td>
            <td class="num mono pos">${formatGp(item.netMargin)}</td>
            <td class="num mono mob-hide ${marginPctClass}">${item.marginPct.toFixed(1)}%</td>
            <td class="num mono ${volClass(item.dailyVolume)}" title="Daily total: ${item.dailyVolume.toLocaleString()}  ·  1h: ${item.volume.toLocaleString()} (min of buy/sell)">${item.dailyVolume.toLocaleString()}</td>
            <td class="num mono mob-hide">${item.buyLimit ? item.buyLimit.toLocaleString() : '<span class="dim">—</span>'}</td>
            <td class="num mono mob-hide ${ageClass}">${ageDisplay}</td>
            <td class="num mono profit-cell">${formatGp(item.profitPerHour)}</td>
        </tr>
    `;
}

