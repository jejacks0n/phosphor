// The page's one way into the main process (desktop/main.js), as window.phosphorDesktop: the room service, quitting and
// closing (whether there's unsaved work), the menu bar (its words and state out, with the window's drawing, and its commands back), files opened and saved, the releases to update to, and the marketplace's plugin list and files. Sandboxed, so CommonJS, with only Electron's renderer modules.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

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

let onUnsaved = null;
// A close or quit asks whether there's unsaved work. No answer of the page's own (or one that throws) is none.
ipcRenderer.on('phosphor:unsaved', (_event, id) => {
  let unsaved = false;
  try {
    unsaved = !!onUnsaved?.();
  } catch { /* none */ }
  ipcRenderer.send('phosphor:unsaved-answer', id, unsaved);
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
  onUnsaved: (cb) => { onUnsaved = cb; },
  // The menu's words and state, and the window's drawing: its name (the window's title) and its project's path.
  setMenu: (labels, state, { title, file } = {}) => ipcRenderer.invoke('phosphor:set-menu', { labels, state, title, file }),
  onMenu: (cb) => { onMenu = cb; },
  // Files to open come once the page says it takes them: { path, name, bytes }, or { name, missing: true }.
  onOpenedFile: (cb) => {
    onOpenedFile = cb;
    ipcRenderer.send('phosphor:files-ready');
  },
  openFile: () => ipcRenderer.invoke('phosphor:open-file'),
  // A file dropped on the page, opened in a new window (or the window that has it, brought forward). False for one
  // with no path on this computer.
  openInNewWindow: async (file) => {
    const where = webUtils.getPathForFile(file);
    return where ? ipcRenderer.invoke('phosphor:open-in-window', where) : false;
  },
  saveProject: ({ bytes, name, path, as } = {}) => ipcRenderer.invoke('phosphor:save-project', { bytes, name, path, as }),
  releases: () => ipcRenderer.invoke('phosphor:releases'),
  // The marketplace's list as text, and a listed plugin's file (a raw GitHub URL) of at most `most` bytes as { text } or
  // { failed: 'changed' | 'unreachable' }.
  pluginList: () => ipcRenderer.invoke('phosphor:plugin-list'),
  pluginFile: (url, most) => ipcRenderer.invoke('phosphor:plugin-file', url, most),
});
