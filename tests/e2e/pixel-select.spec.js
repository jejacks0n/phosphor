// The Select tool in the PIXEL view: a rectangle of whole cells (two grid pixels tall each) that
// moves, copies, cuts and pastes as it does in the ANSI view.
import { test, expect } from '@playwright/test';
import { openApp, store, tab, settled, pixelPoint, drag } from './support.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const selection = (page) => store(page, 'workspace', (w) => w.selection);

test('M in the PIXEL view selects whole cells; a drag inside moves them; copy, paste and Escape work', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.keyboard.press('m');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('select');
  await drag(page, await pixelPoint(page, 5, 10), await pixelPoint(page, 9, 15));
  expect(await selection(page)).toEqual({ c0: 5, r0: 5, c1: 9, r1: 7 });
  await expect(page.locator('.pixel-marquee')).toBeVisible();

  const before = await store(page, 'project', (p) => p.rawColorAt(6, 12));
  await drag(page, await pixelPoint(page, 6, 12), await pixelPoint(page, 16, 12));
  expect(await selection(page)).toEqual({ c0: 15, r0: 5, c1: 19, r1: 7 });
  await expect.poll(() => store(page, 'project', (p) => p.rawColorAt(16, 12))).toBe(before);

  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('Escape');
  expect(await selection(page)).toBe(null);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => selection(page)).toMatchObject({ c1: expect.any(Number) });
  const pasted = await selection(page);
  expect([pasted.c1 - pasted.c0, pasted.r1 - pasted.r0]).toEqual([4, 2]);
});
