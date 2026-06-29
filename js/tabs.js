'use strict';
// ---------- Mobile filter toggle ----------
document.getElementById('flips-filter-toggle')?.addEventListener('click', function () {
    const ctrl = document.getElementById('controls');
    const isOpen = ctrl.style.display === 'grid';
    ctrl.style.display = isOpen ? 'none' : 'grid';
    this.classList.toggle('open', !isOpen);
});

// ---------- Tabs ----------
document.querySelectorAll('#tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('#tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const which = tab.dataset.tab;
        document.getElementById('flips-tab').style.display = which === 'flips' ? 'block' : 'none';
        document.getElementById('drops-tab').style.display = which === 'drops' ? 'block' : 'none';
        document.getElementById('decant-tab').style.display = which === 'decant' ? 'block' : 'none';
        document.getElementById('repair-tab').style.display = which === 'repair' ? 'block' : 'none';
        if (which === 'drops') renderDropsTab();
        if (which === 'decant') renderDecantTab();
        if (which === 'repair') renderRepairTab();
    });
});

document.getElementById('drops-clear').addEventListener('click', () => {
    detectedDrops = [];
    persistDrops();
    renderDropsTab();
});

document.getElementById('drops-refresh').addEventListener('click', refreshDropsOnly);

document.getElementById('drop-watchlist-only').addEventListener('change', renderDropsTab);
document.getElementById('drop-min-price').addEventListener('input', renderDropsTab);
document.getElementById('drop-min-pct').addEventListener('input', renderDropsTab);
document.getElementById('drop-min-volume').addEventListener('input', renderDropsTab);

document.getElementById('drop-notify').addEventListener('change', e => {
    if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
        notificationPermissionRequested = true;
        Notification.requestPermission();
    }
});

document.getElementById('decant-direction').addEventListener('change', renderDecantTab);
document.getElementById('decant-min-profit').addEventListener('input', renderDecantTab);
document.getElementById('decant-min-volume').addEventListener('input', renderDecantTab);
document.getElementById('decant-refresh').addEventListener('click', fetchData);

document.getElementById('repair-smithing').addEventListener('input', renderRepairTab);
document.getElementById('repair-min-profit').addEventListener('input', renderRepairTab);
document.getElementById('repair-min-volume').addEventListener('input', renderRepairTab);
document.getElementById('repair-refresh').addEventListener('click', fetchData);

// Live-update the "X ago" text every 30s so the drops list stays current
// without re-rendering rows.
setInterval(() => {
    const drops = document.getElementById('drops-tab');
    if (drops && drops.style.display !== 'none') renderDropsTab();
}, 30_000);

// Restore badge from any drops loaded from localStorage
renderDropsTab();

