'use strict';
// ---------- Boot ----------
// Init icon cache first so the first render can use cached object URLs,
// then kick off data fetch + auto-refresh.
(async () => {
    await initIconCache();
    fetchData();
    startAutoRefresh();
})();
