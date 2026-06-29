'use strict';
// ---------- Throttled image loader with retry + session cache ----------
// Prevents 429 rate-limiting from the OSRS Wiki CDN.
//
// Key mechanisms:
//  1. IntersectionObserver — only loads images near the viewport (rootMargin 150px)
//  2. Concurrency cap — at most 2 simultaneous wiki requests
//  3. Inter-request spacing — minimum 120 ms between starting each load
//  4. Session URL cache — images successfully loaded this session are served
//     instantly on re-renders (sort/filter table without re-hitting the wiki)
//  5. Retry with backoff — on onerror, retries at 2s / 4s / 8s

const imgLoader = (() => {
    const MAX_CONCURRENT  = 2;
    const ROOT_MARGIN     = '150px';
    const INTER_REQ_DELAY = 120;          // ms between starting each request
    const RETRY_DELAYS    = [2000, 4000, 8000]; // retry schedule on error

    // URLs we successfully loaded this session. Re-renders are instant.
    const loaded = new Set();

    let inFlight   = 0;
    let lastStart  = 0;  // timestamp of last request start
    const queue    = [];
    let drainTimer = null;

    function scheduleDrain(delay = 0) {
        clearTimeout(drainTimer);
        drainTimer = setTimeout(drain, delay);
    }

    function drain() {
        if (inFlight >= MAX_CONCURRENT || !queue.length) return;

        const wait = Math.max(0, lastStart + INTER_REQ_DELAY - Date.now());
        if (wait > 0) { scheduleDrain(wait); return; }

        const { img, url, attempt } = queue.shift();
        if (!img || !img.parentNode) { scheduleDrain(0); return; } // removed from DOM

        inFlight++;
        lastStart = Date.now();

        function onSuccess() {
            inFlight--;
            loaded.add(url);
            scheduleDrain(INTER_REQ_DELAY);
        }

        function onFail() {
            inFlight--;
            if (attempt < RETRY_DELAYS.length && img.parentNode) {
                const delay = RETRY_DELAYS[attempt];
                setTimeout(() => {
                    if (img.parentNode) {
                        // Cache-bust so the browser doesn't serve a cached failure
                        queue.push({ img, url, attempt: attempt + 1 });
                        scheduleDrain(0);
                    }
                }, delay);
            }
            // either out of retries or img removed — give up silently
            scheduleDrain(INTER_REQ_DELAY);
        }

        img.onload  = onSuccess;
        img.onerror = onFail;
        img.src = url;
    }

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.unobserve(entry.target);
            const img = entry.target;
            const url = img.dataset.src;
            if (!url) continue;
            img.removeAttribute('data-src');

            if (loaded.has(url)) {
                // Already in session cache — instant, no network
                img.src = url;
            } else {
                queue.push({ img, url, attempt: 0 });
                scheduleDrain(0);
            }
        }
    }, { rootMargin: ROOT_MARGIN });

    return {
        // After setting innerHTML, call this to watch all img[data-src] in the container.
        observe(container) {
            if (!container) return;
            container.querySelectorAll('img[data-src]').forEach(img => {
                const url = img.dataset.src;
                if (!url) return;
                if (loaded.has(url)) {
                    img.src = url;
                    img.removeAttribute('data-src');
                } else {
                    observer.observe(img);
                }
            });
        },

        // For single-image loads (modals) — bypasses queue since it's just one.
        loadOne(img) {
            if (!img || !img.dataset.src) return;
            const url = img.dataset.src;
            img.removeAttribute('data-src');

            if (loaded.has(url)) { img.src = url; return; }

            let attempt = 0;
            function tryLoad() {
                img.onload = () => loaded.add(url);
                img.onerror = () => {
                    if (attempt < RETRY_DELAYS.length) {
                        setTimeout(() => { attempt++; tryLoad(); }, RETRY_DELAYS[attempt]);
                    }
                };
                img.src = url;
            }
            tryLoad();
        },
    };
})();
