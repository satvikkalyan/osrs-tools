'use strict';
// ---------- Global view + flip tracking, Trending sidebar ----------
// Counts how many times each item's chart is opened (views) and how many
// times the "Placed order" button is clicked (flips). Stored in Supabase
// (global, shared across all users) with localStorage as offline fallback.
//
// Trending sort: items with flips first, ranked by flip/view ratio descending.
// Items with zero flips rank by view count. Min daily volume: 40k enforced.

const VIEWS_LOCAL_KEY  = 'osrs-view-counts';
const FLIPS_LOCAL_KEY  = 'osrs-flip-counts';
const MIN_DAILY_VOL    = 40_000;

let viewsCache   = null;
let viewsCacheTs = 0;
const VIEWS_CACHE_TTL_MS = 3 * 60 * 1000; // bust every 3 min

// ---------- Supabase helpers ----------

function sbHeaders() {
    const headers = {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
    };
    if (SUPABASE_ANON_KEY.startsWith('eyJ')) headers['apikey'] = SUPABASE_ANON_KEY;
    return headers;
}

const sbEnabled = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// ---------- View tracking ----------

function trackView(item) {
    if (!item) return;
    const local = JSON.parse(localStorage.getItem(VIEWS_LOCAL_KEY) || '{}');
    local[item.id] = (local[item.id] || 0) + 1;
    localStorage.setItem(VIEWS_LOCAL_KEY, JSON.stringify(local));
    viewsCacheTs = 0;

    if (!sbEnabled()) return;
    fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_view`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({ p_item_id: item.id, p_name: item.name, p_icon: item.icon || '' }),
    }).catch(() => {});
}

// ---------- Flip tracking ----------

function trackFlip(item) {
    if (!item) return;
    const local = JSON.parse(localStorage.getItem(FLIPS_LOCAL_KEY) || '{}');
    local[item.id] = (local[item.id] || 0) + 1;
    localStorage.setItem(FLIPS_LOCAL_KEY, JSON.stringify(local));
    viewsCacheTs = 0; // bust trending cache

    if (!sbEnabled()) return;
    fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_flip`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({ p_item_id: item.id, p_name: item.name, p_icon: item.icon || '' }),
    }).catch(() => {});
}

function getFlipCount(itemId) {
    const local = JSON.parse(localStorage.getItem(FLIPS_LOCAL_KEY) || '{}');
    return local[itemId] || 0;
}

// ---------- Fetch + sort trending ----------

async function fetchTopViewed(limit = 25) {
    const now = Date.now();
    if (viewsCache && (now - viewsCacheTs) < VIEWS_CACHE_TTL_MS) return viewsCache;

    if (sbEnabled()) {
        try {
            // Fetch enough rows to filter by vol and then take top N
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/item_views?order=view_count.desc&limit=200`,
                { headers: { ...sbHeaders(), Prefer: '' } }
            );
            if (!res.ok) throw new Error(`Supabase ${res.status}`);
            const rows = await res.json();
            viewsCache   = trendingSort(rows, limit);
            viewsCacheTs = now;
            return viewsCache;
        } catch (e) {
            console.warn('[trending] Supabase fetch failed, using local fallback:', e.message);
        }
    }

    return localTopViewed(limit);
}

// Sort rows by: flip/view ratio desc (items with flips first), then view_count desc.
// Also enforces MIN_DAILY_VOL by cross-referencing local item state.
function trendingSort(rows, limit) {
    const allItems = [...(state.items || []), ...(state.searchItems || [])];
    const volById  = new Map(allItems.map(x => [x.id, x.dailyVolume || 0]));

    return rows
        .filter(r => (volById.get(r.item_id) || 0) >= MIN_DAILY_VOL)
        .map(r => ({
            ...r,
            flip_count: r.flip_count || 0,
            ratio: r.view_count > 0 ? (r.flip_count || 0) / r.view_count : 0,
        }))
        .sort((a, b) => {
            // Items with at least one flip rank above zero-flip items
            const aHasFlips = a.flip_count > 0;
            const bHasFlips = b.flip_count > 0;
            if (aHasFlips !== bHasFlips) return bHasFlips - aHasFlips;
            // Among items with flips: sort by ratio desc
            if (aHasFlips && bHasFlips && a.ratio !== b.ratio) return b.ratio - a.ratio;
            // Fall back to raw view count
            return b.view_count - a.view_count;
        })
        .slice(0, limit);
}

function localTopViewed(limit = 25) {
    const views = JSON.parse(localStorage.getItem(VIEWS_LOCAL_KEY) || '{}');
    const flips = JSON.parse(localStorage.getItem(FLIPS_LOCAL_KEY) || '{}');
    const allItems = [...(state.items || []), ...(state.searchItems || [])];
    const byId = new Map(allItems.map(x => [x.id, x]));

    const rows = Object.entries(views).map(([idStr, vc]) => {
        const id   = parseInt(idStr, 10);
        const item = byId.get(id);
        return {
            item_id:    id,
            name:       item?.name  || `Item #${id}`,
            icon:       item?.icon  || '',
            view_count: vc,
            flip_count: flips[idStr] || 0,
            dailyVol:   item?.dailyVolume || 0,
        };
    });

    return trendingSort(rows.map(r => ({ ...r, item_id: r.item_id })), limit);
}

