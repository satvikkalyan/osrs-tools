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

