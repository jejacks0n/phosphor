// The desktop app's windows: New Window, files opened from the system or the menu going to a window of their own when
// the one they'd open in has a drawing (a file dropped on a drawing too, when asked to), a project already open brought
// forward, each window's title, the menu following the focused window, closing a window and quitting with several (each
// asks first with unsaved work, and a host's room is handed on), the last window closing, and a room per window: each
// its own service on its own port, a second window joining the first's room as someone else, and a window's service
// going with it, a room answering while another window's question is up, and each window's key through its reloads.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test, expect, launchApp, openImage, clickMenu, windowsOf, nextWindow, openFromSystem, windowId, windowTitle, focusWindow,
  focusedId, menuEnabled, closeWindow, hostRoom, joinRoom, inRoom, drawing, role, live, WAITING,
} from './desktop-support.js';
import { cellPoint, drag, fixture, pickLayer, startScreen, store } from './support.js';
import { openLobby } from './social-support.js';

let launched, others = [];
test.afterEach(async () => {
  await launched?.close();
  launched = null;
  for (const other of others.splice(0)) await other.close();
});

// False until the window's page has mounted its app (a new window's may not have yet).
const hasImage = (page) => store(page, 'project', (p) => !!p.image).catch(() => false);

test('File > New Window opens a second window on the start screen; closing it keeps the first', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  const next = nextWindow(app);
  await clickMenu(app, 'File', 'New Window');
  const second = await next;
  expect(windowsOf(app)).toHaveLength(2);
  // Dark before the page paints, as the app's default theme is, not white: every window, the first and a new one.
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getBackgroundColor().toLowerCase()))).toEqual(['#1a1a1a', '#1a1a1a']);
  await startScreen(second);
  expect(await hasImage(page)).toBe(true);

  await second.close();
  await expect.poll(() => windowsOf(app).length).toBe(1);
  expect(app.process().exitCode).toBeNull();
  expect(await hasImage(page)).toBe(true);
});

test('a file double-clicked while a window has a drawing opens in a new window and leaves the drawing as it was', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  await store(page, 'project', (p) => { p.cols = 60; });
  const next = nextWindow(app);
  await openFromSystem(app, [fixture('images/one.png')]);
  const second = await next;
  await expect.poll(() => store(second, 'project', (p) => [!!p.image, p.filename])).toEqual([true, 'one']);
  expect(windowsOf(app)).toHaveLength(2);
  expect(await store(page, 'project', (p) => [!!p.image, p.filename, p.cols])).toEqual([true, 'gradient', 60]);
});

test('a file for an empty window opens there', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await startScreen(page);
  await openFromSystem(app, [fixture('images/gradient.png')]);
  await expect.poll(() => hasImage(page)).toBe(true);
  expect(windowsOf(app)).toHaveLength(1);
});

test('two files at once get a window each', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  await openFromSystem(app, [fixture('images/one.png'), fixture('images/tall.png')]);
  await expect.poll(() => windowsOf(app).length).toBe(3);
  for (const each of windowsOf(app)) await expect.poll(() => hasImage(each)).toBe(true);
  expect((await Promise.all(windowsOf(app).map((each) => store(each, 'project', (p) => p.filename)))).sort()).toEqual(['gradient', 'one', 'tall']);
});

// Open… with the system's chooser stood in for, picking `file`.
const pickInOpen = (app, file) => app.evaluate(({ dialog }, picked) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] }); }, file);

test('Open… from a window with a drawing opens the file in a new window and leaves the drawing', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  await pickInOpen(app, fixture('images/one.png'));
  const next = nextWindow(app);
  await clickMenu(app, 'File', 'Open…');
  const second = await next;
  await expect.poll(() => store(second, 'project', (p) => p.filename)).toBe('one');
  expect(windowsOf(app)).toHaveLength(2);
  expect(await store(page, 'project', (p) => p.filename)).toBe('gradient');
});

// `file` dropped on the page's drop zone. A file put in a DataTransfer by the page has no path, so it's picked first in
// an input of the test's own (setInputFiles gives it the real file, with its path) and dropped from there.
async function dropFile(page, file) {
  await page.evaluate(() => document.body.append(Object.assign(document.createElement('input'), { type: 'file', id: 'test-drop', hidden: true })));
  await page.locator('#test-drop').setInputFiles(file);
  await page.evaluate(() => {
    const input = document.getElementById('test-drop');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(input.files[0]);
    input.remove();
    document.querySelector('article.drop-zone').dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
  });
}

