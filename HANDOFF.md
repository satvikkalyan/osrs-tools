# Handoff context

User: Vicky (`satvikkalyan@yahoo.com`). macOS, Brave/Chrome. Active OSRS player (Jagex-migrated account). Goal: tools that help him flip more profitably on the Old School RuneScape Grand Exchange.

The user appreciates concise, direct answers and dislikes verbose hand-wavy explanations. He asks sharp follow-up questions when something looks wrong — take them seriously, those are usually real bugs (he's caught: false positives in drop detection, abbreviated gp values, missing tax-exempt items).

---

## Project — OSRS Flip Finder (single HTML page)

**Status:** Actively iterating. Most recent session focused on drop detection accuracy + personal watchlist filtering. Heavily featured at this point. Most user feedback is about edge cases and intelligence — the foundation is solid.

### File

`osrs-flip-finder.html` — single self-contained file. ~2500 lines.
Vanilla JS, no build step. Chart.js + chartjs-adapter-date-fns loaded from
jsdelivr CDN.

### Open it

Double-click the file in Finder. Loads in the user's default browser. Works
from `file://` (the wiki API sets `Access-Control-Allow-Origin: *`).
Also deployed to Netlify via GitHub repo `satvikkalyan/osrs-tools` — every
push to main auto-deploys.

### What it does

A real-time GE flipping tool. Pulls live data from the OSRS Wiki Price API,
ranks items by realistic profit/hour (not just raw margin), shows
interactive charts on click, detects sudden price drops in the background,
and (with the user's trade history imported) prioritises items he actually
flips.

### Data sources (all anonymous, public, CORS-friendly)

```
GET https://prices.runescape.wiki/api/v1/osrs/mapping     (item metadata, buy limits) — cached 24h in localStorage
GET https://prices.runescape.wiki/api/v1/osrs/latest      (current high/low + timestamps) — always live
GET https://prices.runescape.wiki/api/v1/osrs/1h          (1-hour aggregated volume) — always live
GET https://prices.runescape.wiki/api/v1/osrs/24h         (24-hour aggregated volume) — cached 1h in localStorage
GET https://prices.runescape.wiki/api/v1/osrs/timeseries?id={id}&timestep={5m|1h|6h|24h}
GET https://oldschool.runescape.wiki/w/Special:Filepath/{icon}.png   (item icons, redirect→hashed URL)
```

Auto-refresh runs every 60 seconds (toggleable, countdown shown).
`apiCache` holds the heavy responses so the Drops tab's manual "Refresh"
button can hit only `/latest` for fast checks.

### Top-level UI structure

- **Header**: title, last-refresh meta, global search (⌘K), Import trades
  button, auto-refresh toggle + countdown, manual Refresh.
- **Tabs**: `Flips | Drops (badge)`.
- **Flips tab**: stat cards, filter row, sortable table.
- **Drops tab**: filter row + dedicated Refresh button, table of detected
  drops with dismiss / clear.
- **Chart modal** (opens on row click): 5 stat cards, time-range buttons,
  S/R toggle, price chart + volume chart, suggested-flip panel with
  warning banner, profit calculator.
- **Import modal**: file drop / paste, instructions, currently-loaded list
  with flip status badges.

### Ranking & profit math

```
tax = TAX_EXEMPT_IDS.has(id) || high < 100 ? 0 : min(floor(high * 0.02), 5_000_000)
netMargin = high - tax - low
volMin = min(highPriceVolume_1h, lowPriceVolume_1h)
hourlyLimit = buyLimit > 0 ? floor(buyLimit / 4) : ∞
realisticFlips = min(volMin, hourlyLimit)
profitPerHour = netMargin * realisticFlips
if (one-sided market, >20× ratio) profitPerHour /= 2
```

GE tax is **2%** (raised from 1% in 2024, the user confirmed),
capped at 5M, exempt below 100gp. The full list of named tax-exempt items
lives in `TAX_EXEMPT_IDS` — currently has Old School Bond IDs (13190,
13192). Extend as more exemptions surface.

### Filters (Flips tab)

- Search (case-insensitive substring, filters table)
- Min net margin gp (default `0`)
- Min daily volume (default blank — no limit)
- Max buy price / capital (default `10,000,000`)
- Max stale age (default 1h fresh)
- Members / F2P / all
- "★ Yours first" checkbox (pin imported watchlist items to top)

### Chart modal

- 5 stat cards: Buy, Sell (gross), Profit/item (after tax), Profit/hr,
  Daily volume (with 1h sub-line)
- Time range buttons: 6h (default), 24h, 7d, 30d, 90d → maps to
  `/timeseries` timestep of 5m, 1h, 1h, 6h, 24h respectively
- Tension = 0 (no spline smoothing). pointRadius array: 2 for all points,
  7 for the last (current) point so it's visually distinct and hoverable
- Y-axis uses exact gp with commas (NOT abbreviated — the user was
  explicit about this)
- Tooltips show full numbers
- "Use support/resistance" checkbox — switches suggestion algorithm
- Breakeven sell line: orange dashed horizontal at buy × 1.02
- Suggested-flip panel shows numbers + warning banner for poor windows
  (lines removed from chart — panel cards kept)
- Profit calculator: quantity input (defaults to buy limit), shows cost /
  revenue / tax / net profit / ROI

### Suggested flip algorithm (volume-weighted percentile / SR mode)

Volume-weighted percentile (default):
- Suggested buy = 15th weighted percentile of `avgLowPrice` (weights =
  `lowPriceVolume`)
- Suggested sell = 85th weighted percentile of `avgHighPrice` (weights =
  `highPriceVolume`)

S/R mode (when checkbox checked):
- Sort observations by price → cluster within 0.5% windows → score by
  `touchCount × log10(1 + totalVolume)` → pick best cluster in lower half
  (support) and upper half (resistance)

Validation against current price (suggestion is dimmed + warning shown if):
- Suggested buy ≥ current buy or within 0.3% (`flat-buy`)
- Suggested sell ≤ current sell or within 0.3% (`flat-sell`)
- After-tax margin ≤ 0 (`unprofitable`)
- After-tax margin < 0.5% (`thin`)
- Fewer than 3 data points (`insufficient`)

Quality flag determines the banner color (red/yellow/blue) and whether the
gp cards are dimmed.

### Drop detection algorithm (current)

Runs on every fetchData (manual + auto-refresh). Per-item rolling buffer
of `{ts, low, high}` snapshots, last 10 kept.

For each item:
1. Skip if no buy/sell, stale (>10min `ageMin` from `/latest`), below
   min-price filter, below daily-volume filter, or < 3 snapshots.
2. Baseline = **median of the oldest third of the window**. Earlier code
   used `Math.max` of the window (peak baseline) — this caused false
   positives for spike-then-revert patterns. Median of early third
   represents "what the price was before any drop started."
3. Check current price < baseline AND drop% ≥ min threshold.
4. Check current price ≤ window minimum × 1.005 — i.e. we're still at the
   bottom, not recovering. If we've rebounded, the dump is over and no
   notification is sent.
5. Cooldown: don't re-flag same item for 10 minutes.

Drop notifications: fixed to only request permission once (flag
`notificationPermissionRequested`) and properly await the grant before
firing the notification via `sendDropNotification()`.

Drop records persist to `localStorage` under `osrs-drops`. The render layer
re-applies the current threshold values (min %, volume, item price,
watchlist-only) on every render — so adjusting thresholds live filters the
displayed list, not just future detections.

### Watchlist (curated, dump-prone items)

`WATCHLIST_ITEM_IDS` — set of item IDs historically prone to crashes
(bot-mined resources, bot-fished food, alch-crash candidates, dump-prone
potions, farming bot seeds). Items in this set get a gold "★ watchlist"
badge on the drops table. Toggle "Watchlist only" filters to just these.

### Personal watchlist (from user's trade history)

Stored in `localStorage` under `osrs-personal-watchlist` as
`Map<itemId, {tradeCount, buyCount, sellCount, name}>`.

Import via the 📥 Import trades modal:
- Accepts JSON, CSV, or plain text (item IDs one per line)
- JSON parser walks the entire structure looking for objects with
  itemId/quantity/type fields — handles Flipping Utilities, Profit
  Tracker, hand-rolled exports
- CSV parser reads headers, finds id/name/quantity/type columns
- Type extraction supports `type`/`side`/`direction`/`isBuy` columns
  with values like "buy"/"sell"/"true"/"false"/"1"/"0"

After import, the **flip-quality heuristic** (`isLikelyFlip`) marks items:
1. Must be currently tradeable, GE price ≥ 100gp
2. Daily volume ≥ 1000
3. If buy/sell split known: both sides present AND ratio ≥ 0.2 (no >5×
   imbalance)
4. Total trades ≥ 5 (or ≥ 10 across both sides when split known)

`isPinnableYours` combines the watchlist membership check with the flip
filter (toggleable via "Likely flips only" checkbox in import modal,
defaults ON). Items failing the heuristic stay in storage but don't earn
the "★ yours" badge and don't get pinned by "Yours first."

The personal list display in the import modal shows for each item: name,
ID, `XB / YS` (buy/sell split if known) or `N txns`, and either "★ flip"
or "filtered" badge.

### Global search

Top-right header input. Searches `state.searchItems` (ALL items with any
price data, not just profitable ones — fixes items like Dragon dagger
disappearing when margin is temporarily 0). On click, prefers full data
from `state.items` if available, falls back to lightweight entry.
Arrow keys / Escape / ⌘K standard shortcuts.

### localStorage keys

- `osrs-drops` — detected price drops
- `osrs-personal-watchlist` — imported trade history
- `osrs-cache-mapping` — cached /mapping response (24h TTL)
- `osrs-cache-daily` — cached /24h response (1h TTL)

### Critical user preferences (do not violate)

- **EXACT gp values everywhere.** No `1.2K` / `847M` abbreviation. The
  `formatGp` function returns `Math.round(n).toLocaleString()`. He
  explicitly complained about abbreviation and we removed it. Re-adding
  abbreviation anywhere would regress.
- **Defaults are conservative.** Margin min = 0, volume min = blank,
  capital = 10M. Detection of false positives matters more than missing
  edge cases.
- **Drops must be real, not just statistically significant.** Spikes that
  revert do NOT count. Recoveries do NOT count. The current algorithm
  handles both.
- **Tax computations must respect exemptions.** Old School Bonds and any
  future tax-exempt items must show 0 tax. Adding tax to bond suggestions
  would produce wildly wrong "loss" numbers.

### Things in flight (where we left off)

1. **The "Likely flips only" checkbox in the import modal doesn't have
   its event listener wired yet.** It's referenced by `isPinnableYours`
   via DOM lookup (so toggling it does affect future renders), but the
   table + drops tab won't auto-rerender on toggle. Add:
   ```javascript
   document.getElementById('personal-flips-only').addEventListener('change', () => {
       renderPersonalList();
       render();
       renderDropsTab();
   });
   ```
2. **The `.import-list-summary` CSS class** is referenced in
   `renderPersonalList` but not styled. Add basic styling — a small dim
   header line above the rows. Not blocking, just rough-looking now.
3. **No "alch profit" detection.** The user mentioned wanting to spot
   items whose GE price drops *below high alch value*. Would need to add
   `highAlch` from the mapping endpoint, then surface items where
   `marketBuy + natureRuneCost < highAlch`. Distinct from price drops.
4. **The hardcoded `WATCHLIST_ITEM_IDS` is unverified.** Some IDs may
   not match the actual wiki mapping (I used best-effort knowledge).
   If a watchlist item never lights up despite obviously being dumped
   on the live market, check that its ID is correct.

### Features the user has explicitly considered but not asked for yet

- Mobile responsive layout (current grid breaks <900px wide)
- Per-item notes
- Sound notification on drops
- Price-change column (24h % change) in the flips table
- Click-to-copy item name to clipboard
- True support/resistance via swing-point detection
- "Hot movers" tab — items with biggest recent change

### Common pitfalls when iterating

- **`formatGp` returns a string with commas, not " gp" suffix.** Always
  append " gp" where appropriate (most places do).
- **`state.items` is rebuilt from scratch on every fetchData.** Anything
  that holds a reference (chart modal, calculator) must look up by ID,
  not store the item object.
- **Personal watchlist persistence uses `Map.entries` → object → JSON.**
  When loading, parse keys back to integers (already done).
- **`computeFlips` filters out items with `margin <= 0`.** If a future
  feature wants to surface unprofitable items (e.g. for alch detection),
  it can't just look at `state.items` — needs its own pass through the
  mapping.
- **Drop detection requires at least 3 snapshots + 90 seconds of
  history.** Right after a clear or page load, no drops can fire for ~3
  minutes. Don't add false-positive guards by raising this threshold;
  the user will lose visibility on real drops.

---

## Deployment

- **Repo:** `https://github.com/satvikkalyan/osrs-tools`
- **Host:** Netlify, connected to the GitHub repo
- **CI/CD:** Every push to `main` auto-deploys (no build step, `publish = "."`)
- **Config:** `netlify.toml` in repo root

---

## Agent context

### Browser tool limitations

- `WebFetch` is restricted to an allow-list. `prices.runescape.wiki` and
  `oldschool.runescape.wiki` are NOT on it. Don't try to validate API
  responses by fetching them — build from documented schema and let the
  user be the integration test.
- The bash sandbox network goes through a proxy that blocks most
  non-allow-listed domains.
- File-tools vs bash use different mount points. File paths the user
  sees (`/Users/satvikkalyangundu/Documents/Claude/Projects/Runelite/`)
  map to `/sessions/<id>/mnt/Runelite/` in bash. Use the file tools
  (Read/Write/Edit) when possible.

### How to verify changes without running

Structural sanity: HTML well-formed, JS no obvious syntax errors, IDs referenced exist. The user iterates fast — pasting problems back — so don't over-engineer pre-flight checks.

### Quick start for a fresh agent

Read `osrs-flip-finder.html`. Use Edit (not Write) — the file is ~3000 lines. Identify the right section before editing; the file is organized:
- HTML structure first
- `<style>` block (CSS variables at top, then components)
- `<script>` block: constants → localStorage cache helpers → watchlist →
  personal watchlist → drop detection → API → scoring → render →
  chart modal → import modal → tabs → global search → boot

Before suggesting a feature is "missing", search the file for it. Many features the user might assume aren't there actually are — global search, S/R toggle, profit calculator, personal watchlist, etc.

### Communication style

Direct, concise. Lead with what was wrong, then what the fix does, then caveats. No excessive postambles, no "Let me know if..." filler.
