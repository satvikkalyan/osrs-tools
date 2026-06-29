'use strict';
// ---------- Import trades modal ----------
function openImportModal() {
    document.getElementById('import-backdrop').classList.add('open');
    document.getElementById('import-status').className = 'import-status';
    document.getElementById('import-status').textContent = '';
    renderPersonalList();
}
function closeImportModal() {
    document.getElementById('import-backdrop').classList.remove('open');
}
function handleImportText(text) {
    const counts = parseTradeHistory(text);
    if (!counts.size) {
        showImportStatus('Could not find any item IDs in that input. The page tried JSON parsing and then plain-text fallback — neither found anything.', 'err');
        return;
    }
    const result = mergeIntoPersonalWatchlist(counts);
    showImportStatus(`Imported ${counts.size} items (${result.added} new, ${result.updated} updated trade counts).`, 'ok');
    renderPersonalList();
    // Re-render the visible tables so badges/sort reflect the new watchlist.
    if (state.items.length) render();
    renderDropsTab();
}

document.getElementById('import-trades').addEventListener('click', openImportModal);
document.getElementById('import-close').addEventListener('click', closeImportModal);
document.getElementById('import-backdrop').addEventListener('click', e => {
    if (e.target.id === 'import-backdrop') closeImportModal();
});
document.getElementById('import-clear').addEventListener('click', () => {
    if (!confirm('Clear your entire personal watchlist?')) return;
    personalWatchlist.clear();
    persistPersonalWatchlist();
    renderPersonalList();
    render();
    renderDropsTab();
});

// File upload + drag and drop
const dropZone = document.getElementById('import-drop');
const fileInput = document.getElementById('import-file');
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => handleImportText(e.target.result);
    reader.onerror = () => showImportStatus('Failed to read file.', 'err');
    reader.readAsText(file);
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => handleImportText(ev.target.result);
    reader.readAsText(file);
});
document.getElementById('import-paste-btn').addEventListener('click', () => {
    const txt = document.getElementById('import-textarea').value;
    if (!txt.trim()) {
        showImportStatus('Nothing to parse — paste some content first.', 'err');
        return;
    }
    handleImportText(txt);
});

