'use strict';
// ---------- Chart modal ----------
const chartState = {
    item: null,
    timestep: '1h',
    rangeLabel: '7d',
    priceChart: null,
    volumeChart: null,
};

function openChartModal(item) {
    chartState.item = item;
    document.getElementById('modal-backdrop').classList.add('open');

    // Header
    document.getElementById('modal-title').textContent = item.name;
    document.getElementById('modal-subtitle').textContent =
        (item.members ? 'Members · ' : 'F2P · ') +
        `Buy limit ${item.buyLimit ? item.buyLimit.toLocaleString() : '—'} per 4h` +
        (item.taxExempt ? '  ·  Tax-exempt' : '');
    const icon = document.getElementById('modal-icon');
    icon.src = item.icon ? getIconSrc(item.icon) : '';
    icon.style.display = item.icon ? 'inline-block' : 'none';

    // Snapshot stats (current values, after-tax)
    setText('modal-buy', formatGp(item.buy));
    setText('modal-sell', formatGp(item.sell));
    setText('modal-profit', formatGp(item.netMargin));
    setText('modal-pph', formatGp(item.profitPerHour));
    setText('modal-daily-vol', (item.dailyVolume || 0).toLocaleString());
    // Show the recent 1h liquidity under the daily total so the gap
    // between "what's been traded today" and "what's trading right now"
    // is visible at a glance.
    setText('modal-vol-breakdown', `1h: ${(item.volume || 0).toLocaleString()} (min of buy/sell)`);

    // Reset to default range (6h) on every open so the user always starts
    // on the same view regardless of where they left the last chart.
    document.querySelectorAll('#range-buttons .range-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.label === '6h');
    });
    chartState.timestep = '5m';
    chartState.rangeLabel = '6h';

    // Pre-fill the calculator quantity with the item's 4h buy limit (or a
    // sane default if there's no published limit).
    document.getElementById('calc-qty').value = item.buyLimit || 100;

    loadChart();
}

function closeChartModal() {
    document.getElementById('modal-backdrop').classList.remove('open');
    if (chartState.priceChart) { chartState.priceChart.destroy(); chartState.priceChart = null; }
    if (chartState.volumeChart) { chartState.volumeChart.destroy(); chartState.volumeChart = null; }
    chartState.item = null;
}

document.getElementById('modal-refresh').addEventListener('click', () => {
    if (chartState.item) loadChart();
});

async function loadChart() {
    const item = chartState.item;
    if (!item) return;
    const loading = document.getElementById('chart-loading');
    loading.style.display = 'flex';
    loading.textContent = 'Loading price history…';

    try {
        const data = await fetchJson(`${API_BASE}/timeseries?id=${item.id}&timestep=${chartState.timestep}`);
        const series = data.data || [];

        // Trim to the requested visible window. The API gives ~300 points;
        // we slice the tail to match the user's label.
        const visible = sliceForLabel(series, chartState.rangeLabel, chartState.timestep);

        renderPriceChart(visible);
        renderVolumeChart(visible);
        loading.style.display = 'none';
    } catch (err) {
        console.error(err);
        loading.textContent = `Failed to load history: ${err.message || err}`;
    }
}

