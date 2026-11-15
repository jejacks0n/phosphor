// The page's one way into the main process (desktop/main.js), as window.phosphorDesktop: the room service, quitting,
// the menu bar (its words and state out, with the window's drawing, and its commands back), files opened and saved, and the releases to update to. Sandboxed, so CommonJS, with only Electron's renderer modules.
const { contextBridge, ipcRenderer } = require('electron');

let onQuit = null;
// A quit asks the page first. A page that hasn't asked to be told (or whose answer throws) is ready at once.
ipcRenderer.on('phosphor:quit', () => {
  if (!onQuit) return ipcRenderer.send('phosphor:quit-ready');
  try {
    onQuit();
  } catch {
    ipcRenderer.send('phosphor:quit-ready');
  }
});

let onMenu = null;
let onOpenedFile = null;
ipcRenderer.on('phosphor:menu', (_event, name) => onMenu?.(name));
ipcRenderer.on('phosphor:opened-file', (_event, file) => onOpenedFile?.(file));

// The end-to-end tests' shorter wait for a host gone (PHOSPHOR_RETURN_WITHIN_MS, passed on by main.js); undefined otherwise.
const returnWithin = process.argv.find((arg) => arg.startsWith('--phosphor-return-within-ms='));

contextBridge.exposeInMainWorld('phosphorDesktop', {
  returnWithinMs: returnWithin ? Number(returnWithin.split('=')[1]) : undefined,
  startService: ({ port, mode, sub } = {}) => ipcRenderer.invoke('phosphor:start-service', { port, mode, sub }),
  serviceInfo: () => ipcRenderer.invoke('phosphor:service-info'),
  stopService: () => ipcRenderer.invoke('phosphor:stop-service'),
  onQuit: (cb) => { onQuit = cb; },
  quitReady: () => ipcRenderer.send('phosphor:quit-ready'),
  // The menu's words and state, and the window's drawing: its name (the window's title) and its project's path.
  setMenu: (labels, state, { title, file } = {}) => ipcRenderer.invoke('phosphor:set-menu', { labels, state, title, file }),
  onMenu: (cb) => { onMenu = cb; },
  // Files to open come once the page says it takes them: { path, name, bytes }, or { name, missing: true }.
  onOpenedFile: (cb) => {
    onOpenedFile = cb;
    ipcRenderer.send('phosphor:files-ready');
  },
  openFile: () => ipcRenderer.invoke('phosphor:open-file'),
  saveProject: ({ bytes, name, path, as } = {}) => ipcRenderer.invoke('phosphor:save-project', { bytes, name, path, as }),
  releases: () => ipcRenderer.invoke('phosphor:releases'),
});
