'use strict';
// ---------- Player stats (OSRS Hiscores) ----------
// Fetches skill levels for a given RSN and makes them available to the
// Craft tab so recipes can be filtered by what the player can actually do.
//
// Hiscores endpoint returns CSV: rank,level,xp per skill, in fixed order.
// A rank of -1 means unranked (but level/xp are still valid).

const HISCORES_PROXY = 'https://api.allorigins.win/raw?url=';
const HISCORES_BASE  = 'https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=';

// Skill order matches the hiscores CSV (0 = Overall, 1 = Attack, …)
const HS_SKILLS = [
    'overall','attack','defence','strength','hitpoints','ranged',
    'prayer','magic','cooking','woodcutting','fletching','fishing',
    'firemaking','crafting','smithing','mining','herblore','agility',
    'thieving','slayer','farming','runecraft','hunter','construction',
];

// Globally shared — assembly.js reads these
let playerStats = {};
let playerName  = localStorage.getItem('osrs-player-name') || '';

async function fetchPlayerStats(rsn) {
    if (!rsn) return;
    rsn = rsn.trim();
    if (!rsn) return;
    const url = HISCORES_BASE + encodeURIComponent(rsn);
    const res = await fetch(HISCORES_PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error(`Hiscores ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n');
    const stats = {};
    lines.forEach((line, i) => {
        if (i >= HS_SKILLS.length) return;
        const parts = line.split(',');
        const level = parseInt(parts[1], 10);
        if (!isNaN(level) && level > 0) stats[HS_SKILLS[i]] = level;
    });
    return stats;
}

async function loadPlayerStats(rsn) {
    const statusEl = document.getElementById('player-status');
    const badgeEl  = document.getElementById('player-name-badge');
    if (statusEl) statusEl.textContent = 'Fetching…';
    try {
        const stats = await fetchPlayerStats(rsn);
        if (!stats || !Object.keys(stats).length) throw new Error('No data');
        playerStats = stats;
        playerName  = rsn;
        localStorage.setItem('osrs-player-name', rsn);

        // Update smithing input to match player level
        const smithEl = document.getElementById('craft-smithing');
        if (smithEl) smithEl.value = stats.smithing || 1;

        if (badgeEl) {
            badgeEl.textContent = rsn;
            badgeEl.style.display = 'inline-flex';
        }

        // Render skill pills for craft-relevant skills
        const pillsEl = document.getElementById('craft-skill-pills');
        if (pillsEl) {
            const CRAFT_SKILLS = [
                { key: 'smithing', label: 'Smith', thresholds: [80, 90] },
                { key: 'prayer',   label: 'Prayer', thresholds: [85] },
                { key: 'magic',    label: 'Magic',  thresholds: [75, 78] },
                { key: 'slayer',   label: 'Slayer', thresholds: [] },
                { key: 'ranged',   label: 'Ranged', thresholds: [] },
            ];
            pillsEl.innerHTML = CRAFT_SKILLS.map(s => {
                const lvl = stats[s.key] || 1;
                const maxThresh = s.thresholds.length ? Math.max(...s.thresholds) : 0;
                const cls = maxThresh ? (lvl >= maxThresh ? 'sp-ok' : 'sp-low') : '';
                return `<span class="skill-pill ${cls}" title="${s.label} ${lvl}">
                    ${s.label} <span class="sp-val">${lvl}</span>
                </span>`;
            }).join('');
        }

        if (statusEl) statusEl.textContent = '';
        renderCraftTab();
    } catch (e) {
        if (statusEl) statusEl.textContent = `⚠ ${e.message}`;
        console.warn('[player] hiscores fetch failed:', e.message);
    }
}

// Auto-load saved player on startup
if (playerName) {
    loadPlayerStats(playerName);
}
