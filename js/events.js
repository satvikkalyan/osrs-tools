'use strict';
let renderTimer = null;
function debouncedRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { if (state.items.length) { state.page = 1; render(); } }, 80);
}

function goToPage(p) {
    state.page = p;
    render();
    document.getElementById('table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function changePageSize(n) {
    state.pageSize = parseInt(n, 10);
    state.page = 1;
    render();
}

['filter-search', 'filter-min-margin', 'filter-min-volume', 'filter-max-price'].forEach(id => {
    document.getElementById(id).addEventListener('input', debouncedRender);
});
['filter-stale', 'filter-members', 'filter-yours-first'].forEach(id => {
    document.getElementById(id).addEventListener('change', debouncedRender);
});

document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (state.sortBy === k) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortBy = k;
            state.sortDir = k === 'name' ? 'asc' : 'desc';
        }
        state.page = 1;
        render();
    });
});

