// The desktop app's shell: Electron serving the desktop build from app://phosphor/, its bridge to the room service,
// and the quit that waits for the page.
import { test, expect, launchApp } from './desktop-support.js';
import { cellPoint, drag, fixture, imageInput, pickLayer, settled, store, tab } from './support.js';

let launched;
test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const openImage = async (page) => {
  await imageInput(page).setInputFiles(fixture('images/gradient.png'));
  await tab(page, 'ANSI').click();
  await settled(page);
};

test('the desktop app opens an image and shows the ANSI tab', async () => {
  launched = await launchApp();
  const { page } = launched;
  expect(page.url()).toMatch(/^app:\/\/phosphor\//);
  await openImage(page);
  await expect(page.locator('.ansi-editor .display canvas')).toBeVisible();
  expect(await store(page, 'project', (p) => p.cols)).toBe(80);
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

test('the page can start the service only on a real port, a malformed path is not found, and permissions are denied', async () => {
  launched = await launchApp();
  const { page } = launched;
  for (const port of ['abc', 0, 70000, 1.5]) {
    await expect(page.evaluate((port) => window.phosphorDesktop.startService({ port, mode: 'host', sub: 's' }), port)).rejects.toThrow(/No port/);
  }
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toBeNull();
  expect((await page.evaluate(() => window.phosphorDesktop.startService({ port: ' 31403 ', mode: 'host', sub: 's' }))).port).toBe(31403);
  expect(await page.evaluate(() => fetch('/%E0%A4%A').then((r) => r.status))).toBe(404);
  expect(await page.evaluate(() => Notification.requestPermission())).toBe('denied');
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

// Electron shows nothing when the page asks before it goes (beforeunload), so the main process asks; the test answers
// for the person by standing in for the dialog.
test('a quit with unsaved changes asks: Stay keeps the app and the next quit waits again, Leave quits', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  await openImage(page);
  await pickLayer(page, 'Layer 1');
  await page.getByRole('button', { name: 'Pencil' }).click();
  await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
  expect(await store(page, 'project', (p) => p.isDirty)).toBe(true);
  const answer = (choice) => app.evaluate(({ dialog }, choice) => {
    globalThis.asked = 0;
    dialog.showMessageBoxSync = () => { globalThis.asked++; return choice; };
  }, choice);
  const asked = () => app.evaluate(() => globalThis.asked);

  await answer(1);   // Stay
  await app.evaluate(({ app }) => app.quit());
  await expect.poll(asked).toBe(1);
  expect(app.process().exitCode).toBeNull();
  expect(await store(page, 'project', (p) => p.cols)).toBe(80);

  await page.evaluate(() => window.phosphorDesktop.onQuit(() => { window.quitAsked = true; }));
  await app.evaluate(({ app }) => app.quit());
  await expect.poll(() => page.evaluate(() => window.quitAsked)).toBe(true);
  expect(await asked()).toBe(1);   // held for the page, not asked yet

  await answer(0);   // Leave
  const closed = new Promise((resolve) => app.process().once('exit', resolve));
  await page.evaluate(() => window.phosphorDesktop.quitReady());
  await closed;
});
