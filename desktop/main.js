// The desktop app's main process: one window on the desktop build (dist-desktop/, served from app://phosphor/), and
// the room service, which the page starts, changes, asks about and stops through the preload (window.phosphorDesktop).
// The service outlives a reload of the page. A quit (closing the window too) asks the page first, so a host can hand
// the room over, and goes on when the page says it's ready or after 20 s.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron';
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

// A port from the page: a whole number from 1 to 65535 (a numeric string too), or none for the default.
const portFrom = (port) => {
  if (port === undefined || port === null || port === '') return undefined;
  const n = typeof port === 'string' && /^\d+$/.test(port.trim()) ? Number(port) : port;
  if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  throw new Error(`No port ${port}`);
};

async function startService({ port, mode, sub } = {}) {
  if (mode !== 'host' && mode !== 'standby') throw new Error(`No mode ${mode}`);
  port = portFrom(port);
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

// The live mode: after a hand-over the service goes back to standby on its own. The room's password, for a host back
// from a reload to hand on (the page keeps it in memory alone).
async function serviceInfo() {
  try {
    const running = await service;
    return running ? { port: running.port, addresses: reachableAddresses(undefined, running.port), secret, mode: running.mode(), password: running.room()?.password ?? null } : null;
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
// A quit the person called off (Stay): the next one asks the page again.
const quitCalledOff = () => {
  quitReady = false;
  clearTimeout(quitTimer);
  quitTimer = null;
};

// Links out of the app open in the system browser; nothing else is opened.
const openOutside = (url) => {
  if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
};

function serve(request) {
  const notFound = () => new Response('Not found', { status: 404 });
  const { host, pathname } = new URL(request.url);
  let file;
  try {
    file = path.join(DIST, decodeURIComponent(pathname));
  } catch {
    return notFound();   // a malformed escape
  }
  if (host !== 'phosphor' || !file.startsWith(DIST)) return notFound();
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
      // The end-to-end tests' shorter wait for a host gone, for the page (through the preload).
      additionalArguments: process.env.PHOSPHOR_RETURN_WITHIN_MS ? [`--phosphor-return-within-ms=${Number(process.env.PHOSPHOR_RETURN_WITHIN_MS)}`] : [],
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
  // The page asks before it goes with unsaved changes (or a room it hosts), as a browser does: Electron shows nothing
  // for that by itself, so the question is asked here. Plain English: the main process has no app strings.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      cancelId: 1,
      message: 'Leave Phosphor?',
      detail: 'Changes you made may not be saved.',
    });
    if (choice === 0) event.preventDefault();   // leave: the page goes after all
    else quitCalledOff();
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
    // No permission is given, but writing to the clipboard (a room's link is copied).
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    openWindow();
  });
}
