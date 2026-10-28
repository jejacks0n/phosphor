// A selection made with Select stays as you change tools; Deselect (on every tool's options row) or
// Escape drops it.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag, screenPixel } from './support.js';

const selection = (page) => store(page, 'workspace', (w) => w.selection);

test('a selection made with Select stays with the Brush, and Deselect or Escape drops it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 9, 7));
  await page.keyboard.press('b');
  expect(await selection(page)).toEqual({ c0: 5, r0: 5, c1: 9, r1: 7 });
  await page.getByRole('button', { name: 'Deselect' }).click();
  expect(await selection(page)).toBe(null);

  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 9, 7));
  await page.keyboard.press('b');
  await page.keyboard.press('Escape');
  expect(await selection(page)).toBe(null);
});

test('with a selection, the Bucket fills inside it only', async ({ page }) => {
  await openApp(page);
  await store(page, 'workspace', (w) => { w.editFgColor = '#ff00ff'; w.editFillTolerance = 100; });
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 9, 7));
  await page.keyboard.press('g');
  const inside = await cellPoint(page, 7, 6), outside = await cellPoint(page, 12, 6);
  await page.mouse.click(inside.x, inside.y);
  await expect.poll(() => screenPixel(page, inside.x, inside.y)).toEqual([255, 0, 255]);
  expect(await screenPixel(page, outside.x, outside.y)).not.toEqual([255, 0, 255]);
});
