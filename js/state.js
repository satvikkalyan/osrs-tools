'use strict';
// ---------- State ----------
const state = {
    items: [],        // profitable items only — used for flips table + drop detection
    searchItems: [],  // ALL items with price data — used for global search
    sortBy: 'profitPerFlip',
    sortDir: 'desc',
    fetchedAt: null,
    page: 1,
    pageSize: 50,
};

// ---------- Watchlist ----------
// Items historically prone to sharp drops — bot-farmed resources, high-alch
// crash candidates, common dump targets. Hand-curated; extend as you find
// items that habitually crash. IDs are from the OSRS Wiki item mapping
// (visit https://prices.runescape.wiki/api/v1/osrs/mapping if you need to
// look one up).
const WATCHLIST_ITEM_IDS = new Set([
    // Bot-mined resources
    7936,  // Pure essence
    453,   // Coal
    440,   // Iron ore
    449,   // Adamantite ore
    451,   // Runite ore
    444,   // Gold ore

    // Bot-fished food
    385,   // Raw shark
    377,   // Raw lobster
    7944,  // Raw monkfish
    13439, // Raw anglerfish

    // Bot-chopped logs
    1513,  // Magic logs
    1515,  // Yew logs
    1517,  // Maple logs

    // Bones (bot-PvM)
    532,   // Big bones
    536,   // Dragon bones

    // High-alch crash candidates
    1391,  // Battlestaff (very common alch target)
    1333,  // Rune scimitar
    1127,  // Rune platebody
    1163,  // Rune full helm
    4587,  // Dragon scimitar

    // Common dump-prone potions / consumables
    6685,  // Saradomin brew(4)
    12695, // Super combat potion(4)

    // Seeds (farming bots)
    5316,  // Magic seed
    5315,  // Yew seed
    5314,  // Maple seed
]);

// Cache of latest mapping + 1h + 24h responses so refreshDropsOnly() can
// rebuild items without refetching the heavier endpoints.
const apiCache = {
    mapping: null,
    hourly: null,
    daily: null,
    latest: null,   // raw /latest data — used by repair tab to recompute on smithing change
};
