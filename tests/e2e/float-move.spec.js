import { test, expect } from './support.js';
import { openApp, cellPoint, drag, editAt, chars } from './support.js';

// A move floats until it's deselected: two drags in a row, and a pasted block's undo and redo, are
// tests/browser/nudge.test.js's and selection-undo.test.js's.
test('the block follows the pointer while it is dragged, and the drag is one undo step', async ({ page }) => {
  await openApp(page);
  await editAt(page, 4, 4);
  await page.keyboard.type('AB');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 4, 4), await cellPoint(page, 5, 4));
  const from = await cellPoint(page, 4, 4), mid = await cellPoint(page, 4, 7), to = await cellPoint(page, 9, 7);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y, { steps: 4 });
  await expect.poll(() => chars(page, 7, 4, 5)).toBe('AB'); // still dragging
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await expect.poll(() => chars(page, 7, 9, 10)).toBe('AB');
  expect(await chars(page, 7, 4, 5)).not.toBe('AB');
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => chars(page, 4, 4, 5)).toBe('AB');
});
