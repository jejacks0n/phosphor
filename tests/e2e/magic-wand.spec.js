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

test('switching views drops the wand selection', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('w');
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  expect(await wandCount(page)).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'PIXEL' }).click();
  expect(await store(page, 'workspace', (w) => w.wand)).toBe(null);
});
