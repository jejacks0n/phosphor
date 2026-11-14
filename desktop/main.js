// The desktop app's main process: one window on the desktop build (dist-desktop/, served from app://phosphor/), and
// the room service, which the page starts, changes, asks about and stops through the preload (window.phosphorDesktop).
// The service outlives a reload of the page. A quit (closing the window too) asks the page first, so a host can hand
// the room over, and goes on when the page says it's ready or after 20 s.
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRoomService } from './roomService.js';
import { reachableAddresses } from './addresses.js';

const ORIGIN = 'app://phosphor';
const DIST = fileURLToPath(new URL('../dist-desktop/', import.meta.url));
const QUIT_WITHIN_MS = 20_000;

// Before anything else: the end-to-end tests run several instances, each with its own folder (and so its own lock).
if (process.env.PHOSPHOR_USER_DATA) app.setPath('userData', process.env.PHOSPHOR_USER_DATA);
// standard and secure: a stable origin for IndexedDB, and a secure context for crypto.subtle.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const secret = randomBytes(32).toString('base64url');   // the host's own window proves itself to the service with it
let service = null;   // the room service, as a promise
let win = null;
let quitReady = false;
let quitTimer = null;

async function startService({ port, mode, sub } = {}) {
  if (mode !== 'host' && mode !== 'standby') throw new Error(`No mode ${mode}`);
  const running = !!service;
  if (!running) {
    const starting = createRoomService({ port, mode, owner: { sub }, secret });
    service = starting;
    starting.catch(() => { if (service === starting) service = null; });
  }
  // A running service keeps its port: only its mode and owner change.
  const started = await service;
  if (running) started.set({ mode, owner: { sub } });
  return { port: started.port, addresses: reachableAddresses(undefined, started.port), secret };
}

// The live mode: after a hand-over the service goes back to standby on its own.
async function serviceInfo() {
  try {
    const running = await service;
    return running ? { port: running.port, addresses: reachableAddresses(undefined, running.port), secret, mode: running.mode() } : null;
  } catch {
    return null;
  }
}

async function stopService() {
  const stopping = service;
  service = null;
  await stopping?.then((running) => running.close(), () => {});
}

// Only the app's own page reaches the main process.
const fromApp = (event) => !!event.senderFrame?.url.startsWith(`${ORIGIN}/`);
const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
  if (!fromApp(event)) throw new Error('Not the app');
  return fn(...args);
});

const finishQuit = () => {
  quitReady = true;
  clearTimeout(quitTimer);
  app.quit();
};

// Links out of the app open in the system browser; nothing else is opened.
const openOutside = (url) => {
  if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
};

function serve(request) {
  const { host, pathname } = new URL(request.url);
  const file = path.join(DIST, decodeURIComponent(pathname));
  if (host !== 'phosphor' || !file.startsWith(DIST)) return new Response('Not found', { status: 404 });
  const found = existsSync(file) && statSync(file).isFile() ? file : path.join(DIST, 'index.html');
  return net.fetch(pathToFileURL(found).toString());
}

function openWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Phosphor',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return;
    event.preventDefault();
    openOutside(url);
  });
  // Closing the window is quitting, on every platform, and waits as a quit does.
  win.on('close', (event) => {
    if (quitReady) return;
    event.preventDefault();
    app.quit();
  });
  win.on('closed', () => { win = null; });
  win.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });

  app.on('before-quit', (event) => {
    if (quitReady || !win) return;
    event.preventDefault();
    if (quitTimer) return;
    quitTimer = setTimeout(finishQuit, QUIT_WITHIN_MS);
    win.webContents.send('phosphor:quit');
  });

  handle('phosphor:start-service', startService);
  handle('phosphor:service-info', serviceInfo);
  handle('phosphor:stop-service', stopService);
  ipcMain.on('phosphor:quit-ready', (event) => {
    if (fromApp(event) && quitTimer) finishQuit();
  });

  app.whenReady().then(() => {
    protocol.handle('app', serve);
    openWindow();
  });
}
