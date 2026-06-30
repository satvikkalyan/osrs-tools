'use strict';
// ---------- Configuration ----------
const API_BASE = 'https://prices.runescape.wiki/api/v1/osrs';
// Wiki item-image endpoint — accepts the `icon` filename from the mapping
// endpoint with spaces preserved (Special:Filepath redirects to the real URL).
const ICON_BASE = 'https://oldschool.runescape.wiki/w/Special:Filepath/';
const RENDER_LIMIT = 500; // cap rendered rows for perf
// GE tax: 2% on sales (raised from 1% in 2024), capped at 5M gp per item,
// exempt below 100gp. Update GE_TAX_CAP if Jagex changes it.
const GE_TAX_RATE = 0.02;
const GE_TAX_CAP = 5_000_000;
const GE_TAX_MIN_PRICE = 100;

// Items Jagex has explicitly exempted from the 1% GE tax. The wiki API
// doesn't flag these, so we maintain the list by hand. The headline one
// is the Old School Bond — applying 1% to an 8M bond would make it look
// like an 80K loss when it's actually exempt. Extend this set if Jagex
// announces more exemptions (check the official tax-exemption blog post
// or oldschool.runescape.wiki/w/Tax for the current list).
const TAX_EXEMPT_IDS = new Set([
    13190, // Old school bond
    13192, // Old school bond (untradeable) — shouldn't appear on GE but defensive
    // Add additional exempt item IDs here as needed.
]);
// Buy limit on the GE is per 4 hours; convert to hourly when scoring.
const BUY_LIMIT_WINDOW_HRS = 4;
// Items with 0 buy limit in the mapping = no published limit. Treat as
// effectively unlimited for scoring purposes — but rank them by raw volume.
const UNLIMITED_PROXY = 1_000_000;

// ---------- Supabase — global view tracking ----------
// Credentials are injected at build time via scripts/build-config.js into
// js/config.js (loaded before this file, git-ignored).
// Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify → Site settings → Environment variables.
// Without them the app runs in local-only mode (localStorage per browser).
//
// Provide safe defaults so the app works even without config.js present
// (e.g. opening index.html directly from the filesystem).
if (typeof SUPABASE_URL      === 'undefined') var SUPABASE_URL      = '';
if (typeof SUPABASE_ANON_KEY === 'undefined') var SUPABASE_ANON_KEY = '';
if (typeof PASSCODE          === 'undefined') var PASSCODE          = '';
if (typeof FAVS_SYNC_ID      === 'undefined') var FAVS_SYNC_ID      = '';
