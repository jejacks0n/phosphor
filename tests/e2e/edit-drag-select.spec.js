import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag } from './support.js';

test('a drag in Edit Mode becomes a Select selection', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 8, 6));
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('select');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 3, r0: 3, c1: 8, r1: 6 });
});
