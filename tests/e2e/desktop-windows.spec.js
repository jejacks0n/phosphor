// The desktop app's windows: New Window, files opened from the system or the menu going to a window of their own when
// the one they'd open in has a drawing, a project already open brought forward, each window's title, the menu
// following the focused window, closing a window and quitting with several (each asks first with unsaved work, and a
// host's room is handed on), and the last window closing.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test, expect, launchApp, openImage, clickMenu, windowsOf, nextWindow, openFromSystem, windowId, windowTitle, focusWindow,
  focusedId, menuEnabled, closeWindow, hostRoom, inRoom, drawing, role, live,
} from './desktop-support.js';
import { cellPoint, drag, fixture, pickLayer, startScreen, store } from './support.js';

let launched, others = [];
test.afterEach(async () => {
  await launched?.close();
  launched = null;
  for (const other of others.splice(0)) await other.close();
});

const hasImage = (page) => store(page, 'project', (p) => !!p.image);

test('File > New Window opens a second window on the start screen; closing it keeps the first', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  const next = nextWindow(app);
  await clickMenu(app, 'File', 'New Window');
  const second = await next;
  expect(windowsOf(app)).toHaveLength(2);
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
  const file = join(folder, 'night.phosphor');
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
// each asked, as [the window's id, the question] (and says it in the main process's console, for once it's gone).
const answer = (app, ...choices) => app.evaluate(({ dialog }, choices) => {
  globalThis.asked = [];
  dialog.showMessageBoxSync = (win, { message }) => {
    globalThis.asked.push([win.webContents.id, message]);
    console.log(`asked: ${message}`);
    return choices[Math.min(globalThis.asked.length, choices.length) - 1];
  };
}, choices);
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
