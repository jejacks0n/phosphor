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
