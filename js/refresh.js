'use strict';
// ---------- Auto-refresh ----------
let autoRefreshIntervalS = 60;
let autoRefreshSecondsLeft = autoRefreshIntervalS;
let autoRefreshTimer = null;

function updateCountdownLabel() {
    const el = document.getElementById('auto-countdown');
    const enabled = document.getElementById('auto-refresh').checked;
    if (!el) return;
    el.textContent = enabled ? `${autoRefreshSecondsLeft}s` : '';
}

function tickAutoRefresh() {
    const enabled = document.getElementById('auto-refresh').checked;
    if (!enabled) {
        updateCountdownLabel();
        return;
    }
    autoRefreshSecondsLeft--;
    if (autoRefreshSecondsLeft <= 0) {
        autoRefreshSecondsLeft = autoRefreshIntervalS;
        fetchData();
    }
    updateCountdownLabel();
}

function startAutoRefresh() {
    if (autoRefreshTimer) return;
    autoRefreshTimer = setInterval(tickAutoRefresh, 1000);
}

document.getElementById('auto-refresh').addEventListener('change', () => {
    autoRefreshSecondsLeft = autoRefreshIntervalS;
    updateCountdownLabel();
});

document.getElementById('refresh-interval').addEventListener('change', e => {
    autoRefreshIntervalS = parseInt(e.target.value, 10);
    autoRefreshSecondsLeft = autoRefreshIntervalS;
    updateCountdownLabel();
});

// ---------- Event listeners ----------
document.getElementById('refresh').addEventListener('click', () => {
    autoRefreshSecondsLeft = autoRefreshIntervalS;
    state.page = 1;
    fetchData();
});