test('a picture dropped over a drawing and opened in a new window leaves the drawing', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page, 'images/one.png');
  const drawingOf = (each) => store(each, 'project', (p) => [p.filename, p.layers.length, p.editVersion]);
  const before = await drawingOf(page);
  await dropFile(page, fixture('images/gradient.png'));
  await expect(page.getByRole('button', { name: /Add to this drawing/ })).toBeVisible();
  const next = nextWindow(app);
  await page.getByRole('button', { name: /Open in a new window/ }).click();
  const second = await next;
  await expect.poll(() => store(second, 'project', (p) => [!!p.image, p.filename])).toEqual([true, 'gradient']);
  expect(windowsOf(app)).toHaveLength(2);
  expect(await drawingOf(page)).toEqual(before);
  expect(before[0]).toBe('one');
});

test('a file the window couldn’t open leaves it free: Open… there opens in that window', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'phosphor-windows-'));
  const bad = join(folder, 'broken.phosphor');
  writeFileSync(bad, 'not a project');
  try {
    launched = await launchApp();
    const { app, page } = launched;
    await startScreen(page);
    const failed = page.waitForEvent('dialog');
    await openFromSystem(app, [bad]);
    await (await failed).dismiss();   // the page's alert that it couldn't open it
    expect(await hasImage(page)).toBe(false);

    await pickInOpen(app, fixture('images/gradient.png'));
    await clickMenu(app, 'File', 'Open…');
    await expect.poll(() => hasImage(page)).toBe(true);
    expect(windowsOf(app)).toHaveLength(1);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a project already open is brought forward, not opened twice', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'phosphor-windows-'));
  const file = join(folder, 'night.pho');
  try {
    launched = await launchApp();
    const { app, page } = launched;
    await app.evaluate(({ dialog }, chosen) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: chosen }); }, file);
    await openImage(page);
    await clickMenu(app, 'File', 'Save');
    await expect.poll(() => store(page, 'project', (p) => p.filePath)).toBe(file);

    const next = nextWindow(app);
    await clickMenu(app, 'File', 'New Window');
    const second = await next;
    await focusWindow(app, second);
    await expect.poll(() => focusedId(app)).toBe(await windowId(app, second));

    await openFromSystem(app, [file]);
    await expect.poll(() => focusedId(app)).toBe(await windowId(app, page));
    expect(windowsOf(app)).toHaveLength(2);
    expect(await hasImage(second)).toBe(false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('each window’s title is its drawing’s name', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await expect.poll(() => windowTitle(app, page)).toBe('Phosphor');
  await openImage(page);
  await expect.poll(() => windowTitle(app, page)).toBe('gradient');
  const next = nextWindow(app);
  await clickMenu(app, 'File', 'New Window');
  const second = await next;
  await expect.poll(() => windowTitle(app, second)).toBe('Phosphor');
  expect(await windowTitle(app, page)).toBe('gradient');
});

test('the menu follows the focused window', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  await expect.poll(() => menuEnabled(app, 'File', 'Save')).toBe(true);
  const next = nextWindow(app);
  await clickMenu(app, 'File', 'New Window');
  const second = await next;
  await focusWindow(app, second);
  await expect.poll(() => menuEnabled(app, 'File', 'Save')).toBe(false);
  await focusWindow(app, page);
  await expect.poll(() => menuEnabled(app, 'File', 'Save')).toBe(true);
});

test('the last window closing: macOS keeps the app with a working menu, elsewhere it quits', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await startScreen(page);
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await page.close();
  if (process.platform === 'darwin') {
    await expect.poll(() => windowsOf(app).length).toBe(0);
    expect(app.process().exitCode).toBeNull();
    const next = nextWindow(app);
    await clickMenu(app, 'File', 'New Window');
    await startScreen(await next);
    expect(windowsOf(app)).toHaveLength(1);
  } else {
    await exited;
    launched = null;
  }
});

