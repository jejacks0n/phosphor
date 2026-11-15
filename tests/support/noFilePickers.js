// Chromium has File System Access, but the browser tests save as Safari and Firefox do (a download) unless a test
// gives the page pickers of its own (save-in-place.test.js). Shadowed rather than deleted: they're the window's own.
for (const name of ['showOpenFilePicker', 'showSaveFilePicker']) Object.defineProperty(window, name, { value: undefined, writable: true, configurable: true });
