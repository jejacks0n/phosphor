// The desktop app's main process: one window on the desktop build (dist-desktop/, served from app://phosphor/), and
// the room service, which the page starts, changes, asks about and stops through the preload (window.phosphorDesktop).
// The service outlives a reload of the page. A quit (closing the window too) asks the page first, so a host can hand
// the room over, and goes on when the page says it's ready or after 20 s. The menu bar (menu.js) is in the page's
// words, and the files it opens and saves are read and written here (files.js): the page writes only to a file
// someone picked, opened or saved this session or before (Open Recent).
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRoomService } from './roomService.js';
import { reachableAddresses } from './addresses.js';
import { OPENABLE, filesIn, isProject, recentFiles, writeWhole } from './files.js';
import { REPO, menuTemplate } from './menu.js';

const ORIGIN = 'app://phosphor';
const DIST = fileURLToPath(new URL('../dist-desktop/', import.meta.url));
const QUIT_WITHIN_MS = 20_000;
// Phosphor's version, packaged or not (unpackaged, app.getVersion() is Electron's).
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// The end-to-end tests' settings, which a packaged app doesn't take (they run the app unpackaged).
if (app.isPackaged) for (const name of ['PHOSPHOR_USER_DATA', 'PHOSPHOR_ADDRESSES', 'PHOSPHOR_RETURN_WITHIN_MS']) delete process.env[name];
// Before anything else: the end-to-end tests run several instances, each with its own folder (and so its own lock).
if (process.env.PHOSPHOR_USER_DATA) app.setPath('userData', process.env.PHOSPHOR_USER_DATA);
// Their shorter wait for a host gone: a number of milliseconds above 0, or the page's own wait.
const returnWithinMs = Number(process.env.PHOSPHOR_RETURN_WITHIN_MS);
// standard and secure: a stable origin for IndexedDB, and a secure context for crypto.subtle.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const secret = randomBytes(32).toString('base64url');   // the host's own window proves itself to the service with it
let service = null;   // the room service, as a promise
let win = null;
let quitReady = false;
let quitTimer = null;
let labels = null;   // the menu's words, from the page: no menu of the app's own until it says them
let menuState = { hasImage: false, canChange: true, inRoom: false, hosting: false };
let recent = null;   // the recently opened files (files.js), once the user data folder is known
const granted = new Set();   // the files the page may save over: picked, opened or saved
const pendingFiles = [];   // files to open (double-clicked, on the command line, Open Recent) before the page can
let filesReady = false;   // the page takes files: it says so once loaded, and a reload starts over

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

function buildMenu() {
  if (!labels) return;
  const act = {
    command: (name) => win?.webContents.send('phosphor:menu', name),
    openRecent: (file) => deliver(file),
    clearRecent: () => {
      recent.clear();
      app.clearRecentDocuments();
      buildMenu();
    },
    openUrl: openOutside,
  };
  const template = menuTemplate({
    labels, state: menuState, recent: recent?.list() ?? [], act, mac: process.platform === 'darwin', packaged: app.isPackaged,
    version: VERSION, platform: process.platform, systemVersion: process.getSystemVersion(), arch: process.arch,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// The menu's words and what the page can do now. Strings and booleans only.
function setMenu({ labels: words, state } = {}) {
  if (!words || typeof words !== 'object' || Object.values(words).some((word) => typeof word !== 'string')) throw new Error('No labels');
  const [wereLabels, wasState] = [labels, menuState];
  labels = { ...words };
  menuState = Object.fromEntries(Object.keys(menuState).map((key) => [key, !!state?.[key]]));
  try {
    buildMenu();
  } catch (error) {
    [labels, menuState] = [wereLabels, wasState];   // the menu that worked stays
    throw error;
  }
}

// A file opened or saved: the page may save over it, and it's first in Open Recent. Only the first can't fail: the
// rest is the menu's, and a save or an open has happened whatever it does.
const remember = (file) => {
  granted.add(file);
  try {
    recent?.add(file);
    app.addRecentDocument(file);
    buildMenu();
  } catch (error) {
    console.warn('Could not list the file in Open Recent', error);
  }
};

async function readOpened(file) {
  const bytes = await readFile(file);
  remember(file);
  return { path: file, name: path.basename(file), bytes };
}

// A file to open in the page, now or once it takes files. One that can't be read is said by name, and leaves the list.
async function deliver(file) {
  if (!filesReady || !win) return void pendingFiles.push(file);
  try {
    win.webContents.send('phosphor:opened-file', await readOpened(file));
  } catch {
    recent?.remove(file);
    buildMenu();
    win?.webContents.send('phosphor:opened-file', { name: path.basename(file), missing: true });
  }
}

// File > Open: the system's chooser, for what the page opens. Null when nothing's picked.
async function openFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: labels?.openableFiles ?? 'Phosphor', extensions: OPENABLE }] });
  return canceled || !filePaths[0] ? null : readOpened(filePaths[0]);
}

