// The desktop app's shell: Electron serving the desktop build from app://phosphor/, its bridge to the room service,
// and the quit that waits for the page.
import { test, expect, launchApp } from './desktop-support.js';
import { fixture, imageInput, settled, store, tab } from './support.js';

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
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toEqual({ ...started, mode: 'host' });

  // The service is there, and says whose it is.
  const sub = await page.evaluate(() => new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:31401/probe?nonce=n1');
    ws.onmessage = (e) => { resolve(JSON.parse(e.data).sub); ws.close(); };
  }));
  expect(sub).toBe('ann-sub');

  const again = await page.evaluate(() => window.phosphorDesktop.startService({ port: 31402, mode: 'standby', sub: 'bob-sub' }));
  expect(again).toEqual(started);
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toEqual({ ...started, mode: 'standby' });

  await page.evaluate(() => window.phosphorDesktop.stopService());
  expect(await page.evaluate(() => window.phosphorDesktop.serviceInfo())).toBeNull();
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
