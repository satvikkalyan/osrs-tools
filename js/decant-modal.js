'use strict';
// ---------- Decant chart modal ----------
// Shows price-history charts for both the 3-dose (buy) and 4-dose (sell)
// versions of the selected potion, side-by-side in a lightweight modal.

const decantModal = {
    result: null,
    chart3: null,
    chart4: null,
};

function openDecantModal(r) {
    decantModal.result = r;

    document.getElementById('dchart-title').textContent = r.base;
    document.getElementById('dchart-subtitle').textContent =
        `3-dose → 4-dose  ·  ${r.members ? 'Members' : 'F2P'}  ·  Buy limit ${r.buyLimit ? r.buyLimit.toLocaleString() : '—'}/4h`;

    // Snapshot stats — show batch totals to match the table columns
    setText('dchart-buy3',  formatGp(Math.round(r.cost))    + ' gp');
    setText('dchart-sell4', formatGp(Math.round(r.revenue)) + ' gp');

    const profitEl = document.getElementById('dchart-profit');
    profitEl.textContent = (r.profit > 0 ? '+' : '') + formatGp(Math.round(r.profit)) + ' gp';
    profitEl.style.color = r.profit > 0 ? 'var(--green)' : r.profit < 0 ? 'var(--red)' : '';

    const flipEl = document.getElementById('dchart-flip');
    flipEl.textContent = r.profitPerFlip != null
        ? (r.profitPerFlip > 0 ? '+' : '') + formatGp(r.profitPerFlip) + ' gp'
        : '—';
    flipEl.style.color = r.profitPerFlip > 0 ? 'var(--green)' : r.profitPerFlip < 0 ? 'var(--red)' : '';

    document.getElementById('dchart-label3').textContent = r.buyName  + '  (buying)';
    document.getElementById('dchart-label4').textContent = r.sellName + '  (selling)';

    document.getElementById('dchart-backdrop').classList.add('open');
    loadDecantCharts(r);
}

function closeDecantModal() {
    document.getElementById('dchart-backdrop').classList.remove('open');
    if (decantModal.chart3) { decantModal.chart3.destroy(); decantModal.chart3 = null; }
    if (decantModal.chart4) { decantModal.chart4.destroy(); decantModal.chart4 = null; }
    decantModal.result = null;
}

async function loadDecantCharts(r) {
    const loading = document.getElementById('dchart-loading');
    loading.style.display = 'block';

    try {
        // Fetch 7d of 5-min data for both items in parallel
        const [d3, d4] = await Promise.all([
            fetchJson(`${API_BASE}/timeseries?id=${r.buyId}&timestep=5m`),
            fetchJson(`${API_BASE}/timeseries?id=${r.sellId}&timestep=5m`),
        ]);
        const series3 = (d3.data || []).slice(-2016); // 7d × 288 pts/day
        const series4 = (d4.data || []).slice(-2016);

        renderDecantMiniChart('dchart-canvas-3', series3, 'chart3');
        renderDecantMiniChart('dchart-canvas-4', series4, 'chart4');
        loading.style.display = 'none';
    } catch (err) {
        loading.textContent = 'Failed to load history: ' + (err.message || err);
    }
}

function renderDecantMiniChart(canvasId, series, stateKey) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (decantModal[stateKey]) { decantModal[stateKey].destroy(); decantModal[stateKey] = null; }
    if (!series.length) return;

    const sellPts = series.map(p => ({ x: p.timestamp * 1000, y: p.avgHighPrice }));
    const buyPts  = series.map(p => ({ x: p.timestamp * 1000, y: p.avgLowPrice  }));

    // Highlight the last point so you can see the current price easily
    const n = series.length;
    const radii = series.map((_, i) => i === n - 1 ? 5 : 0);

    decantModal[stateKey] = new Chart(canvas, {
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

// Wire up close handlers
document.getElementById('dchart-close').addEventListener('click', closeDecantModal);
document.getElementById('dchart-backdrop').addEventListener('click', e => {
    if (e.target.id === 'dchart-backdrop') closeDecantModal();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('dchart-backdrop').classList.contains('open')) {
        closeDecantModal();
    }
});
