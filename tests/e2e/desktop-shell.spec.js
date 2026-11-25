// The desktop app's shell: Electron serving the desktop build from app://phosphor/, its bridge to the room service,
// and the quit that waits for the page.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, launchApp, openImage, menuLabels, clickMenu, menuEnabled } from './desktop-support.js';
import { cellPoint, drag, fixture, pickLayer, store } from './support.js';

let launched;
test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('the desktop app opens an image and shows the ANSI tab', async () => {
  launched = await launchApp();
  const { page } = launched;
  expect(page.url()).toMatch(/^app:\/\/phosphor\//);
  await openImage(page);
  await expect(page.locator('.ansi-editor .display canvas')).toBeVisible();
  expect(await store(page, 'project', (p) => p.cols)).toBe(80);
  expect(launched.refused).toEqual([]);
});

test('a GIF exports with its worker loaded from app://phosphor/, and a video with its muxer', async () => {
  launched = await launchApp();
  const { page } = launched;
  await openImage(page);
  await store(page, 'project', (p) => { p.animate = true; p.addFrame('blank'); });
  const heads = await store(page, 'project', async (p) => {
    let blob;
    URL.createObjectURL = (made) => { blob = made; return 'about:blank'; };
    HTMLAnchorElement.prototype.click = () => {};
    const bytes = async () => new Uint8Array(await blob.arrayBuffer());
    await p.exportAnimation('gif', { filename: 'loop' });
    const gif = String.fromCharCode(...(await bytes()).subarray(0, 6));
    await p.exportAnimation('mp4', { filename: 'loop' });
    return [gif, String.fromCharCode(...(await bytes()).subarray(4, 8))];
  });
  expect(heads).toEqual(['GIF89a', 'ftyp']);
  expect(launched.refused).toEqual([]);
});

test('licenses.json, which About lists, comes from app://phosphor/ with the main process\'s ws in it', async () => {
  launched = await launchApp();
  const { page } = launched;
  const names = await page.evaluate(async () => (await (await fetch('/licenses.json')).json()).map(({ name }) => name));
  expect(names).toEqual(expect.arrayContaining(['vue', 'paper', 'ws']));
  expect(launched.refused).toEqual([]);
});

test('nothing leaves the app', async () => {
  launched = await launchApp();
  const { page } = launched;
  const urls = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.reload();
  await openImage(page);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((u) => /^https?:/.test(u))).toEqual([]);
});

// The page's door to Get from Lospec, through the main process to desktop/lospec.js. A slug that isn't one is refused
// before anything is asked, so this reaches no one.
test('the page asks the main process for a Lospec palette, which refuses what isn\'t a slug', async () => {
  launched = await launchApp();
  const { page } = launched;
  expect(await page.evaluate(() => window.phosphorDesktop.lospecPalette('Bad Slug'))).toEqual({ failed: 'notPalette' });
  expect(launched.refused).toEqual([]);
});

// The page's door to an issue report, through the main process to desktop/issueReport.js. One with nothing written, and
// one with a drawing bigger than a report holds, are refused before anything is asked, so this reaches no one.
test('the page asks the main process to send an issue report, which refuses one with nothing wrong written, and reads a drawing\'s bytes as the page sent them', async () => {
  launched = await launchApp();
  const { page } = launched;
  const fields = { doing: '', wrong: '  ', packageVersion: '1.0.0-beta', build: '1.0.0-beta (abc1234)', agent: 'Electron 45 on macOS' };
  expect(await page.evaluate((report) => window.phosphorDesktop.sendIssueReport(report, { drawing: null, steps: null }), fields)).toEqual({ ok: false, error: 'bad-request' });
  // The drawing arrives as bytes it can measure (too big, not a file it can't read): a page's Uint8Array crosses whole.
  const tooBig = await page.evaluate((report) => window.phosphorDesktop.sendIssueReport({ ...report, wrong: 'It broke' }, { drawing: { name: 'big.pho', bytes: new Uint8Array(26 * 1024 * 1024) }, steps: 'steps' }), fields);
  expect(tooBig).toEqual({ ok: false, error: 'too-big' });
  expect(launched.refused).toEqual([]);
});

test('the room service keeps its port and secret across a reload, changes mode without rebinding, and stops', async () => {
  launched = await launchApp();
  const { page } = launched;
  const started = await page.evaluate(() => window.phosphorDesktop.startService({ port: 31401, mode: 'host', sub: 'ann-sub' }));
  expect(started).toEqual({ port: 31401, addresses: ['127.0.0.1:31401'], secret: expect.any(String) });
  expect(started.secret.length).toBeGreaterThanOrEqual(32);

  await page.reload();
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toEqual({ ...started, mode: 'host', password: null });   // no room greeted yet

  // The service is there, and says whose it is.
  const sub = await page.evaluate(() => new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:31401/probe?nonce=n1');
    ws.onmessage = (e) => { resolve(JSON.parse(e.data).sub); ws.close(); };
    ws.onerror = ws.onclose = () => reject(new Error('No answer from the probe'));
  }));
  expect(sub).toBe('ann-sub');

  const again = await page.evaluate(() => window.phosphorDesktop.startService({ port: 31402, mode: 'standby', sub: 'bob-sub' }));
  expect(again).toEqual(started);
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toEqual({ ...started, mode: 'standby', password: null });

  await page.evaluate(() => window.phosphorDesktop.stopService());
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toBeNull();
});

