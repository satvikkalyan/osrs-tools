'use strict';
// ---------- Passcode gate ----------
// Reads PASSCODE from config.js (set via Netlify env var).
// Gate is skipped entirely if PASSCODE is empty (local dev / no env var set).
// Auth is stored in sessionStorage so it survives page refreshes but not new tabs.

(function () {
    const LS_KEY     = '_gk';
    const SHAKE_MS   = 480;
    const LOCK_AFTER = 5;          // wrong attempts before cooldown
    const LOCK_MS    = 30_000;     // 30-second lockout
    // Auth persists for 90 days — same device/browser = no re-entry needed
    const TTL_MS     = 90 * 24 * 60 * 60 * 1000;

    // No passcode configured → show app immediately
    if (!PASSCODE) return;

    // Already authenticated (within TTL)
    try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        if (saved && saved.ok && (Date.now() - saved.at) < TTL_MS) return;
    } catch (_) {}

    // ─── Build gate overlay ──────────────────────────────────────────────────
    const gate = document.createElement('div');
    gate.id = 'app-gate';
    gate.innerHTML = `
        <div class="gate-box">
            <div class="gate-dot-row">
                <span class="gate-dot"></span>
                <span class="gate-dot"></span>
                <span class="gate-dot"></span>
            </div>
            <input
                id="gate-input"
                type="password"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                placeholder="·  ·  ·  ·  ·  ·"
                aria-label="Access code"
            >
            <div class="gate-hint" id="gate-hint"></div>
        </div>`;
    document.body.prepend(gate);

    // Prevent the rest of the page from being interacted with while gate is up
    document.body.style.overflow = 'hidden';

    const input   = document.getElementById('gate-input');
    const hint    = document.getElementById('gate-hint');
    const box     = gate.querySelector('.gate-box');
    let   tries   = 0;
    let   locked  = false;
    let   lockTimer;

    input.focus();

    function unlock() {
        try { localStorage.setItem(LS_KEY, JSON.stringify({ ok: true, at: Date.now() })); } catch (_) {}
        gate.classList.add('gate-fade-out');
        document.body.style.overflow = '';
        setTimeout(() => gate.remove(), 500);
    }

    function shake() {
        box.classList.remove('gate-shake');
        // Force reflow to restart animation
        void box.offsetWidth;
        box.classList.add('gate-shake');
        setTimeout(() => box.classList.remove('gate-shake'), SHAKE_MS);
    }

    function startLockout() {
        locked = true;
        input.disabled = true;
        let remaining = LOCK_MS / 1000;
        const tick = () => {
            hint.textContent = `Too many attempts. Try again in ${remaining}s`;
            hint.className = 'gate-hint gate-err';
            remaining--;
            if (remaining < 0) {
                locked = false;
                input.disabled = false;
                input.value = '';
                hint.textContent = '';
                input.focus();
            } else {
                lockTimer = setTimeout(tick, 1000);
            }
        };
        tick();
    }

    input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        if (locked) return;

        const val = input.value;
        if (val === PASSCODE) {
            hint.textContent = '';
            unlock();
        } else {
            tries++;
            shake();
            input.value = '';
            if (tries >= LOCK_AFTER) {
                startLockout();
            } else {
                hint.textContent = `Incorrect (${LOCK_AFTER - tries} left)`;
                hint.className = 'gate-hint gate-err';
            }
        }
    });

    // Clear error hint while typing
    input.addEventListener('input', () => {
        if (!locked) { hint.textContent = ''; hint.className = 'gate-hint'; }
    });
})();
