'use strict';
// ---------- Throttled image loader ----------
// Prevents 429 rate-limiting from the OSRS Wiki CDN by controlling how many
// image requests fire simultaneously. Images are rendered with data-src instead
// of src. IntersectionObserver queues them as they approach the viewport, and
// at most MAX_CONCURRENT requests go to the wiki at once.

const imgLoader = (() => {
    const MAX_CONCURRENT = 3;   // max simultaneous wiki fetches
    const ROOT_MARGIN    = '400px'; // start loading 400px before entering viewport

    let inFlight = 0;
    const queue  = [];

    function drain() {
        while (inFlight < MAX_CONCURRENT && queue.length) {
            const img = queue.shift();
            // Guard: already loaded (data-src removed) or not in DOM
            if (!img.dataset.src) continue;
            const src = img.dataset.src;
            img.removeAttribute('data-src'); // prevent double-queuing
            inFlight++;
            img.onload  = () => { inFlight--; drain(); };
            img.onerror = () => { inFlight--; drain(); };
            img.src = src;
        }
    }

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.unobserve(entry.target);
            if (entry.target.dataset.src) {
                queue.push(entry.target);
                drain();
            }
        }
    }, { rootMargin: ROOT_MARGIN });

    return {
        // After setting innerHTML on a container, call this to watch all img[data-src] inside it.
        observe(container) {
            if (!container) return;
            container.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
        },
        // For single-image loads (modals, chart icon) — bypasses queue since it's just one.
        loadOne(img) {
            if (!img || !img.dataset.src) return;
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        },
    };
})();
