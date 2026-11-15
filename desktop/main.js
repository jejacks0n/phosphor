// The desktop app's main process: windows on the desktop build (dist-desktop/, served from app://phosphor/), each its
// own page with its own room service, which the page starts, changes, asks about and stops through the preload
// (window.phosphorDesktop). A window's service outlives a reload of its page and stops when the window closes. A quit
// asks every window with unsaved work whether to leave, then tells every page, so a host can hand the room over, and
// goes on when they all say they're ready or after 20 s; Stay in any window calls it off with nothing touched. Closing
// a window does the same for that window alone; the last one quits the app, except on macOS. The menu bar (menu.js) is
// in the page's words and follows the focused window, and the files it opens and saves are read and written here
// (files.js): a page writes only to a file someone picked, opened or saved this session or before (Open Recent). A file
// opens in a window of its own when the window it's for has a drawing (windows.js), and a project already open in a
// window brings that window forward.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRoomService } from './roomService.js';
import { reachableAddresses } from './addresses.js';
import { OPENABLE, filesIn, isOpenable, isProject, recentFiles, writeWhole } from './files.js';
import { REPO, menuTemplate } from './menu.js';
import { cascade, fileTarget, leave } from './windows.js';

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

let quitReady = false;   // every window has said it may go: the quit goes on without asking again
let quitting = null;   // the quit's asking and handing over, while it lasts
let labels = null;   // the menu's words, from a page: no menu of the app's own until one says them
const IDLE = { hasImage: false, canChange: true, inRoom: false, hosting: false };
let recent = null;   // the recently opened files (files.js), once the user data folder is known
const granted = new Set();   // the files the pages may save over: picked, opened or saved
const launchFiles = [];   // files to open (double-clicked, on the command line) before the first window exists

// The open windows by their page's webContents id: { id, win, secret (the window's page proves itself to its room
// service with it), service (its room service, as a promise, or null), menuState, title, file (its project's path, or
// null), filesReady (its page takes files: it says so once loaded, and a reload starts over), pending (files and
// commands for it until then), claimed (a file is on its way to it, until its page says it has a drawing), leaving (a
// quit or its close has asked and handed over: it goes without asking again), closing (its close asking, while it
// does), handingOver (its page told of the quit, until it says it's ready or the window closes), ready (that promise's
// resolve) }.
const windows = new Map();
const focusOrder = [];   // the windows' ids, the last focused last
const entryOf = (event) => windows.get(event.sender.id);
// The focused window, or the last focused still open: the windows' own focus events say, not
// BrowserWindow.getFocusedWindow(), which on Linux still names the window losing focus while the next one's focus event
// runs (so the menu was built for the window left).
const focusedEntry = () => windows.get(focusOrder.at(-1));
const send = (entry, channel, ...args) => { if (!entry.win.isDestroyed()) entry.win.webContents.send(channel, ...args); };
const bringForward = (entry) => {
  if (entry.win.isMinimized()) entry.win.restore();
  entry.win.focus();
};

// A port from the page: a whole number from 1 to 65535 (a numeric string too), or none for the default.
const portFrom = (port) => {
  if (port === undefined || port === null || port === '') return undefined;
  const n = typeof port === 'string' && /^\d+$/.test(port.trim()) ? Number(port) : port;
  if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
  throw new Error(`No port ${port}`);
};

// A window's room service: each window starts, changes, asks about and stops its own, and only its own.
async function startService(entry, { port, mode, sub } = {}) {
  if (mode !== 'host' && mode !== 'standby') throw new Error(`No mode ${mode}`);
  port = portFrom(port);
  const { secret } = entry;
  const running = !!entry.service;
  if (!running) {
    const starting = createRoomService({ port, mode, owner: { sub }, secret });
    entry.service = starting;
    starting.catch(() => { if (entry.service === starting) entry.service = null; });
  }
  // A running service keeps its port: only its mode and owner change.
  const started = await entry.service;
  if (running) started.set({ mode, owner: { sub } });
  return { port: started.port, addresses: reachableAddresses(undefined, started.port), secret };
}

// The live mode: after a hand-over the service goes back to standby on its own. The room's password, for a host back
// from a reload to hand on (the page keeps it in memory alone).
async function serviceInfo(entry) {
  try {
    const running = await entry.service;
    return running ? { port: running.port, addresses: reachableAddresses(undefined, running.port), secret: entry.secret, mode: running.mode(), password: running.room()?.password ?? null } : null;
  } catch {
    return null;
  }
}

async function stopService(entry) {
  const stopping = entry.service;
  entry.service = null;
  await stopping?.then((running) => running.close(), () => {});
}

