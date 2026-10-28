import { test, expect } from '@playwright/test';
import { openApp, store, editAt, settled } from './support.js';

// With the color adjustments moved, every palette swatch still shows its palette color, and what you
// type with it comes out in that color (it used to be run through the adjustments again and land on
// another palette color, so some palette colors couldn't be painted with at all).
const LIST = ['#ffffff', '#aa5601', '#e03020', '#000000', '#4a4a4a'];

test('Color list with Contrast moved: each swatch shows and types its own color', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Color Palette' }).selectOption('palette');
  await page.getByRole('textbox', { name: 'Palette Colors' }).fill(LIST.join(' '));
  await page.getByRole('textbox', { name: 'Palette Colors' }).press('Enter');
  const contrast = page.getByRole('group', { name: /Adjustments/ }).getByRole('slider').nth(1);
  await contrast.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
  await expect.poll(() => store(page, 'project', (p) => p.contrast)).toBeGreaterThan(200);
  await settled(page);

  await editAt(page, 2, 2);
  for (const [i, hex] of LIST.entries()) {
    await page.keyboard.press('Alt+f');
    const swatch = page.getByRole('dialog', { name: 'Color picker' }).locator('.swatches .swatch').nth(i);
    const [r, g, b] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
    await expect(swatch).toHaveCSS('background-color', `rgb(${r}, ${g}, ${b})`);
    await swatch.click();
    await page.keyboard.press('Escape');
    await page.keyboard.type('a');
    await expect.poll(() => store(page, 'project', `(p) => p.cells[2 * p.cols + ${2 + i}].fg.hex`)).toBe(hex);
  }
});
