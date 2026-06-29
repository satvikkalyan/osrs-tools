'use strict';
// ---- Column header contextual tips ----
// A help card slides in from the bottom-right corner after 2 seconds of hover.

const COL_TIPS = {
    // ── Flips ───────────────────────────────────────────────────────────────
    buy: {
        label: 'Buy price',
        tip: 'The current lowest buy offer on the GE. This is your entry price — what you pay when your buy order fills.',
    },
    sell: {
        label: 'Sell (gross)',
        tip: 'The current highest sell offer on the GE. Your gross revenue per item before GE tax is deducted.',
    },
    tax: {
        label: 'GE Tax',
        tip: '2% GE tax deducted from your sale price, capped at 5M gp per item. Bonds and other tax-exempt items pay nothing.',
    },
    netMargin: {
        label: 'Profit / item',
        tip: 'Net profit per item after tax. Formula: Sell − GE Tax − Buy. This is what actually lands in your pouch.',
    },
    marginPct: {
        label: 'Margin %',
        tip: 'Return on capital per flip. = Profit/item ÷ Buy price × 100. A 5% margin means you earn 5 gp for every 100 gp you lock up.',
    },
    dailyVolume: {
        label: 'Daily volume',
        tip: 'Total items traded in the last 24 hours (buys + sells combined). Your best liquidity signal — low daily volume means orders may take hours to fill even if the margin looks great.',
    },
    buyLimit: {
        label: '4-hour limit',
        tip: 'Your personal GE buy limit per 4-hour window. You cannot buy more than this quantity until the window resets. Directly caps your max position size.',
    },
    ageMin: {
        label: 'Price age',
        tip: 'How old the latest price data point is. Under 1h = fresh. Yellow/red = stale data. Stale prices may no longer reflect the live market — trade with caution.',
    },
    profitPerFlip: {
        label: 'Profit / flip',
        tip: 'Max profit from buying your entire 4h limit in one cycle. = Profit/item × 4h Limit. Your earnings ceiling per trade window — the main sorting column.',
    },

    // ── Drops ───────────────────────────────────────────────────────────────
    name: {
        label: 'Item',
        tip: 'The item whose buy price dropped. Drops are detected when the price falls by your configured % within the detection window.',
    },
    fromPrice: {
        label: 'Was',
        tip: 'The baseline buy price before the drop was detected. Used as the reference to calculate the drop percentage.',
    },
    toPrice: {
        label: 'Now',
        tip: 'Current buy price. If still well below "Was", the drop is still active — potential buying opportunity at a discount.',
    },
    dropPct: {
        label: 'Drop %',
        tip: 'How far the price fell from the baseline. Large sudden drops may signal a mass sell-off, bot crash, or short-term manipulation.',
    },
    windowMin: {
        label: 'Window',
        tip: 'The time window (minutes) over which this drop was detected. Short windows = sudden crash. Long windows = slow bleed.',
    },
    detectedAt: {
        label: 'Detected',
        tip: 'When the drop was first spotted by the auto-refresh. Drops are automatically removed when the price recovers above 95% of its baseline.',
    },

    // ── Decant ──────────────────────────────────────────────────────────────
    base: {
        label: 'Potion',
        tip: 'The potion being decanted. Bob Barter at the GE decants between dose sizes for free — no cost and no skill requirement.',
    },
    buyPrice: {
        label: 'Buy (each)',
        tip: 'Price per 3-dose potion — your raw material cost per unit. You buy 4 of these to make one decant batch.',
    },
    sellPrice: {
        label: 'Sell (each)',
        tip: 'Price per 4-dose potion — what you receive per unit after decanting. You end up with 3 of these per batch.',
    },
    cost: {
        label: 'Batch cost',
        tip: 'Total cost to buy 4 × 3-dose potions — the full input cost for one decant batch (4 three-dose → 3 four-dose).',
    },
    revenue: {
        label: 'Batch revenue',
        tip: 'Total revenue from selling 3 × 4-dose potions after GE tax is deducted.',
    },
    profit: {
        label: 'Profit / batch',
        tip: 'Net profit from one complete decant batch: buy 4 × 3-dose, decant into 3 × 4-dose, sell. = Batch revenue − Batch cost.',
    },

    // ── Repair ──────────────────────────────────────────────────────────────
    buyCost: {
        label: 'Buy broken',
        tip: 'Cost to buy the fully degraded piece (e.g. "Dharok\'s helm 0") on the GE. Fully degraded items are the cheapest.',
    },
    repairCost: {
        label: 'Repair cost',
        tip: 'Repair fee at Bob in Lumbridge (NPC price) or your POH armour stand. Formula: NPC × (1 − Smithing level / 200). At level 99 you save ~50%.',
    },
    sellGross: {
        label: 'Sell repaired',
        tip: 'Gross sell price of the fully repaired piece. A repaired item is worth significantly more than its degraded counterpart.',
    },
    profitPerHour: {
        label: 'Profit / flip',
        tip: 'Total profit from buying and repairing your full 4-hour buy limit in one cycle. = Profit/item × 4h Limit.',
    },
};

(function () {
    // Create the floating card once, reuse it for every header
    const card = document.createElement('div');
    card.id = 'col-tip-card';
    card.innerHTML = `
        <div class="col-tip-icon">💡</div>
        <div class="col-tip-content">
            <div class="col-tip-label"></div>
            <div class="col-tip-body"></div>
        </div>
    `;
    document.body.appendChild(card);

    let timer = null;

    function show(th) {
        const key  = th.dataset.sort;
        const info = COL_TIPS[key];
        if (!info) return;
        card.querySelector('.col-tip-label').textContent = info.label;
        card.querySelector('.col-tip-body').textContent  = info.tip;
        card.classList.add('visible');
    }

    function hide() {
        clearTimeout(timer);
        card.classList.remove('visible');
    }

    // Attach to every sortable column header (present and future tabs)
    function attachTips() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            if (th._tipBound) return;
            th._tipBound = true;
            th.addEventListener('mouseenter', () => {
                clearTimeout(timer);
                // Only show tip if we actually have copy for this column
                if (COL_TIPS[th.dataset.sort]) {
                    timer = setTimeout(() => show(th), 2000);
                }
            });
            th.addEventListener('mouseleave', hide);
        });
    }

    // Run once on load; re-run if tabs add new tables dynamically
    attachTips();
    document.addEventListener('tab-change', attachTips);
})();
