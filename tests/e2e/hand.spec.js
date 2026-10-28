// The Hand: the picture follows the pointer. Each step of a drag is measured from where the drag
// began, so the browser rounding the scroll position (to whole or half pixels) never adds up: a
// trackpad's many tiny sideways moves on a straight up-and-down drag used to walk the picture across.
import { test, expect } from '@playwright/test';
import { openApp, tab, settled } from './support.js';

test('PIXEL view: the picture follows the pointer through many fractional steps', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.keyboard.press('h');
  const view = () => page.evaluate(() => { const v = document.querySelector('article .display').closest('article'); return { x: v.scrollLeft, y: v.scrollTop }; });
  const box = await page.locator('article .display').first().boundingBox();
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
  const before = await view();
  await page.mouse.move(x, y);
  await page.mouse.down();
  // 40 steps of 0.3 px across while going down: 12 px right, 40 px down.
  for (let s = 1; s <= 40; s++) await page.mouse.move(x + 0.3 * s, y + s);
  const after = await view();
  await page.mouse.up();
  expect(Math.abs(after.x - (before.x - 12))).toBeLessThanOrEqual(1);
  expect(after.y).toBe(before.y - 40);
});
