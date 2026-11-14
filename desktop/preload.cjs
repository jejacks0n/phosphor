// The page's one way into the main process (desktop/main.js), as window.phosphorDesktop: the room service, and
// quitting. Sandboxed, so CommonJS, with only Electron's renderer modules.
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

contextBridge.exposeInMainWorld('phosphorDesktop', {
  startService: ({ port, mode, sub } = {}) => ipcRenderer.invoke('phosphor:start-service', { port, mode, sub }),
  serviceInfo: () => ipcRenderer.invoke('phosphor:service-info'),
  stopService: () => ipcRenderer.invoke('phosphor:stop-service'),
  onQuit: (cb) => { onQuit = cb; },
  quitReady: () => ipcRenderer.send('phosphor:quit-ready'),
});
