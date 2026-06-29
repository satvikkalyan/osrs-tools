'use strict';
// ---------- Global view tracking + Trending sidebar ----------
// Counts how many times each item's chart is opened, stores it in Supabase
// (global, shared across all users) with localStorage as an offline fallback.
//
// To enable global mode: fill in SUPABASE_URL + SUPABASE_ANON_KEY in
// constants.js and run SUPABASE_SETUP.sql in your Supabase SQL editor.
// Without credentials, counts are stored locally per browser only.

let viewsCache   = null;
let viewsCacheTs = 0;
const VIEWS_CACHE_TTL_MS = 5 * 60 * 1000; // re-fetch at most every 5 min
const VIEWS_LOCAL_KEY    = 'osrs-view-counts'; // localStorage key

// ---------- Supabase helpers ----------

function sbHeaders() {
    // Supports both legacy anon key (eyJ...) and new publishable key (sb_publishable_...)
    const headers = {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
    };
    // Legacy key format also needs the apikey header
    if (SUPABASE_ANON_KEY.startsWith('eyJ')) {
        headers['apikey'] = SUPABASE_ANON_KEY;
    }
    return headers;
}

const sbEnabled = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// ---------- Track a view ----------

function trackView(item) {
    if (!item) return;

    // 1. Always update localStorage immediately (instant local sidebar refresh)
    const local = JSON.parse(localStorage.getItem(VIEWS_LOCAL_KEY) || '{}');
    local[item.id] = (local[item.id] || 0) + 1;
    localStorage.setItem(VIEWS_LOCAL_KEY, JSON.stringify(local));

    // Bust sidebar cache so reopening it reflects the new count
    viewsCacheTs = 0;

    // 2. Fire-and-forget increment to Supabase
    if (!sbEnabled()) return;
    fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_view`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify({
            p_item_id: item.id,
            p_name:    item.name,
            p_icon:    item.icon || '',
        }),
    }).catch(() => {}); // non-fatal — never block the UI for analytics
}

// ---------- Fetch top viewed ----------

async function fetchTopViewed(limit = 25) {
    const now = Date.now();
    if (viewsCache && (now - viewsCacheTs) < VIEWS_CACHE_TTL_MS) return viewsCache;

    if (sbEnabled()) {
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/item_views?order=view_count.desc&limit=${limit}`,
                { headers: sbHeaders() }
            );
            if (!res.ok) throw new Error(`Supabase ${res.status}`);
            viewsCache   = await res.json();
            viewsCacheTs = now;
            return viewsCache;
        } catch (e) {
            console.warn('[trending] Supabase fetch failed, using local fallback:', e.message);
        }
    }

    // Local fallback — build from localStorage + current item state
    return localTopViewed(limit);
}

function localTopViewed(limit = 25) {
    const counts  = JSON.parse(localStorage.getItem(VIEWS_LOCAL_KEY) || '{}');
    const allItems = [...(state.items || []), ...(state.searchItems || [])];
    const byId = new Map(allItems.map(x => [x.id, x]));

    return Object.entries(counts)
        .map(([idStr, count]) => {
            const id   = parseInt(idStr, 10);
            const item = byId.get(id);
            return {
                item_id:    id,
                name:       item?.name || `Item #${id}`,
                icon:       item?.icon || '',
                view_count: count,
            };
        })
        .sort((a, b) => b.view_count - a.view_count)
        .slice(0, limit);
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
        list.innerHTML = '<div class="sidebar-empty">No views yet.<br>Open any item chart to start tracking!</div>';
        footer.textContent = '';
        return;
    }

    const isGlobal = sbEnabled();
    footer.textContent = isGlobal ? '🌐 Global · updated live' : '💾 Local only · add Supabase for global';

    list.innerHTML = items.map((row, i) => {
        const iconUrl = row.icon ? getIconSrc(row.icon) : '';
        const iconHtml = iconUrl
            ? `<img class="sidebar-icon" data-src="${iconUrl}" src="" alt="" onerror="this.style.display='none'">`
            : '<span class="sidebar-icon-placeholder"></span>';
        return `
        <div class="sidebar-item" data-item-id="${row.item_id}" role="button" tabindex="0">
            <span class="sidebar-rank">#${i + 1}</span>
            ${iconHtml}
            <span class="sidebar-name">${escapeHtml(row.name)}</span>
            <span class="sidebar-count">${Number(row.view_count).toLocaleString()}</span>
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