test('the page can start the service only on a real port, a malformed path is not found, and permissions are denied but the screen kept on', async () => {
  launched = await launchApp();
  const { page } = launched;
  for (const port of ['abc', 0, 70000, 1.5]) {
    await expect(page.evaluate((port) => window.phosphorDesktop.startService({ port, mode: 'host', sub: 's' }), port)).rejects.toThrow(/No port/);
  }
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toBeNull();
  expect((await page.evaluate(() => window.phosphorDesktop.startService({ port: ' 31403 ', mode: 'host', sub: 's' }))).port).toBe(31403);
  expect(await page.evaluate(() => fetch('/%E0%A4%A').then((r) => r.status))).toBe(404);
  expect(await page.evaluate(() => Notification.requestPermission())).toBe('denied');
  expect(await page.evaluate(async () => {
    const lock = await navigator.wakeLock.request('screen');
    await lock.release();
    return lock.type;
  })).toBe('screen');
});

test('a quit waits for the page to say it is ready', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await page.evaluate(() => window.phosphorDesktop.onQuit(() => { window.quitAsked = true; }));
  const closed = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app }) => app.quit());
  await expect.poll(() => page.evaluate(() => window.quitAsked)).toBe(true);
  expect(app.process().exitCode).toBeNull();
  await page.evaluate(() => window.phosphorDesktop.quitReady());
  await closed;
});

// A window with unsaved work is asked before the page hears of the quit; the test answers for the person by standing
// in for the dialog.
test('a quit with unsaved changes asks first: Stay keeps the app, Leave waits for the page and quits', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  await pickLayer(page, 'Layer 1');
  await page.getByRole('button', { name: 'Pencil' }).click();
  await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
  expect(await store(page, 'project', (p) => p.isDirty)).toBe(true);
  const answer = (choice) => app.evaluate(({ dialog }, choice) => {
    globalThis.asked = 0;
    dialog.showMessageBox = async () => { globalThis.asked++; return { response: choice }; };
  }, choice);
  const asked = () => app.evaluate(() => globalThis.asked);
  await page.evaluate(() => window.phosphorDesktop.onQuit(() => { window.quitAsked = true; }));

  await answer(1);   // Stay
  await app.evaluate(({ app }) => app.quit());
  await expect.poll(asked).toBe(1);
  expect(app.process().exitCode).toBeNull();
  expect(await store(page, 'project', (p) => p.cols)).toBe(80);
  expect(await page.evaluate(() => window.quitAsked)).toBeUndefined();   // called off before the page heard

  await answer(0);   // Leave
  await app.evaluate(({ app }) => app.quit());
  await expect.poll(() => page.evaluate(() => window.quitAsked)).toBe(true);
  expect(await asked()).toBe(1);
  expect(app.process().exitCode).toBeNull();   // held for the page
  const closed = new Promise((resolve) => app.process().once('exit', resolve));
  await page.evaluate(() => window.phosphorDesktop.quitReady());
  await closed;
});

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// The menu bar is in the page's words; Save asks where once (the save box stood in for), then writes over that file;
// Open Recent and a file named at launch open it again; Open is the system's chooser.
test('the menu saves a project where the box says and then over it, and it opens again from Open Recent and at launch', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'phosphor-saved-'));
  const file = join(folder, 'night.pho');
  let second;
  try {
    launched = await launchApp();
    const { app, page } = launched;
    await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining(['File', 'Edit', 'Room', 'View', 'Help']));
    await app.evaluate(({ dialog }, chosen) => {
      globalThis.boxes = 0;
      dialog.showSaveDialog = async () => { globalThis.boxes++; return { canceled: false, filePath: chosen }; };
    }, join(folder, 'night'));   // no extension typed: .pho is added
    await openImage(page);

    // Help's links open in the browser, for Phosphor's version (package.json's, not Electron's).
    await app.evaluate(({ shell }) => { globalThis.opened = []; shell.openExternal = async (url) => { globalThis.opened.push(url); }; });
    await clickMenu(app, 'Help', 'Release Notes');
    expect(await app.evaluate(() => globalThis.opened)).toEqual([`https://github.com/jejacks0n/phosphor/releases/tag/v${version}`]);

    await clickMenu(app, 'File', 'Save');
    await expect.poll(() => store(page, 'project', (p) => p.filePath)).toBe(file);
    expect(existsSync(file)).toBe(true);
    expect(await store(page, 'project', (p) => [p.filename, p.isDirty])).toEqual(['night', false]);

    await store(page, 'project', (p) => { p.cols = 60; });
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => store(page, 'project', (p) => p.isDirty)).toBe(false);
    expect(await app.evaluate(() => globalThis.boxes)).toBe(1);

    await clickMenu(app, 'File', 'New');
    await expect.poll(() => store(page, 'project', (p) => !!p.image)).toBe(false);
    await clickMenu(app, 'File', 'Open Recent', 'night.pho');
    await expect.poll(() => store(page, 'project', (p) => [p.filename, p.filePath, p.cols])).toEqual(['night', file, 60]);

    await clickMenu(app, 'File', 'New');
    // Open decides in main whether the file opens here, by what the page last told it: until it hears the drawing went
    // (Save off), the file would go to a new window.
    await expect.poll(() => menuEnabled(app, 'File', 'Save')).toBe(false);
    await app.evaluate(({ dialog }, picked) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] }); }, fixture('images/gradient.png'));
    await page.keyboard.press('ControlOrMeta+o');
    await expect.poll(() => store(page, 'project', (p) => [p.filename, p.filePath])).toEqual(['gradient', null]);
    await launched.close();

    second = await launchApp({ files: [file] });
    await expect.poll(() => store(second.page, 'project', (p) => [p.filename, p.filePath, p.cols])).toEqual(['night', file, 60]);
  } finally {
    await second?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
