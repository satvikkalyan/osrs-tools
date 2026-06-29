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

document.getElementById('yours-open-import')?.addEventListener('click', e => {
    e.preventDefault();
    openImportModal();
});

document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', e => {
        const k   = th.dataset.sort;
        const keys = state.sortKeys;

        if (e.shiftKey) {
            // Shift+click: add/toggle a secondary sort
            const idx = keys.findIndex(s => s.key === k);
            if (idx === 0) {
                // Shift-clicking the primary just toggles its direction
                keys[0].dir = keys[0].dir === 'asc' ? 'desc' : 'asc';
            } else if (idx > 0) {
                // Already a secondary — toggle direction
                keys[idx].dir = keys[idx].dir === 'asc' ? 'desc' : 'asc';
            } else {
                // New secondary sort — append
                keys.push({ key: k, dir: k === 'name' ? 'asc' : 'desc' });
            }
        } else {
            // Regular click: replace all sorts with just this column
            const existing = keys.find(s => s.key === k);
            const newDir = existing && keys[0].key === k
                ? (existing.dir === 'asc' ? 'desc' : 'asc')
                : (k === 'name' ? 'asc' : 'desc');
            state.sortKeys = [{ key: k, dir: newDir }];
        }

        // Keep backward-compat aliases in sync
        state.sortBy  = state.sortKeys[0].key;
        state.sortDir = state.sortKeys[0].dir;
        state.page = 1;
        render();
    });
});

// ---------- Keyboard navigation (j/k or ↑/↓, Enter to open, s to star) ----------
(function () {
    let selectedId = null;

    function getRows() {
        return [...document.querySelectorAll('#tbody tr[data-item-id]')];
    }

    function setSelected(id) {
        selectedId = id;
        getRows().forEach(tr => {
            tr.classList.toggle('kb-selected', +tr.dataset.itemId === id);
            if (+tr.dataset.itemId === id) {
                tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
    }

    function move(delta) {
        const rows = getRows();
        if (!rows.length) return;
        const idx = rows.findIndex(tr => +tr.dataset.itemId === selectedId);
        const next = idx === -1 ? (delta > 0 ? 0 : rows.length - 1)
                                : Math.max(0, Math.min(rows.length - 1, idx + delta));
        setSelected(+rows[next].dataset.itemId);
    }

    document.addEventListener('keydown', e => {
        // Don't fire if user is typing in an input/select
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        // Don't fire if any modal is open
        if (document.querySelector('.modal-backdrop.open')) return;

        if (e.key === 'j' || e.key === 'ArrowDown')  { e.preventDefault(); move(+1); }
        if (e.key === 'k' || e.key === 'ArrowUp')    { e.preventDefault(); move(-1); }
        if (e.key === 'Enter' && selectedId) {
            const item = state.items?.find(x => x.id === selectedId);
            if (item) openChartModal(item);
        }
        if (e.key === 's' && selectedId) {
            toggleFav('flips', selectedId);
        }
        if (e.key === 'Escape') { setSelected(null); }
    });

    // Clicking a row also sets it as keyboard-selected
    document.getElementById('tbody').addEventListener('click', e => {
        const tr = e.target.closest('tr[data-item-id]');
        if (tr) setSelected(+tr.dataset.itemId);
    }, true);
})();

