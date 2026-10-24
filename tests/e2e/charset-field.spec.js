import { test, expect } from '@playwright/test';
import { openApp, store, settled } from './support.js';

// The Characters field: type your own, or pick a ready-made set from the ▾, a native select (the
// system's own menu, like the other menus) laid invisibly over it.
const field = (page) => page.getByRole('textbox', { name: 'Characters' });
const sets = (page) => page.getByRole('combobox', { name: 'Character sets' });
const label = (page) => page.locator('div.field:has(#chars) > div.label-row span.value');
const charsInCells = (page) => store(page, 'project', (p) => [...new Set(p.cells.map((c) => c.char))].sort().join(''));

test('the Characters field: pick a ready-made set, or type your own', async ({ page }) => {
  await openApp(page);
  await expect(label(page)).toHaveText('Default');
  await expect(sets(page).locator('option:checked')).toHaveText(/^Default/);

  // A click on the ▾ lands on the select.
  const chevron = await page.locator('.charset-field svg.chevron').boundingBox();
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [chevron.x + chevron.width / 2, chevron.y + chevron.height / 2])).toBe('SELECT');

  await sets(page).selectOption({ label: 'Shades · ░▒▓█' });
  await expect(field(page)).toHaveValue('░▒▓█');
  await expect(label(page)).toHaveText('Shades');
  await settled(page);
  expect(await charsInCells(page)).toBe([...'░▒▓█'].sort().join(''));

  await field(page).fill('#@');
  await field(page).press('Enter');
  await expect(label(page)).toHaveText('Custom');
  await expect(sets(page).locator('option:checked')).toHaveText('Custom');
  await settled(page);
  expect(await charsInCells(page)).toBe('#@');

  await sets(page).selectOption({ label: 'Pixel · ▄' });
  await expect(field(page)).toHaveValue('▄');
  await expect(sets(page).locator('option', { hasText: 'Custom' })).toHaveCount(0);
});

test('the ASCII styles have their own sets', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Art Style' }).selectOption('ascii');
  await expect(sets(page).locator('option')).toHaveText([/^Default/, /^Classic ramp/, /^Long ramp/]);
  await sets(page).selectOption({ label: 'Classic ramp · .:-=+*#%@' });
  expect(await store(page, 'project', (p) => p.charsAscii)).toBe(' .:-=+*#%@');
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a tap on the ▾ lands on the select', async ({ page }) => {
    await openApp(page);
    await page.getByTitle('Toggle Settings').click();
    await expect(sets(page)).toBeVisible();
    await page.waitForFunction(() => { // the settings drawer has finished sliding in
      const b = document.querySelector('.charset-field svg.chevron').getBoundingClientRect();
      return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.tagName === 'SELECT';
    });
    await sets(page).selectOption({ label: 'Pixel · ▄' });
    await expect(field(page)).toHaveValue('▄');
  });
});