// Map a UI label ("6h", "24h", "7d", "30d", "90d") to a number of data
// points to keep, given the timestep granularity.
function sliceForLabel(series, label, step) {
    const stepHours = { '5m': 5 / 60, '1h': 1, '6h': 6, '24h': 24 }[step] || 1;
    const targetHours = { '6h': 6, '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '90d': 24 * 90 }[label] || 24 * 7;
    const pointCount = Math.ceil(targetHours / stepHours);
    return series.slice(-pointCount);
}

function renderPriceChart(series) {
    const canvas = document.getElementById('price-chart');
    if (chartState.priceChart) chartState.priceChart.destroy();

    const buyPoints = series.map(p => ({ x: p.timestamp * 1000, y: p.avgLowPrice }));
    const sellPoints = series.map(p => ({ x: p.timestamp * 1000, y: p.avgHighPrice }));

    // Per-point radius arrays: the last point (= most recent / "current" price)
    // gets a larger dot so it's visually distinct and easy to hover even at
    // the right edge of the canvas where Chart.js sometimes misses the hit.
    const n = series.length;
    const pointRadii = series.map((_, i) => i === n - 1 ? 7 : 2);
    const hoverRadii = series.map((_, i) => i === n - 1 ? 10 : 5);

    // Suggested levels from the visible window — used for the panel cards below
    // the chart. The lines are intentionally NOT drawn on the chart itself.
    const suggestion = computeSuggestions(series);
    updateSuggestionPanel(suggestion);

    // Breakeven sell line: minimum sell price to cover GE tax on a buy at the
    // current buy price. Approximated as buy × 1.02 (exact is buy / 0.98 ≈
    // buy × 1.0204 — visually indistinguishable). Same exemption / cap logic
    // as computeFlips.
    const xFirst = series.length ? series[0].timestamp * 1000 : Date.now();
    const xLast = series.length ? series[series.length - 1].timestamp * 1000 : Date.now();
    const currentItem = chartState.item;
    let breakevenPrice = null;
    if (currentItem) {
        if (currentItem.taxExempt || currentItem.buy < GE_TAX_MIN_PRICE) {
            breakevenPrice = currentItem.buy; // no tax = no markup needed
        } else {
            const approxTax = currentItem.buy * GE_TAX_RATE;
            breakevenPrice = approxTax >= GE_TAX_CAP
                ? currentItem.buy + GE_TAX_CAP
                : Math.ceil(currentItem.buy * (1 + GE_TAX_RATE));
        }
    }
    const breakevenLine = breakevenPrice != null
        ? [{ x: xFirst, y: breakevenPrice }, { x: xLast, y: breakevenPrice }]
        : [];

    const opts = chartOptions({ valueAxis: true });
    // Extra right-side padding so the tooltip for the last (rightmost) point
    // has room to render without being clipped by the canvas edge.
    opts.layout = { padding: { right: 24 } };

    chartState.priceChart = new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Sell (high)',
                    data: sellPoints,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.08)',
                    fill: false,
                    stepped: 'after', // OSRS wiki staircase style — hold price flat until next point
                    tension: 0,
                    pointRadius: pointRadii,
                    pointHoverRadius: hoverRadii,
                    pointBackgroundColor: '#4ade80',
                    pointBorderColor: '#4ade80',
                    borderWidth: 1.5,
                    spanGaps: true,
                },
                {
                    label: 'Buy (low)',
                    data: buyPoints,
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96, 165, 250, 0.08)',
                    fill: '-1',
                    stepped: 'after',
                    tension: 0,
                    pointRadius: pointRadii,
                    pointHoverRadius: hoverRadii,
                    pointBackgroundColor: '#60a5fa',
                    pointBorderColor: '#60a5fa',
                    borderWidth: 1.5,
                    spanGaps: true,
                },
                {
                    label: 'Breakeven sell',
                    data: breakevenLine,
                    borderColor: '#fb923c',
                    borderDash: [4, 4],
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                    order: -1,
                },
            ],
        },
        options: opts,
    });
}

/**
 * Returns suggested buy/sell prices for the given time window, plus hit-rate
 * stats and a quality flag describing whether the suggestion is actually
 * useful.
 *
 * Method:
 *   1. Take the 15th percentile of avgLowPrice as the candidate buy and
 *      85th percentile of avgHighPrice as the candidate sell. These are
 *      aggressive levels — actual recent extremes the market has hit, not
 *      averages.
 *   2. Validate against the current live price: suggested buy must be
 *      materially below the current buy (≥0.3% gap), suggested sell must
 *      be materially above the current sell. Otherwise we're recommending
 *      a level that's basically the current spread, which is useless.
 *   3. Compute the after-tax margin. If it's negative or tiny (<0.5%),
 *      flag it as a poor flip — flat market or high-tax item.
 *
 * Quality codes:
 *   'good'        — suggestion is below current buy / above current sell and
 *                   the margin is meaningful.
 *   'thin'        — suggestion exists but margin is <0.5% after tax.
 *   'flat-buy'    — suggested buy isn't materially below current price.
 *   'flat-sell'   — suggested sell isn't materially above current price.
 *   'unprofitable'— after-tax margin is zero or negative.
 *   'insufficient'— not enough data points to compute meaningfully.
 */
