// The desktop app's windows: New Window, files opened from the system or the menu going to a window of their own when
// the one they'd open in has a drawing, a project already open brought forward, each window's title, the menu
// following the focused window, and the last window closing.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test, expect, launchApp, openImage, clickMenu, windowsOf, nextWindow, openFromSystem, windowId, windowTitle, focusWindow,
  focusedId, menuEnabled,
} from './desktop-support.js';
import { fixture, startScreen, store } from './support.js';

let launched;
test.afterEach(async () => {
  await launched?.close();
  launched = null;
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