// Only the app's own page reaches the main process.
const fromApp = (event) => !!event.senderFrame?.url.startsWith(`${ORIGIN}/`);
// Each handler gets the sender's window first.
const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
  const entry = entryOf(event);
  if (!fromApp(event) || !entry) throw new Error('Not the app');
  return fn(entry, ...args);
});

// Whether a window's page has unsaved work: it answers phosphor:unsaved with the request's id. A window gone has none,
// nor does one handing over, which has said Leave already.
let asking = 0;
const unsavedAsked = new Map();   // request id -> { entry, resolve }
function unsaved(entry) {
  if (entry.win.isDestroyed() || entry.handingOver) return false;
  return new Promise((resolve) => {
    const id = ++asking;
    unsavedAsked.set(id, { entry, resolve });
    send(entry, 'phosphor:unsaved', id);
  });
}

// Leave or Stay, for a window with unsaved work (true to leave), in the page's words once it has said them. A
// window gone has gone. The box doesn't hold up the main process, where every window's room service answers; only a
// reload's, which must be answered at once, does (askNow).
const leaveBox = (question) => ({
  type: 'question',
  buttons: [labels?.leave ?? 'Leave', labels?.stay ?? 'Stay'],
  defaultId: 1,
  cancelId: 1,
  message: question,
  detail: labels?.leaveDetail ?? 'Changes you made may not be saved.',
});
async function ask(entry, question) {
  if (entry.win.isDestroyed()) return true;
  bringForward(entry);
  return (await dialog.showMessageBox(entry.win, leaveBox(question))).response === 0;
}
function askNow(entry, question) {
  if (entry.win.isDestroyed()) return true;
  bringForward(entry);
  return dialog.showMessageBoxSync(entry.win, leaveBox(question)) === 0;
}
const leaveQuit = () => labels?.leaveQuit ?? 'Leave Phosphor?';
const leaveClose = () => labels?.leaveClose ?? 'Close this window?';

// A window's page told it's going (a host hands its room on), until it says it's ready or the window closes. Told
// once: after that the window always goes.
const handOver = (entry) => entry.handingOver ??= new Promise((resolve) => {
  if (entry.win.isDestroyed()) return resolve();
  entry.ready = resolve;
  send(entry, 'phosphor:quit');
});

// The windows' question and hand-over (windows.js), within the quit's limit: true when they may go.
const leaving = (entries, question) => leave(entries, { unsaved, ask: (entry) => ask(entry, question()), handOver, withinMs: QUIT_WITHIN_MS });

// Links out of the app open in the system browser; nothing else is opened.
const openOutside = (url) => {
  if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
};

// A command from the menu goes to the focused window's page. With no window (macOS), one opens to take it, and New
// is that window.
function command(name) {
  const entry = focusedEntry();
  if (entry) return send(entry, 'phosphor:menu', name);
  const opened = openWindow();
  if (name !== 'new') opened.pending.push({ command: name });
}