function computeSuggestions(series) {
    if (!series.length) return null;

    // Build {value, weight} arrays so the percentile / SR logic can weight
    // every observation by its trade volume — a price level that traded 5000
    // units matters more than one that traded 50.
    const lowObs = series
        .filter(p => p.avgLowPrice != null && p.avgLowPrice > 0)
        .map(p => ({ value: p.avgLowPrice, weight: p.lowPriceVolume || 1, timestamp: p.timestamp }));
    const highObs = series
        .filter(p => p.avgHighPrice != null && p.avgHighPrice > 0)
        .map(p => ({ value: p.avgHighPrice, weight: p.highPriceVolume || 1, timestamp: p.timestamp }));
    if (lowObs.length < 3 || highObs.length < 3) {
        return {
            quality: 'insufficient',
            warning: `Only ${Math.min(lowObs.length, highObs.length)} data points — switch to a longer window for a useful suggestion.`,
        };
    }

    const useSR = document.getElementById('sr-mode') && document.getElementById('sr-mode').checked;

    let suggestedBuy, suggestedSell, methodLabel;
    if (useSR) {
        // True support / resistance — find price levels the market has
        // touched multiple times.
        const support = findSupportResistance(lowObs, 'support');
        const resistance = findSupportResistance(highObs, 'resistance');
        suggestedBuy = support ? support.price : weightedPercentile(lowObs, 15);
        suggestedSell = resistance ? resistance.price : weightedPercentile(highObs, 85);
        methodLabel = 'S/R';
    } else {
        // Volume-weighted percentile — always weights by trade volume so
        // big-volume ticks dominate.
        suggestedBuy = weightedPercentile(lowObs, 15);
        suggestedSell = weightedPercentile(highObs, 85);
        methodLabel = 'p15/p85 weighted';
    }

    const lows = lowObs.map(o => o.value);
    const highs = highObs.map(o => o.value);

    // Current live levels from the most recent tick.
    const currentBuy = lows[lows.length - 1];
    const currentSell = highs[highs.length - 1];

    // Tax applied to the suggested sell.
    const isExempt = chartState.item && chartState.item.taxExempt;
    const tax = (isExempt || suggestedSell < GE_TAX_MIN_PRICE)
        ? 0
        : Math.min(Math.floor(suggestedSell * GE_TAX_RATE), GE_TAX_CAP);
    const netMargin = suggestedSell - tax - suggestedBuy;
    const netPct = (netMargin / suggestedBuy) * 100;

    // Validation against current spread. We need the suggested buy to be at
    // least 0.3% below current buy (otherwise the recommendation is "buy at
    // the current price", which is not a flip). Same idea on sell side.
    const FLAT_THRESHOLD = 0.003;
    const buyGap = (currentBuy - suggestedBuy) / currentBuy;
    const sellGap = (suggestedSell - currentSell) / currentSell;
    const flatBuy = buyGap < FLAT_THRESHOLD;
    const flatSell = sellGap < FLAT_THRESHOLD;

    let quality = 'good';
    let warning = null;
    if (netMargin <= 0) {
        quality = 'unprofitable';
        warning = `After ${formatGp(tax)} gp tax the suggested levels give no profit. Try a longer window or a more volatile item.`;
    } else if (flatBuy && flatSell) {
        quality = 'flat-buy';
        warning = `Market has been flat in this window — suggested buy is only ${(buyGap * 100).toFixed(2)}% below current buy and suggested sell only ${(sellGap * 100).toFixed(2)}% above current sell. Try a longer window.`;
    } else if (flatBuy) {
        quality = 'flat-buy';
        warning = `Suggested buy is only ${(buyGap * 100).toFixed(2)}% below the current buy price — barely a discount. Try a longer window or skip this item right now.`;
    } else if (flatSell) {
        quality = 'flat-sell';
        warning = `Suggested sell is only ${(sellGap * 100).toFixed(2)}% above the current sell price — barely a premium. Try a longer window or skip this item right now.`;
    } else if (netPct < 0.5) {
        quality = 'thin';
        warning = `Margin is thin (${netPct.toFixed(2)}%). Volatile fills can wipe it out; only flip large quantities.`;
    }

    // Hit rate over the window = how often did the market actually reach
    // each suggested level. With aggressive 15/85 percentiles this should
    // be roughly 15% on each side by construction.
    const buyHits = lows.filter(v => v <= suggestedBuy).length;
    const sellHits = highs.filter(v => v >= suggestedSell).length;

    return {
        suggestedBuy,
        suggestedSell,
        currentBuy,
        currentSell,
        netMargin,
        netPct,
        tax,
        buyHits,
        sellHits,
        buyHitPct: (buyHits / lows.length) * 100,
        sellHitPct: (sellHits / highs.length) * 100,
        totalBuyTicks: lows.length,
        totalSellTicks: highs.length,
        buyGap,
        sellGap,
        quality,
        warning,
        methodLabel,
    };
}

