// Netlify build script — generates js/config.js from environment variables.
// Runs during `netlify build` so secrets never live in the repo.
// Locally: js/config.js is git-ignored; the app falls back to local-only mode.

const fs = require('fs');
const path = require('path');

const supabaseUrl      = process.env.SUPABASE_URL      || '';
const supabaseAnonKey  = process.env.SUPABASE_ANON_KEY || '';

const out = `// Auto-generated at build time by scripts/build-config.js — do not edit or commit.
// Uses var so constants.js can safely provide fallback defaults without re-declaration errors.
var SUPABASE_URL      = '${supabaseUrl}';
var SUPABASE_ANON_KEY = '${supabaseAnonKey}';
`;

const dest = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(dest, out);

console.log('[build-config] js/config.js written.');
console.log('  SUPABASE_URL      :', supabaseUrl      ? '✓ set' : '⚠ not set (local-only mode)');
console.log('  SUPABASE_ANON_KEY :', supabaseAnonKey  ? '✓ set' : '⚠ not set (local-only mode)');