// A window from File > New Window, loaded.
async function newWindow(app) {
  const next = nextWindow(app);
  await clickMenu(app, 'File', 'New Window');
  return next;
}

// A pencil stroke on a new image: unsaved work.
async function unsavedWork(page) {
  await openImage(page);
  await pickLayer(page, 'Layer 1');
  await page.getByRole('button', { name: 'Pencil' }).click();
  await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
  expect(await store(page, 'project', (p) => p.isDirty)).toBe(true);
}

// The Leave/Stay box stood in for: it answers each question in turn from `choices` (0 Leave, 1 Stay), and keeps what
// each asked, as [the window's id, the question] (and says it in the main process's console, for once it's gone). A
// choice of null holds the box open until release(app, choice) answers it.
const answer = (app, ...choices) => app.evaluate(({ dialog }, choices) => {
  globalThis.asked = [];
  dialog.showMessageBox = async (win, { message }) => {
    globalThis.asked.push([win.webContents.id, message]);
    console.log(`asked: ${message}`);
    const response = choices[Math.min(globalThis.asked.length, choices.length) - 1];
    return { response: response ?? await new Promise((resolve) => { globalThis.release = resolve; }) };
  };
}, choices);
const release = (app, choice) => app.evaluate((_electron, choice) => globalThis.release(choice), choice);
const asked = (app) => app.evaluate(() => globalThis.asked);

test('closing a window with unsaved work asks Close this window?: Stay keeps it, Leave closes it alone', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  const second = await newWindow(app);
  await unsavedWork(second);
  const id = await windowId(app, second);

  await answer(app, 1);   // Stay
  await closeWindow(app, second);
  await expect.poll(() => asked(app)).toEqual([[id, 'Close this window?']]);
  expect(await store(second, 'project', (p) => p.isDirty)).toBe(true);
  expect(windowsOf(app)).toHaveLength(2);

  await answer(app, 0);   // Leave
  await closeWindow(app, second);
  await expect.poll(() => windowsOf(app).length).toBe(1);
  expect(await asked(app)).toEqual([[id, 'Close this window?']]);
  expect(app.process().exitCode).toBeNull();
  await startScreen(page);
});

test('a quit with two windows of unsaved work asks each, and Stay in the second calls the quit off with nothing closed', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await unsavedWork(page);
  const second = await newWindow(app);
  await unsavedWork(second);
  const third = await newWindow(app);
  await hostRoom({ ...launched, page: third });
  const ids = [await windowId(app, page), await windowId(app, second)];

  await answer(app, 0, 1);   // Leave, then Stay
  await app.evaluate(({ app }) => app.quit());
  await expect.poll(() => asked(app)).toEqual(ids.map((id) => [id, 'Leave Phosphor?']));
  expect(windowsOf(app)).toHaveLength(3);
  expect(app.process().exitCode).toBeNull();
  expect(await role(third)).toBe('host');
  await live(third);
  await answer(app, 0);   // the room ends as the test closes the app
});

test('a quit answered Leave everywhere quits', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await unsavedWork(page);
  await unsavedWork(await newWindow(app));

  const questions = [];
  app.on('console', (message) => { if (message.text().startsWith('asked: ')) questions.push(message.text()); });
  await answer(app, 0);
  const exited = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app }) => app.quit());
  await exited;
  launched = null;
  expect(questions).toEqual(['asked: Leave Phosphor?', 'asked: Leave Phosphor?']);   // not again as the pages go
});

test('closing a hosting window hands its room on as quitting does', async () => {
  launched = await launchApp({ name: 'ann', port: 31401 });
  const bob = await launchApp({ name: 'bob', port: 31402 });
  others.push(bob);
  const { app, page } = launched;
  const { address } = await hostRoom(launched);
  await inRoom(launched, bob, address);
  await drawing(launched, bob);
  await expect.poll(() => store(page, 'room', (r) => Object.keys(r.hostable).length), { timeout: 10_000 }).toBe(1);
  const second = await newWindow(app);

  await closeWindow(app, page);
  await expect.poll(() => role(bob.page), { timeout: 20_000 }).toBe('host');
  await live(bob.page);
  await expect.poll(() => windowsOf(app).length).toBe(1);
  expect(windowsOf(app)[0]).toBe(second);
  expect(app.process().exitCode).toBeNull();
});