function percentile(arr, p) {
    if (!arr.length) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1);
    return sorted[idx];
}

/**
 * Weighted percentile — like the regular percentile but each observation
 * carries a weight (its trade volume). Means a single 5000-unit trade at
 * 200gp counts the same as 100 single-unit trades at 200gp.
 */
function weightedPercentile(items, p) {
    if (!items.length) return null;
    const sorted = items.slice().sort((a, b) => a.value - b.value);
    const totalWeight = sorted.reduce((s, x) => s + x.weight, 0);
    if (totalWeight <= 0) return percentile(sorted.map(x => x.value), p);
    const target = totalWeight * p / 100;
    let cum = 0;
    for (const item of sorted) {
        cum += item.weight;
        if (cum >= target) return item.value;
    }
    return sorted[sorted.length - 1].value;
}

/**
 * Find a support (or resistance) level by clustering nearby observations.
 *
 * Algorithm: sort observations by price. Walk the sorted list and group
 * together prices that are within 0.5% of each other into clusters. Each
 * cluster represents a "level the market kept coming back to." Score each
 * cluster by (touch count × total volume) so a level that was touched
 * many times AND traded heavy wins over a level that was just touched
 * many times in low volume.
 *
 * For support, prefer clusters in the lower half of the visible range.
 * For resistance, prefer the upper half. Within that constraint, pick the
 * highest-scoring cluster.
 *
 * Returns { price, touchCount, totalVolume } or null if none found.
 */
function findSupportResistance(observations, kind /* 'support' | 'resistance' */) {
    if (observations.length < 4) return null;

    const sorted = observations.slice().sort((a, b) => a.value - b.value);
    const minPrice = sorted[0].value;
    const maxPrice = sorted[sorted.length - 1].value;
    const range = maxPrice - minPrice;
    if (range <= 0) return null;

    // Cluster width: 0.5% of the cluster's anchor price (so big-price items
    // get wider buckets, small-price items get tighter ones).
    const CLUSTER_WIDTH_PCT = 0.005;

    const clusters = [];
    let current = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const last = current[current.length - 1].value;
        if (sorted[i].value <= last * (1 + CLUSTER_WIDTH_PCT)) {
            current.push(sorted[i]);
        } else {
            clusters.push(current);
            current = [sorted[i]];
        }
    }
    clusters.push(current);

    const summarized = clusters.map(c => {
        const totalVolume = c.reduce((s, x) => s + x.weight, 0);
        const weightedPrice = c.reduce((s, x) => s + x.value * x.weight, 0) / totalVolume;
        return {
            price: weightedPrice,
            touchCount: c.length,
            totalVolume,
            score: c.length * Math.log10(1 + totalVolume),
        };
    });

    // Filter to the half of the range we care about, then pick highest score.
    const midPoint = minPrice + range / 2;
    const candidates = kind === 'support'
        ? summarized.filter(c => c.price <= midPoint)
        : summarized.filter(c => c.price >= midPoint);

    const pool = candidates.length ? candidates : summarized;
    return pool.sort((a, b) => b.score - a.score)[0] || null;
}

// Holds the latest suggestion so the calc can recompute when the user
// changes quantity without re-running computeSuggestions.
let lastSuggestion = null;

