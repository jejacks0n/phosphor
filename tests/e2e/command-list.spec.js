import { test, expect } from './support.js';
import { openApp, editAt, chars } from './support.js';

// The command list's key on the runner: Cmd+K on a Mac, Ctrl+K on Windows and Linux (Chrome's and Firefox's search box
// there), taken from the browser.
const MOD_K = process.platform === 'darwin' ? 'Meta+K' : 'Control+K';
const list = (page) => page.getByRole('dialog', { name: 'Commands' });
const typingFocused = (page) => page.evaluate(() => document.activeElement?.dataset?.textInput !== undefined);

test('Cmd+K (Ctrl+K) opens the list over the browser\'s own; exp ans and Enter opens Export on .ans, exp png on .png', async ({ page }) => {
  await openApp(page);
  const prevented = page.evaluate(() => new Promise((resolve) => {
    addEventListener('keydown', (e) => { if (e.code === 'KeyK') resolve(e.defaultPrevented); }); // after the app's own
  }));
  await page.keyboard.press(MOD_K);
  expect(await prevented).toBe(true);
  await expect(list(page)).toBeVisible();
  await expect(list(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.type('exp ans');
  await page.keyboard.press('Enter');
  await expect(list(page)).toBeHidden();
  const exporting = page.getByRole('dialog', { name: 'Export' });
  await expect(exporting.locator('.format-btn.selected .format-ext')).toHaveText('.ans');
  await page.keyboard.press('Escape');
  await expect(exporting).toBeHidden();

  await page.keyboard.press(MOD_K);
  await page.keyboard.type('exp png');
  await page.keyboard.press('Enter');
  await expect(exporting.locator('.format-btn.selected .format-ext')).toHaveText('.png');
});

test('in Edit Mode, Escape closes the list and hands focus back to the art, where typing goes on', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('a');
  await page.keyboard.press(MOD_K);
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await expect.poll(() => typingFocused(page)).toBe(true);
  await page.keyboard.type('b');
  await expect.poll(() => chars(page, 2, 2, 3)).toBe('ab');
});

test('with a dialog open, Cmd+K (Ctrl+K) opens nothing', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(shortcuts).toBeVisible();
  await page.keyboard.press(MOD_K);
  await expect(list(page)).toBeHidden();
  await expect(shortcuts).toBeVisible();
});

// Rename and Dimensions hand focus on: the list gives it back to the art as it goes, and the row's box or the field must
// still have it after, taking what's typed.
test('from Edit Mode, Layer: Rename puts the picked row\'s name box in focus, and Dimensions the size field', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.press(MOD_K);
  await page.keyboard.type('layer rename');
  await page.keyboard.press('Enter');
  await expect(list(page)).toBeHidden();
  const box = page.getByRole('textbox', { name: /^Rename / });
  await expect(box).toBeFocused();
  await page.keyboard.type('Ink');
  await page.keyboard.press('Enter');
  await expect(page.locator('.layers-list li.picked .name')).toHaveText('Ink');

  await page.keyboard.press(MOD_K);
  await page.keyboard.type('dimensions');
  await page.keyboard.press('Enter');
  await expect(page.locator('#cols')).toBeFocused();
});
