import { test, expect } from './support.js';
import { openApp, store, cellPoint, tab } from './support.js';
import { addressIs } from './social-support.js';

// The editor's tabs by key on the page: Alt+1 with the art focused shows PIXEL as a click on its tab does, so the
// address follows and Back goes back to ANSI; Alt+3 SAUCE.
test('Alt+1 with the art focused shows PIXEL, a step Back undoes, and Alt+3 shows SAUCE', async ({ page }) => {
  await openApp(page);
  await addressIs(page, '/ansi');
  await store(page, 'workspace', (w) => w.setActiveTool('hand')); // a click on the art that draws nothing
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => document.activeElement?.closest('input, textarea, select, [role=tab]'))).toBe(null);

  await page.keyboard.press('Alt+Digit1');
  await expect(tab(page, 'PIXEL')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('input');
  await addressIs(page, '/pixel');
  await page.goBack();
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await addressIs(page, '/ansi');

  await page.keyboard.press('Alt+Digit3');
  await expect(tab(page, 'SAUCE')).toHaveAttribute('aria-selected', 'true');
  await addressIs(page, '/sauce');
});