// The menu for the focused window: its state, or nothing open's.
function buildMenu() {
  if (!labels) return;
  const act = {
    command,
    newWindow: () => openWindow(),
    openRecent: (file) => deliver(file),
    clearRecent: () => {
      recent.clear();
      app.clearRecentDocuments();
      buildMenu();
    },
    openUrl: openOutside,
  };
  const template = menuTemplate({
    labels, state: focusedEntry()?.menuState ?? IDLE, recent: recent?.list() ?? [], act, mac: process.platform === 'darwin', packaged: app.isPackaged,
    version: VERSION, platform: process.platform, systemVersion: process.getSystemVersion(), arch: process.arch,
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// The menu's words, what the page can do now, its drawing's name (the window's title) and its project's path. Strings
// and booleans only. A window with a drawing is no longer waiting for a file.
function setMenu(entry, { labels: words, state, title, file } = {}) {
  if (!words || typeof words !== 'object' || Object.values(words).some((word) => typeof word !== 'string')) throw new Error('No labels');
  const [wereLabels, wasState] = [labels, entry.menuState];
  labels = { ...words };
  entry.menuState = Object.fromEntries(Object.keys(IDLE).map((key) => [key, !!state?.[key]]));
  try {
    buildMenu();
  } catch (error) {
    [labels, entry.menuState] = [wereLabels, wasState];   // the menu that worked stays
    throw error;
  }
  if (entry.menuState.hasImage) entry.claimed = false;
  entry.title = typeof title === 'string' && title ? title : 'Phosphor';
  entry.file = typeof file === 'string' && file ? file : null;
  entry.win.setTitle(entry.title);
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

// A file to open in a window's page, now or once it takes files. One that can't be read is said by name, and leaves
// the list.
async function sendFile(entry, file) {
  if (!entry.filesReady) return void entry.pending.push({ file });
  try {
    send(entry, 'phosphor:opened-file', await readOpened(file));
  } catch {
    entry.claimed = false;
    recent?.remove(file);
    buildMenu();
    send(entry, 'phosphor:opened-file', { name: path.basename(file), missing: true });
  }
}

// A file to open (double-clicked, a second launch, Open Recent): the window that has it open comes forward; otherwise
// it opens in the focused window (focusedId) when that's empty, or in a new window.
const targetOf = (file, focusedId) => fileTarget([...windows.values()].map(({ id, menuState, claimed, file: open }) => ({ id, hasImage: menuState.hasImage, claimed, file: open })), focusedId, file);
function deliver(file, { focusedId = focusedEntry()?.id } = {}) {
  const target = targetOf(file, focusedId);
  const entry = windows.get(target.id);
  if (!entry) return void openWindow({ files: [file] });
  bringForward(entry);
  if (target.existing) return;
  entry.claimed = true;
  sendFile(entry, file);
}

// File > Open: the system's chooser, for what the page opens. Null when nothing's picked, or when what's picked opens
// in another window (this one has a drawing, or another has the file open). A window without a drawing takes what it
// picked itself, whether or not a file was on its way to it.
async function openFile(entry) {
  const { canceled, filePaths } = await dialog.showOpenDialog(entry.win, { properties: ['openFile'], filters: [{ name: labels?.openableFiles ?? 'Phosphor', extensions: OPENABLE }] });
  const file = !canceled && filePaths[0];
  if (!file) return null;
  const target = targetOf(file, entry.id);
  if (!entry.menuState.hasImage && !(target.existing && target.id !== entry.id)) return readOpened(file);
  deliver(file, { focusedId: entry.id });
  return null;
}

// A file dropped on a window with a drawing, to open elsewhere: the window that has it open comes forward, otherwise a
// new window opens with it (never the window that asked, which has a drawing). False for a path that isn't a file
// Phosphor opens.
function openInWindow(_entry, file) {
  if (typeof file !== 'string' || !isOpenable(file) || !statSync(file, { throwIfNoEntry: false })?.isFile()) return false;
  deliver(file, { focusedId: null });
  return true;
}

// Save: over the project's own file when the page may write there, or where the system's save box says (Save As,
// `as`, always asks, starting beside the file). The path written, or null when the box is canceled.
async function saveProject(entry, { bytes, name, path: file, as = false } = {}) {
  if (!(bytes instanceof Uint8Array) || typeof name !== 'string') throw new Error('No project');
  const own = typeof file === 'string' && granted.has(file) && isProject(file);
  if (as || !own) {
    const chosen = await dialog.showSaveDialog(entry.win, {
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

// A new window, cascaded from the focused one, on the start screen until its page takes the files given.
function openWindow({ files = [] } = {}) {
  const from = focusedEntry()?.win.getBounds();
  const { workArea } = from ? screen.getDisplayMatching(from) : screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    ...cascade(from, workArea),
    title: 'Phosphor',
    // The dark theme's --surface-0 (src/assets/global.css), the app's own default, so a window doesn't flash white
    // before its page paints. ponytail: a light theme picked in the page still shows dark for that moment.
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The end-to-end tests' shorter wait for a host gone, for the page (through the preload).
      additionalArguments: Number.isFinite(returnWithinMs) && returnWithinMs > 0 ? [`--phosphor-return-within-ms=${returnWithinMs}`] : [],
    },
  });
  const { id } = win.webContents;
  const entry = { id, win, secret: randomBytes(32).toString('base64url'), service: null, menuState: { ...IDLE }, title: 'Phosphor', file: null, filesReady: false, pending: files.map((file) => ({ file })), claimed: files.length > 0 };
  windows.set(id, entry);
  focusOrder.push(id);
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return;
    event.preventDefault();
    openOutside(url);
  });
  // The title is the drawing's name, which the page says with the menu, not its own <title>.
  win.on('page-title-updated', (event) => event.preventDefault());
  // Closing the window asks first when it has unsaved work, and its page hands its room on, as a quit does. A window a
  // quit or its own close let go closes.
  win.on('close', (event) => {
    if (entry.leaving) return;
    event.preventDefault();
    entry.closing ??= leaving([entry], leaveClose).then((going) => {
      entry.closing = null;
      if (!going || win.isDestroyed()) return;
      entry.leaving = true;
      win.close();
    });
  });
  // The page asks before it goes with unsaved changes (or a room it hosts), as a browser does: Electron shows nothing
  // for that by itself. A window leaving was asked already; a reload is asked here.
  win.webContents.on('will-prevent-unload', (event) => {
    if (entry.leaving || askNow(entry, leaveQuit())) event.preventDefault();   // the page goes after all
  });
  // A reload (not the router's own moves) starts a page that hasn't said it takes files yet. A file it was sent is gone
  // with the page, so it's no longer on its way; one still waiting to be sent is.
  win.webContents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    entry.filesReady = false;
    entry.claimed = entry.pending.some((job) => job.file);
  });
  win.on('focus', () => {
    focusOrder.splice(focusOrder.indexOf(id), 1);
    focusOrder.push(id);
    buildMenu();
  });
  win.on('closed', () => {
    windows.delete(id);
    stopService(entry);   // in case its page didn't
    focusOrder.splice(focusOrder.indexOf(id), 1);
    entry.ready?.();   // a window gone is ready
    for (const [request, { entry: asked, resolve }] of unsavedAsked) {
      if (asked === entry) {
        unsavedAsked.delete(request);
        resolve(false);
      }
    }
    buildMenu();
  });
  win.loadURL(`${ORIGIN}/`);
  return entry;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  // A file double-clicked while the app is open: on Windows and Linux a second launch, naming it (or none: a new
  // window).
  app.on('second-instance', (_event, argv, cwd) => {
    const files = filesIn(argv.slice(1), cwd);
    if (!app.isReady()) launchFiles.push(...files);
    else if (!files.length) openWindow();
    else for (const file of files) deliver(file);
  });
  // On macOS, a file double-clicked or dropped on the Dock icon, before the app is ready too.
  app.on('open-file', (event, file) => {
    event.preventDefault();
    if (app.isReady()) deliver(file);
    else launchFiles.push(file);
  });
  launchFiles.push(...filesIn(process.argv.slice(1)));
  // The last window closed: the app quits, except on macOS, where its menu bar stays.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // A quit asks every window first, one at a time, and Stay in any calls it off; then every page hands over. One quit
  // runs at a time.
  app.on('before-quit', (event) => {
    if (quitReady || !windows.size) return;
    event.preventDefault();
    const asked = [...windows.values()];   // a window opened meanwhile is asked as it closes
    quitting ??= leaving(asked, leaveQuit).then((going) => {
      quitting = null;
      if (!going) return;
      for (const entry of asked) entry.leaving = true;
      quitReady = true;
      app.quit();
    });
  });

  handle('phosphor:start-service', startService);
  handle('phosphor:service-info', serviceInfo);
  handle('phosphor:stop-service', stopService);
  handle('phosphor:set-menu', setMenu);
  handle('phosphor:open-file', openFile);
  handle('phosphor:open-in-window', openInWindow);
  handle('phosphor:save-project', saveProject);
  handle('phosphor:releases', () => releases());
  ipcMain.on('phosphor:files-ready', (event) => {
    const entry = entryOf(event);
    if (!fromApp(event) || !entry) return;
    entry.filesReady = true;
    for (const job of entry.pending.splice(0)) {
      if (job.file) sendFile(entry, job.file);
      else send(entry, 'phosphor:menu', job.command);
    }
  });
  // A window's page has handed over: it's ready to go.
  ipcMain.on('phosphor:quit-ready', (event) => {
    if (fromApp(event)) entryOf(event)?.ready?.();
  });
  // Whether a window's page has unsaved work, answered to the request it was sent.
  ipcMain.on('phosphor:unsaved-answer', (event, id, unsavedWork) => {
    const asked = unsavedAsked.get(id);
    if (!fromApp(event) || asked?.entry !== entryOf(event)) return;
    unsavedAsked.delete(id);
    asked.resolve(unsavedWork === true);
  });

  app.whenReady().then(() => {
    recent = recentFiles(path.join(app.getPath('userData'), 'recent.json'));
    for (const file of recent.list()) granted.add(file);
    protocol.handle('app', serve);
    // No permission is given, but writing to the clipboard (a room's link is copied) and keeping the screen on (in a
    // room, or while an animation plays: useScreenAwake).
    const ALLOWED = new Set(['clipboard-sanitized-write', 'screen-wake-lock']);
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED.has(permission)));
    openWindow();
    // The first fills the first window, the rest get their own.
    for (const file of launchFiles.splice(0)) deliver(file);
    // A Dock click on macOS with no window open opens one.
    app.on('activate', () => {
      if (!windows.size) openWindow();
    });
  });
}
