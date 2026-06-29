'use strict';
// ---------- Helpers ----------
function formatGp(n) {
    // Always render exact gp with commas — never abbreviate to K/M/B.
    // Exact numbers are what you actually need to type into the GE.
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString();
}

function escapeHtml(s) {
    return String(s).replace(/[<>&"']/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Volume colour thresholds — applied to the daily-volume cell everywhere.
// Green ≥ 1M  |  Yellow ≥ 300k  |  Orange ≥ 50k  |  Red < 50k
function volClass(vol) {
    if (!vol) return 'vol-red';
    if (vol >= 1_000_000) return 'vol-green';
    if (vol >= 300_000)   return 'vol-yellow';
    if (vol >= 50_000)    return 'vol-orange';
    return 'vol-red';
}

// ── Generic table sort helpers (Decant / Repair / Drops tabs) ────────────────
function applySortArr(arr, key, dir) {
    return [...arr].sort((a, b) => {
        const va = a[key] ?? 0;
        const vb = b[key] ?? 0;
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return dir === 'asc' ? cmp : -cmp;
    });
}

function syncSortHeaders(tableEl, sortState) {
    if (!tableEl) return;
    tableEl.querySelectorAll('th[data-sort]').forEach(th => {
        const active = th.dataset.sort === sortState.by;
        th.classList.toggle('sorted', active);
        th.classList.toggle('asc',    active && sortState.dir === 'asc');
        th.classList.toggle('desc',   active && sortState.dir === 'desc');
    });
}

function attachTableSort(tableEl, sortState, renderFn) {
    if (!tableEl) return;
    tableEl.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const k = th.dataset.sort;
            if (sortState.by === k) {
                sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.by = k;
                sortState.dir = (k === 'name' || k === 'base') ? 'asc' : 'desc';
            }
            renderFn();
        });
    });
}

function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
}

function setLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('table-wrap').style.display = 'none';
}
function showError(msg) {
    const el = document.getElementById('error-box');
    el.innerHTML = `<div class="error"><strong>Couldn't load prices.</strong><br><br>${escapeHtml(msg)}<br><br>If this is a CORS error, run this page over HTTP (e.g. open via a local server) rather than a <code>file://</code> URL — some browsers block cross-origin requests from <code>file://</code>.</div>`;
    document.getElementById('loading').style.display = 'none';
}
function hideError() {
    document.getElementById('error-box').innerHTML = '';
}

