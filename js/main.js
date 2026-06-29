'use strict';
// ---------- Boot ----------
(async () => {
    // Register service worker for icon caching (cache-on-demand, no pre-fetching).
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(e =>
            console.warn('SW registration failed:', e)
        );
    }
    fetchData();
    startAutoRefresh();
})();
