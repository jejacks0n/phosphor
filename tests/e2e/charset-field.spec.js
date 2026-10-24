import { test, expect } from '@playwright/test';
import { openApp, store, settled } from './support.js';

const field = (page) => page.getByRole('combobox', { name: 'Characters' });
const list = (page) => page.getByRole('listbox', { name: 'Character sets' });
const label = (page) => page.locator('div.field:has(#chars) > div.label-row span.value');
const charsInCells = (page) => store(page, 'project', (p) => [...new Set(p.cells.map((c) => c.char))].sort().join(''));

test('the Characters field: pick a ready-made set, or type your own', async ({ page }) => {
  await openApp(page);
  await expect(label(page)).toHaveText('Default');

  await page.getByRole('button', { name: 'Character sets' }).click();
  await expect(list(page)).toBeVisible();
  await expect(list(page).getByRole('option', { name: /^Default/ })).toHaveAttribute('aria-selected', 'true');
  await list(page).getByRole('option', { name: /^Shades/ }).click();
  await expect(list(page)).toBeHidden();
  await expect(field(page)).toHaveValue('░▒▓█');
  await expect(label(page)).toHaveText('Shades');
  await settled(page);
  expect(await charsInCells(page)).toBe([...'░▒▓█'].sort().join(''));

  await field(page).fill('#@');
  await field(page).press('Enter');
  await expect(label(page)).toHaveText('Custom');
  await settled(page);
  expect(await charsInCells(page)).toBe('#@');

  // Keyboard: ↓ opens on the current set (none: Custom, so the first), ↓ moves, Enter picks.
  await field(page).press('ArrowDown');
  await expect(list(page)).toBeVisible();
  await field(page).press('ArrowDown');
  await field(page).press('ArrowDown');
  await field(page).press('Enter');
  await expect(label(page)).toHaveText('Rising blocks');
  // Escape closes the list and changes nothing.
  await field(page).press('ArrowDown');
  await field(page).press('Escape');
  await expect(list(page)).toBeHidden();
  await expect(label(page)).toHaveText('Rising blocks');
});

test('the ASCII styles have their own sets', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Art Style' }).selectOption('ascii');
  await page.getByRole('button', { name: 'Character sets' }).click();
  await expect(list(page).getByRole('option')).toHaveText([/^Default/, /^Classic ramp/, /^Long ramp/]);
  await list(page).getByRole('option', { name: /^Classic ramp/ }).click();
  expect(await store(page, 'project', (p) => p.charsAscii)).toBe(' .:-=+*#%@');
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('the ▾ is a native select (the system picker), and the field still types', async ({ page }) => {
    await openApp(page);
    await page.getByTitle('Toggle Settings').click();
    const native = page.getByRole('combobox', { name: 'Character sets' });
    await expect(native).toHaveJSProperty('tagName', 'SELECT');
    await expect(native.locator('option:checked')).toHaveText(/^Default/);

    await native.selectOption({ label: 'Pixel  ▄' });
    await expect(field(page)).toHaveValue('▄');
    await expect(label(page)).toHaveText('Pixel');
    await expect(list(page)).toHaveCount(0); // no custom list

    await field(page).fill('#@');
    await field(page).press('Enter');
    await expect(label(page)).toHaveText('Custom');
    await expect(native.locator('option:checked')).toHaveText('Custom');
  });
});