// A window's own room service, as its page asks the main process.
const serviceOf = (page) => page.evaluate(() => window.phosphorDesktop.serviceInfo());
// What the room service on this computer at `port` says it has (its /info answer), or null when nothing answers there.
const roomAt = (page, port) => page.evaluate((port) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/info`);
  ws.onmessage = (e) => { resolve(JSON.parse(e.data)); ws.close(); };
  ws.onerror = () => resolve(null);
}), port);

test('two windows host two rooms on two ports', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await hostRoom(launched);
  const second = await newWindow(app);
  await hostRoom({ ...launched, page: second }, { roomName: 'day shift' });   // the same port asked: the next is free

  const [first, next] = [(await serviceOf(page)).port, (await serviceOf(second)).port];
  expect(first).toBe(31401);
  expect(next).toBe(31402);
  expect(await roomAt(page, first)).toMatchObject({ type: 'info', name: 'night shift' });
  expect(await roomAt(page, next)).toMatchObject({ type: 'info', name: 'day shift' });

  await store(second, 'room', (r) => r.endRoom());
  await expect.poll(() => role(second)).toBe(null);
  await expect.poll(() => serviceOf(second)).toBeNull();
  expect(await roomAt(page, first)).toMatchObject({ name: 'night shift' });
  expect(await role(page)).toBe('host');
  await live(page);
});

test('a second window joins the first window’s room under its own name and fingerprint', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  const { address } = await hostRoom(launched);
  const second = await newWindow(app);
  await joinRoom({ ...launched, page: second }, address);
  await expect(second.getByText(WAITING)).toBeVisible();

  const [sub, otherSub] = [await store(page, 'social', (s) => s.claims.sub), await store(second, 'social', (s) => s.claims.sub)];
  expect(otherSub).not.toBe(sub);
  await expect(page.getByRole('list', { name: 'Waiting to join' }).first()).toContainText(`ann #${otherSub.slice(0, 4)} wants to join`);
  await page.getByRole('button', { name: 'Let ann in' }).first().click();
  await live(second);
  expect(await role(second)).toBe('watch');
  await expect.poll(() => store(second, 'room', (r) => !!r.art), { timeout: 20_000 }).toBe(true);
  expect(await role(page)).toBe('host');
});

test('a window’s room service goes with the window', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await hostRoom(launched);
  const second = await newWindow(app);
  await hostRoom({ ...launched, page: second }, { roomName: 'day shift' });
  const { port } = await serviceOf(second);
  expect(await roomAt(page, port)).toMatchObject({ name: 'day shift' });

  await closeWindow(app, second);   // no artist: its room ends
  await expect.poll(() => windowsOf(app).length).toBe(1);
  await expect.poll(() => roomAt(page, port)).toBeNull();
  expect(await roomAt(page, 31401)).toMatchObject({ name: 'night shift' });
  expect(await role(page)).toBe('host');
  await live(page);
});

test('a room keeps answering while another window asks Close this window?', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await hostRoom(launched);
  const second = await newWindow(app);
  await unsavedWork(second);
  const id = await windowId(app, second);

  await answer(app, null);   // the box stays up
  await closeWindow(app, second);
  await expect.poll(() => asked(app)).toEqual([[id, 'Close this window?']]);
  expect(await roomAt(page, 31401)).toMatchObject({ type: 'info', name: 'night shift' });
  await release(app, 1);   // Stay
  await expect.poll(() => store(second, 'project', (p) => p.isDirty)).toBe(true);
  expect(windowsOf(app)).toHaveLength(2);
  await live(page);
  await answer(app, 0);   // the app closes as the test ends
});

test('each window keeps its own key through its reloads', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  const second = await newWindow(app);
  const keyOf = async (window) => {
    await openLobby(window);
    await expect.poll(() => store(window, 'social', (s) => s._key?.publicKey ?? null)).not.toBeNull();
    return store(window, 'social', (s) => s._key.publicKey);
  };
  const keys = [await keyOf(page), await keyOf(second)];
  expect(keys[0]).not.toBe(keys[1]);

  for (const [i, window] of [page, second].entries()) {
    await window.reload();
    expect(await keyOf(window)).toBe(keys[i]);
  }
});
