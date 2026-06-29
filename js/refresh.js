'use strict';
// ---------- Auto-refresh ----------
let autoRefreshIntervalS = 60;
let autoRefreshSecondsLeft = autoRefreshIntervalS;
let autoRefreshTimer = null;

// Inactivity pause — stop hitting the API when the tab has been hidden for
// more than 15 minutes. Resume with an immediate fetch when the user returns.
const INACTIVITY_PAUSE_MS = 15 * 60 * 1000;
let hiddenAt = null;

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
    } else {
        if (hiddenAt !== null && (Date.now() - hiddenAt) >= INACTIVITY_PAUSE_MS) {
            const enabled = document.getElementById('auto-refresh')?.checked;
            if (enabled) {
                fetchData();
                autoRefreshSecondsLeft = autoRefreshIntervalS;
            }
        }
        hiddenAt = null;
    }
});

function updateCountdownLabel() {
    const el = document.getElementById('auto-countdown');
    const enabled = document.getElementById('auto-refresh').checked;
    if (!el) return;
    el.textContent = enabled ? `${autoRefreshSecondsLeft}s` : '';
}

function tickAutoRefresh() {
    // Don't burn API quota while hidden — visibilitychange will catch up on return.
    if (document.visibilityState === 'hidden') return;

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