// ---------- Sidebar UI ----------

function openSidebar() {
    document.getElementById('trending-sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
    document.getElementById('trending-toggle').classList.add('active');
    loadSidebarContent();
}

function closeSidebar() {
    document.getElementById('trending-sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
    document.getElementById('trending-toggle').classList.remove('active');
}

async function loadSidebarContent() {
    const list   = document.getElementById('sidebar-list');
    const footer = document.getElementById('sidebar-footer');
    list.innerHTML = '<div class="sidebar-loading">Loading…</div>';

    const items = await fetchTopViewed(25);

    if (!items || !items.length) {
        list.innerHTML = '<div class="sidebar-empty">No data yet.<br>Open items and hit "Placed order" to start tracking!</div>';
        footer.textContent = '';
        return;
    }

    const isGlobal = sbEnabled();
    footer.textContent = isGlobal ? '🌐 Global · flip ratio ranked' : '💾 Local only · add Supabase for global';

    list.innerHTML = items.map((row, i) => {
        const iconUrl  = row.icon ? getIconSrc(row.icon) : '';
        const iconHtml = iconUrl
            ? `<img class="sidebar-icon" data-src="${iconUrl}" src="" alt="" onerror="this.style.display='none'">`
            : '<span class="sidebar-icon-placeholder"></span>';
        const flipCount = row.flip_count || 0;
        const viewCount = row.view_count || 0;
        const ratioStr  = viewCount > 0 ? ((flipCount / viewCount) * 100).toFixed(0) + '%' : '—';
        const metaHtml  = flipCount > 0
            ? `<span class="sidebar-meta">${flipCount}↑ / ${viewCount}👁 <span class="sidebar-ratio">${ratioStr}</span></span>`
            : `<span class="sidebar-meta">${viewCount}👁</span>`;
        return `
        <div class="sidebar-item" data-item-id="${row.item_id}" role="button" tabindex="0">
            <span class="sidebar-rank">#${i + 1}</span>
            ${iconHtml}
            <span class="sidebar-name">${escapeHtml(row.name)}</span>
            ${metaHtml}
        </div>`;
    }).join('');

    imgLoader.observe(list);
    list.querySelectorAll('.sidebar-item').forEach(el => {
        const open = () => {
            const id   = parseInt(el.dataset.itemId, 10);
            const item = state.items?.find(x => x.id === id)
                      || state.searchItems?.find(x => x.id === id);
            if (item) { closeSidebar(); openChartModal(item); }
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
}

// ---------- Wire up toggle, overlay, close ----------

document.getElementById('trending-toggle').addEventListener('click', () => {
    const isOpen = document.getElementById('trending-sidebar').classList.contains('open');
    if (isOpen) closeSidebar(); else openSidebar();
});
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('trending-sidebar').classList.contains('open')) {
        closeSidebar();
    }
});
