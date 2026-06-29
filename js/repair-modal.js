'use strict';
// ---------- Repair chart modal ----------
// Shows price-history charts for both the broken (buy) and repaired (sell)
// versions of the selected Barrows item.

const repairModal = {
    result: null,
    chartBroken:   null,
    chartRepaired: null,
};

function openRepairModal(r) {
    repairModal.result = r;

    document.getElementById('rchart-title').textContent = r.name;
    document.getElementById('rchart-subtitle').textContent =
        `Buy "${r.brokenName}" → repair → sell "${r.name}"  ·  limit ${r.buyLimit}/4h`;

    // Snapshot stats
    setText('rchart-buy',    formatGp(r.buyCost)    + ' gp');
    setText('rchart-repair', formatGp(r.repairCost) + ' gp');
    setText('rchart-sell',   formatGp(r.sellGross)  + ' gp');

    const profitEl = document.getElementById('rchart-profit');
    profitEl.textContent = (r.profit > 0 ? '+' : '') + formatGp(Math.round(r.profit)) + ' gp';
    profitEl.style.color = r.profit > 0 ? 'var(--green)' : r.profit < 0 ? 'var(--red)' : '';

    document.getElementById('rchart-label-broken').textContent   = r.brokenName   + '  (buying)';
    document.getElementById('rchart-label-repaired').textContent = r.name + '  (selling)';

    document.getElementById('rchart-backdrop').classList.add('open');
    loadRepairCharts(r);
}

function closeRepairModal() {
    document.getElementById('rchart-backdrop').classList.remove('open');
    if (repairModal.chartBroken)   { repairModal.chartBroken.destroy();   repairModal.chartBroken   = null; }
    if (repairModal.chartRepaired) { repairModal.chartRepaired.destroy(); repairModal.chartRepaired = null; }
    repairModal.result = null;
}

async function loadRepairCharts(r) {
    const loading = document.getElementById('rchart-loading');
    loading.style.display = 'block';

    try {
        const [dBroken, dRepaired] = await Promise.all([
            fetchJson(`${API_BASE}/timeseries?id=${r.brokenId}&timestep=5m`),
            fetchJson(`${API_BASE}/timeseries?id=${r.repairedId}&timestep=5m`),
        ]);
        const seriesBroken   = (dBroken.data   || []).slice(-2016); // last 7 days
        const seriesRepaired = (dRepaired.data || []).slice(-2016);

        renderRepairMiniChart('rchart-canvas-broken',   seriesBroken,   'chartBroken');
        renderRepairMiniChart('rchart-canvas-repaired', seriesRepaired, 'chartRepaired');
        loading.style.display = 'none';
    } catch (err) {
        loading.textContent = 'Failed to load history: ' + (err.message || err);
    }
}

function renderRepairMiniChart(canvasId, series, stateKey) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (repairModal[stateKey]) { repairModal[stateKey].destroy(); repairModal[stateKey] = null; }
    if (!series.length) return;

    const sellPts = series.map(p => ({ x: p.timestamp * 1000, y: p.avgHighPrice }));
    const buyPts  = series.map(p => ({ x: p.timestamp * 1000, y: p.avgLowPrice  }));

    const n = series.length;
    const radii = series.map((_, i) => i === n - 1 ? 5 : 0);

    repairModal[stateKey] = new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Sell (high)',
                    data: sellPts,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74,222,128,0.07)',
                    fill: false,
                    stepped: 'after',
                    tension: 0,
                    pointRadius: radii,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#4ade80',
                    borderWidth: 1.5,
                    spanGaps: true,
                },
                {
                    label: 'Buy (low)',
                    data: buyPts,
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96,165,250,0.07)',
                    fill: '-1',
                    stepped: 'after',
                    tension: 0,
                    pointRadius: radii,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#60a5fa',
                    borderWidth: 1.5,
                    spanGaps: true,
                },
            ],
        },
        options: chartOptions({ valueAxis: true }),
    });
}

// Close handlers
document.getElementById('rchart-close').addEventListener('click', closeRepairModal);
document.getElementById('rchart-backdrop').addEventListener('click', e => {
    if (e.target.id === 'rchart-backdrop') closeRepairModal();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('rchart-backdrop').classList.contains('open')) {
        closeRepairModal();
    }
});