function updateProfitCalculator() {
    const s = lastSuggestion;
    const item = chartState.item;
    if (!s || !item || s.suggestedBuy == null || s.suggestedSell == null) {
        ['calc-cost', 'calc-revenue', 'calc-tax', 'calc-profit', 'calc-roi'].forEach(id => setText(id, '—'));
        return;
    }
    const qtyEl = document.getElementById('calc-qty');
    const qty = Math.max(0, parseInt(qtyEl.value, 10) || 0);
    if (!qty) {
        ['calc-cost', 'calc-revenue', 'calc-tax', 'calc-profit', 'calc-roi'].forEach(id => setText(id, '—'));
        return;
    }
    const cost = s.suggestedBuy * qty;
    const grossRevenue = s.suggestedSell * qty;
    // Tax is per-item, then summed. Capped per-item — Jagex caps the per-sale
    // tax at GE_TAX_CAP, but you sell N items individually so each one is
    // capped independently.
    const taxPerItem = s.tax || 0;
    const totalTax = taxPerItem * qty;
    const netRevenue = grossRevenue - totalTax;
    const profit = netRevenue - cost;
    const roi = cost > 0 ? (profit / cost) * 100 : 0;

    setText('calc-cost', formatGp(cost) + ' gp');
    setText('calc-revenue', formatGp(grossRevenue) + ' gp');
    setText('calc-tax', totalTax > 0 ? '−' + formatGp(totalTax) + ' gp' : '0 gp');
    setText('calc-profit', formatGp(profit) + ' gp');
    setText('calc-roi', roi.toFixed(2) + '%');
}

function updateSuggestionPanel(s) {
    lastSuggestion = s;
    const row = document.getElementById('suggested-row');
    const warningEl = document.getElementById('suggested-warning');
    if (!s) {
        row.style.display = 'none';
        if (warningEl) warningEl.style.display = 'none';
        updateProfitCalculator();
        return;
    }
    row.style.display = 'grid';

    // 'insufficient' = not enough data; hide the numeric cards entirely.
    if (s.quality === 'insufficient') {
        row.style.display = 'none';
    }

    // Dim the whole panel for poor-quality suggestions so the eye knows
    // not to trust the numbers literally.
    const isPoor = ['unprofitable', 'flat-buy', 'flat-sell', 'insufficient'].includes(s.quality);
    row.classList.toggle('panel-poor', isPoor);

    if (s.suggestedBuy != null) {
        const methodSuffix = s.methodLabel ? ` · ${s.methodLabel}` : '';
        setText('suggested-buy', formatGp(s.suggestedBuy) + ' gp');
        const buyGapPct = s.buyGap != null ? (s.buyGap * 100).toFixed(2) : '—';
        setText('suggested-buy-hint',
            `${s.buyHits}/${s.totalBuyTicks} ticks hit this · ${buyGapPct}% below current buy (${formatGp(s.currentBuy)})${methodSuffix}`);

        setText('suggested-sell', formatGp(s.suggestedSell) + ' gp');
        const sellGapPct = s.sellGap != null ? (s.sellGap * 100).toFixed(2) : '—';
        setText('suggested-sell-hint',
            `${s.sellHits}/${s.totalSellTicks} ticks hit this · ${sellGapPct}% above current sell (${formatGp(s.currentSell)})${methodSuffix}`);

        setText('suggested-margin', formatGp(s.netMargin) + ' gp');
        setText('suggested-margin-hint',
            `${s.netPct.toFixed(2)}% margin · after ${s.tax ? formatGp(s.tax) + ' gp tax' : 'no tax'}`);
    }

    updateProfitCalculator();

    // Warning banner
    if (warningEl) {
        if (s.warning) {
            warningEl.style.display = 'block';
            warningEl.className = 'suggested-warning ' + (
                s.quality === 'unprofitable' ? 'warn-bad' :
                s.quality === 'insufficient' ? 'warn-info' :
                s.quality === 'thin' ? 'warn-info' :
                'warn-flat'
            );
            warningEl.innerHTML = `<strong>${qualityLabel(s.quality)}</strong> ${escapeHtml(s.warning)}`;
        } else {
            warningEl.style.display = 'none';
        }
    }
}

