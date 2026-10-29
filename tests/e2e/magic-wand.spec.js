// The Magic Wand through the real UI: W, a click, the outline over the view; the selection stays for
// the Paint Bucket, which fills only what's selected; Escape or switching views drops it.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, screenPixel } from './support.js';

const MAGENTA = [255, 0, 255];
const wandCount = (page) => store(page, 'workspace', (w) => w.wand && [...w.wand.mask].filter(Boolean).length);

test('W selects every cell with the character clicked; the Bucket then fills only those; Escape deselects', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('w');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('wand');
  await page.getByRole('checkbox', { name: 'Contiguous' }).uncheck();
  await page.getByRole('button', { name: 'FG', exact: true }).click(); // Match: the character only
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  expect(await wandCount(page)).toBeGreaterThan(1);
  await expect(page.locator('[data-wand-overlay]')).toBeVisible();

  await page.keyboard.press('g');
  expect(await wandCount(page)).toBeGreaterThan(1);
  await store(page, 'workspace', (w) => { w.editFgColor = '#ff00ff'; w.editFillTolerance = 100; });
  await page.getByRole('checkbox', { name: 'Contiguous' }).uncheck();
  // A cell in the same row the wand didn't select, to check after the fill.
  const col = await store(page, 'workspace', (w) => [...Array(20).keys()].find((c) => !w.wand.mask[4 * w.wand.width + c]));
  const out = await cellPoint(page, col, 4);
  await page.mouse.click(at.x, at.y);

  await page.keyboard.press('Escape'); // the selection's tint off the screen
  expect(await store(page, 'workspace', (w) => w.wand)).toBe(null);
  await expect.poll(() => screenPixel(page, at.x, at.y)).toEqual(MAGENTA);
  expect(await screenPixel(page, out.x, out.y)).not.toEqual(MAGENTA);
});

test('the wand selection stays when you switch views, and shows in the other one', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('w');
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  const count = await wandCount(page);
  expect(count).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'PIXEL' }).click();
  expect(await wandCount(page)).toBe(count);
  await expect(page.locator('[data-wand-overlay]')).toBeVisible();
  await expect.poll(() => tinted(page)).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'ANSI' }).click();
  expect(await wandCount(page)).toBe(count);
});

test('with a wand selection, the Select tool offers Deselect too', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('w');
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Deselect' }).click();
  expect(await store(page, 'workspace', (w) => w.wand)).toBe(null);
});

// The overlay's pixels tinted (bluish); its dashed outline is black and white.
const tinted = (page) => page.locator('[data-wand-overlay]').evaluate((canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] && data[i + 2] > data[i] + 40) n++;
  return n;
});

test('the selection is tinted only while the Magic Wand is the tool; the outline stays on every tool', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('w');
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => tinted(page)).toBeGreaterThan(0);

  await page.keyboard.press('b');
  await expect.poll(() => tinted(page)).toBe(0);
  await expect(page.locator('[data-wand-overlay]')).toBeVisible();

  await page.keyboard.press('w');
  await expect.poll(() => tinted(page)).toBeGreaterThan(0);
});

test('undo takes back a wand click to the selection before it, and an Escape too', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('w');
  const a = await cellPoint(page, 4, 4), b = await cellPoint(page, 20, 10);
  await page.mouse.click(a.x, a.y);
  const first = await store(page, 'workspace', (w) => [...w.wand.mask].join(''));
  await page.mouse.click(b.x, b.y);
  expect(await store(page, 'workspace', (w) => [...w.wand.mask].join(''))).not.toBe(first);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await store(page, 'workspace', (w) => [...w.wand.mask].join(''))).toBe(first);
  await page.keyboard.press('Escape');
  expect(await store(page, 'workspace', (w) => w.wand)).toBe(null);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await store(page, 'workspace', (w) => [...w.wand.mask].join(''))).toBe(first);
});

test("the wand's Layers choose what Delete takes away: with Base lit, the picture goes black", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('w');
  const base = (col, row) => store(page, 'project', `(p) => [p.baseColorAt(${col}, ${2 * row}), p.baseColorAt(${col}, ${2 * row + 1})]`);
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  const layers = page.getByRole('group', { name: 'Layers' });
  await layers.getByRole('button', { name: 'Base' }).click(); // off: Edit only
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  expect(await base(4, 4)).not.toEqual(['#000000', '#000000']);
  await layers.getByRole('button', { name: 'Base' }).click(); // on again
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  expect(await base(4, 4)).toEqual(['#000000', '#000000']);
});