// Save: over the project's own file when the page may write there, or where the system's save box says (Save As,
// `as`, always asks, starting beside the file). The path written, or null when the box is canceled.
async function saveProject({ bytes, name, path: file, as = false } = {}) {
  if (!(bytes instanceof Uint8Array) || typeof name !== 'string') throw new Error('No project');
  const own = typeof file === 'string' && granted.has(file) && isProject(file);
  if (as || !own) {
    const chosen = await dialog.showSaveDialog(win, {
      defaultPath: own ? path.join(path.dirname(file), path.basename(name)) : path.basename(name),
      filters: [{ name: labels?.projectFiles ?? 'Phosphor', extensions: ['phosphor'] }],
    });
    if (chosen.canceled || !chosen.filePath) return null;
    file = isProject(chosen.filePath) ? chosen.filePath : `${chosen.filePath}.phosphor`;
  }
  await writeWhole(file, bytes);
  remember(file);
  return file;
}

// Check for Updates: the releases on GitHub (drafts aren't listed), for the page to compare with this app's version.
async function releases() {
  const response = await net.fetch(`https://api.github.com/repos/jejacks0n/phosphor/releases?per_page=50`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const list = await response.json();
  const listed = (Array.isArray(list) ? list : []).filter((r) => r && !r.draft && typeof r.tag_name === 'string' && typeof r.html_url === 'string' && r.html_url.startsWith(`${REPO}/`));
  return { version: VERSION, releases: listed.map((r) => ({ tag: r.tag_name, prerelease: !!r.prerelease, url: r.html_url })) };
}

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
      additionalArguments: Number.isFinite(returnWithinMs) && returnWithinMs > 0 ? [`--phosphor-return-within-ms=${returnWithinMs}`] : [],
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
  // A reload (not the router's own moves) starts a page that hasn't said it takes files yet.
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) filesReady = false;
  });
  win.on('closed', () => { win = null; });
  win.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  // A file double-clicked while the app is open: on Windows and Linux a second launch, naming it.
  app.on('second-instance', (_event, argv, cwd) => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
    for (const file of filesIn(argv.slice(1), cwd)) deliver(file);
  });
  // On macOS, a file double-clicked or dropped on the Dock icon, before the app is ready too.
  app.on('open-file', (event, file) => {
    event.preventDefault();
    deliver(file);
  });
  for (const file of filesIn(process.argv.slice(1))) pendingFiles.push(file);

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
  handle('phosphor:set-menu', setMenu);
  handle('phosphor:open-file', openFile);
  handle('phosphor:save-project', saveProject);
  handle('phosphor:releases', releases);
  ipcMain.on('phosphor:files-ready', (event) => {
    if (!fromApp(event)) return;
    filesReady = true;
    for (const file of pendingFiles.splice(0)) deliver(file);
  });
  ipcMain.on('phosphor:quit-ready', (event) => {
    if (fromApp(event) && quitTimer) finishQuit();
  });

  app.whenReady().then(() => {
    recent = recentFiles(path.join(app.getPath('userData'), 'recent.json'));
    for (const file of recent.list()) granted.add(file);
    protocol.handle('app', serve);
    // No permission is given, but writing to the clipboard (a room's link is copied).
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    openWindow();
  });
}
