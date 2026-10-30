// The e2e flows' helpers: open the app with an image loaded through its file input, and read the
// stores (for assertions only; actions go through the UI).
import { fileURLToPath } from 'node:url';
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

// Every spec's test: the SOCIAL server (localhost:8787, the API and the lobby's socket) is cut off for
// every page in the context unless the spec installs fakeServer (social-support.js), whose page routes
// come before the context's.
// And anything the built page's Content-Security-Policy refuses fails the test, even if the flow went on without it.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('http://localhost:8787/**', (route) => route.abort());
    await context.routeWebSocket('ws://localhost:8787/**', (ws) => ws.close());
    await use(context);
  },
  page: async ({ page }, use) => {
    const refused = [];
    page.on('console', (m) => { if (m.text().includes('Content Security Policy')) refused.push(m.text()); });
    await use(page);
    base.expect(refused).toEqual([]);
  },
});

export const fixture = (path) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url));

// The start screen's file input (images and projects), not the Font field's.
export const imageInput = (page) => page.locator('input[type=file][accept^="image/"]');

// The app with an image loaded, on the ANSI tab. A page that has the app open is reopened as a new tab
// would be: a tab's document comes back on a reload, so the tab forgets it first (a page still at
// about:blank has no storage to forget).
export async function openApp(page, image = 'images/gradient.png') {
  if (page.url() !== 'about:blank') await page.evaluate(() => sessionStorage.removeItem('phosphor-autosave-document'));
  await page.goto('/');
  await imageInput(page).setInputFiles(fixture(image));
  await tab(page, 'ANSI').click();
  await settled(page);
}

// Save or export through the save dialog: the button, then the dialog's Save/Export; the download.
export async function saveAs(page, button, { name } = {}) {
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog');
  if (name !== undefined) await dialog.getByRole('textbox', { name: 'File name' }).fill(name);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^(Save|Export)$/ }).click()]);
  return download;
}

// An editor tab: PIXEL, ANSI, SAUCE or SOCIAL.
export const tab = (page, label) => page.getByRole('tab', { name: label, exact: true });

// A store's state, or an expression over it: store(page, 'project', (p) => p.cells.length).
export function store(page, name, read = (s) => s.$state) {
  return page.evaluate(([name, source]) => {
    const pinia = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia;
    return new Function('s', `return (${source})(s)`)(pinia._s.get(name));
  }, [name, typeof read === 'string' ? read : read.toString()]);
}

// No render queued or running.
export async function settled(page) {
  await page.waitForFunction(() => {
    const p = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project');
    return p.image && p.cells.length && !p._renderQueued && !p._rendering;
  });
}

// The page position of a cell's center in the ANSI view (half: 0 top, 1 bottom, or the middle).
export async function cellPoint(page, col, row, half) {
  const box = await page.locator('.ansi-editor .display').boundingBox();
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.ceil(p.rows / 2) }));
  const w = box.width / cols, h = box.height / rows;
  return { x: box.x + (col + 0.5) * w, y: box.y + (row + (half === undefined ? 0.5 : half * 0.5 + 0.25)) * h };
}

// The page position of a grid pixel's center in the PIXEL view.
export async function pixelPoint(page, x, y) {
  const box = await page.locator('.pixel-display').boundingBox();
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: p.rows }));
  return { x: box.x + (x + 0.5) * (box.width / cols), y: box.y + (y + 0.5) * (box.height / rows) };
}

export async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

// A row's characters, cols c0..c1 (a wide character's trail adds nothing).
export const chars = (page, row, c0, c1) => store(page, 'project', `(p) => p.cells.slice(${row} * p.cols + ${c0}, ${row} * p.cols + ${c1} + 1).filter((c) => c.wide !== 'trail').map((c) => c.char).join('')`);

// Edit Mode with the cursor at a cell, its text input focused (it takes focus a moment after the click).
export async function editAt(page, col, row) {
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, col, row);
  await page.mouse.click(at.x, at.y);
  await page.getByRole('textbox', { name: 'Type into the canvas' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.dataset?.textInput !== undefined);
}

// The screen's RGBA bytes over a page rect (the e2e browser runs at deviceScaleFactor 1), decoded
// by the browser.
export async function screenPixels(page, clip) {
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (png) => {
    // Not fetch() of a data: URL, which the page's Content-Security-Policy refuses.
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const ctx = new OffscreenCanvas(image.width, image.height).getContext('2d');
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, image.width, image.height).data);
  }, png);
}

// The screen's [r, g, b] at a page point.
export async function screenPixel(page, x, y) {
  const [r, g, b] = await screenPixels(page, { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 });
  return [r, g, b];
}
