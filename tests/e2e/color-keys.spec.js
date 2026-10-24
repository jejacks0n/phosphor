import { test, expect } from '@playwright/test';
import { openApp, store, editAt, chars } from './support.js';

// Moebius-style color keys: Alt+F / Alt+A open the color box on the foreground, Alt+B on the
// background, Shift+Cmd/Ctrl+X swaps the two.
const box = (page) => page.getByRole('dialog', { name: 'Color picker' });
const ws = (page, read) => store(page, 'workspace', read);

test('Alt+F, Alt+A and Alt+B open the color box on the right slot; Escape closes it', async ({ page }) => {
  await openApp(page);
  for (const [key, slot] of [['Alt+f', 'fg'], ['Alt+a', 'fg'], ['Alt+b', 'bg']]) {
    await page.keyboard.press(key);
    await expect(box(page)).toBeVisible();
    expect(await ws(page, (w) => w.colorBox)).toBe(slot);
    await page.keyboard.press('Escape');
    await expect(box(page)).toBeHidden();
  }
  await page.keyboard.press('Alt+f');
  await page.keyboard.press('Alt+b'); // switches the open box to the background
  expect(await ws(page, (w) => w.colorBox)).toBe('bg');
});

test('from a drawing tool the held eyedropper gives way to the box, and the tool stays', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  await page.keyboard.down('Alt');
  expect(await ws(page, (w) => w.activeTool)).toBe('picker');
  await page.keyboard.press('f');
  await page.keyboard.up('Alt');
  await expect(box(page)).toBeVisible();
  expect(await ws(page, (w) => w.activeTool)).toBe('pencil');
});

test('in Edit Mode they work while typing, type nothing, and typing carries on after', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('a');
  await page.keyboard.press('Alt+f');
  await expect(box(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.type('b');
  await expect.poll(() => chars(page, 2, 2, 3)).toBe('ab');
});

test('Shift+Cmd/Ctrl+X swaps the foreground and background', async ({ page }) => {
  await openApp(page);
  const before = await ws(page, (w) => [w.editFgColor, w.editBgColor]);
  await page.keyboard.press('ControlOrMeta+Shift+x');
  expect(await ws(page, (w) => [w.editFgColor, w.editBgColor])).toEqual([before[1], before[0]]);
});

test('in a text field Alt+F is left to the field', async ({ page }) => {
  await openApp(page);
  await page.getByRole('textbox', { name: 'Character Seed' }).focus();
  await page.keyboard.press('Alt+f');
  await expect(box(page)).toBeHidden();
});

test('in the color box the arrow keys move between swatches, Space picks, Enter picks and closes, and nothing else moves', async ({ page }) => {
  await openApp(page);
  await page.getByRole('combobox', { name: 'Color Palette' }).selectOption('cga');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  const selection = await ws(page, (w) => w.selection);
  await page.keyboard.press('Alt+f');
  const focused = () => page.evaluate(() => document.activeElement.title);
  const fg = await ws(page, (w) => w.editFgColor);
  expect(await focused()).toBe(fg); // starts on the current color (white: the grid's last swatch)
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toBe(fg); // the row's end: stays
  await page.keyboard.press('ArrowLeft');
  expect(await focused()).not.toBe(fg);
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toBe(fg);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  const picked = await focused();
  expect(picked).toMatch(/^#[0-9a-f]{6}$/i);
  expect(picked).not.toBe(fg);
  await page.keyboard.press('Space'); // picks, and the box stays open
  expect(await ws(page, (w) => w.editFgColor)).toBe(picked);
  await expect(box(page)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  const entered = await focused();
  await page.keyboard.press('Enter'); // picks and closes
  await expect(box(page)).toBeHidden();
  expect(await ws(page, (w) => w.editFgColor)).toBe(entered);
  expect(await ws(page, (w) => w.selection)).toEqual(selection); // the arrows didn't nudge it
});

test('the color tooltips show their shortcuts', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('button', { name: 'Foreground color' })).toHaveAttribute('title', /\((⌥F|Alt\+F)\)$/);
  await expect(page.getByRole('button', { name: 'Background color' })).toHaveAttribute('title', /\((⌥B|Alt\+B)\)$/);
  await page.keyboard.press('Alt+f');
  await expect(box(page).getByRole('button', { name: 'Swap' })).toHaveAttribute('title', /\(X or (⇧⌘X|Shift\+Ctrl\+X)\)$/);
});