function qualityLabel(q) {
    switch (q) {
        case 'unprofitable': return '✗ No profitable flip.';
        case 'flat-buy':     return '⚠ Flat market.';
        case 'flat-sell':    return '⚠ Flat market.';
        case 'thin':         return '⚠ Thin margin.';
        case 'insufficient': return 'ℹ Not enough data.';
        default:             return '✓ Good window.';
    }
}

function renderVolumeChart(series) {
    const canvas = document.getElementById('volume-chart');
    if (chartState.volumeChart) chartState.volumeChart.destroy();

    const sellVol = series.map(p => ({ x: p.timestamp * 1000, y: p.highPriceVolume || 0 }));
    const buyVol = series.map(p => ({ x: p.timestamp * 1000, y: p.lowPriceVolume || 0 }));

    chartState.volumeChart = new Chart(canvas, {
        type: 'bar',
        data: {
            datasets: [
                {
                    label: 'Sell vol',
                    data: sellVol,
                    backgroundColor: 'rgba(74, 222, 128, 0.55)',
                    borderWidth: 0,
                    stack: 'vol',
                },
                {
                    label: 'Buy vol',
                    data: buyVol,
                    backgroundColor: 'rgba(96, 165, 250, 0.55)',
                    borderWidth: 0,
                    stack: 'vol',
                },
            ],
        },
        options: chartOptions({ valueAxis: true, stacked: true, compact: true }),
    });
}

function chartOptions({ valueAxis, stacked = false, compact = false }) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: {
                display: !compact,
                position: 'top',
                align: 'end',
                labels: {
                    color: '#d4d6da',
                    boxWidth: 10,
                    boxHeight: 10,
                    font: { size: 11 },
                },
            },
            tooltip: {
                backgroundColor: '#1d2024',
                borderColor: '#2f343b',
                borderWidth: 1,
                titleColor: '#f3f4f6',
                bodyColor: '#d4d6da',
                padding: 10,
                callbacks: {
                    // Tooltip = exact number with commas (e.g. 1,147,328 gp).
                    // Axis labels stay abbreviated (1.1M) since they're just
                    // for scale.
                    label: (ctx) => {
                        const v = ctx.parsed.y;
                        if (v == null || isNaN(v)) return `${ctx.dataset.label}: —`;
                        return `${ctx.dataset.label}: ${Math.round(v).toLocaleString()} gp`;
                    },
                },
            },
        },
        scales: {
            x: {
                type: 'time',
                stacked: stacked,
                grid: { color: '#262a30' },
                ticks: { color: '#7a8089', maxRotation: 0, autoSkipPadding: 20 },
                time: { tooltipFormat: 'MMM d, HH:mm' },
            },
            y: {
                stacked: stacked,
                grid: { color: '#262a30' },
                ticks: {
                    color: '#7a8089',
                    // Full numbers with commas (e.g. 3,700) instead of
                    // abbreviated (3.7k) — easier to read against real GE
                    // prices.
                    callback: (v) => v == null ? '' : Math.round(v).toLocaleString(),
                },
            },
        },
    };
}

// Range button + close handlers
document.querySelectorAll('#range-buttons .range-btn').forEach(b => {
    b.addEventListener('click', () => {
        document.querySelectorAll('#range-buttons .range-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        chartState.timestep = b.dataset.step;
        chartState.rangeLabel = b.dataset.label;
        loadChart();
    });
});

// SR toggle re-runs the suggestion (uses the already-loaded series — no
// need to refetch).
document.getElementById('sr-mode').addEventListener('change', () => {
    loadChart();
});

// Profit calculator inputs
document.getElementById('calc-qty').addEventListener('input', updateProfitCalculator);
document.getElementById('calc-fill-limit').addEventListener('click', () => {
    const item = chartState.item;
    if (item && item.buyLimit) {
        document.getElementById('calc-qty').value = item.buyLimit;
        updateProfitCalculator();
    }
});
document.getElementById('modal-close').addEventListener('click', closeChartModal);
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    // Click on the dim backdrop closes; clicks inside the dialog don't.
    if (e.target.id === 'modal-backdrop') closeChartModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('modal-backdrop').classList.contains('open')) {
        closeChartModal();
    }
});

