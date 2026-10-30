import { test, expect } from './support.js';
import { openApp, editAt, chars } from './support.js';

const list = (page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });
const typingFocused = (page) => page.evaluate(() => document.activeElement?.dataset?.textInput !== undefined);

test('? opens the shortcuts list; Escape and Done close it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  await expect(list(page)).toBeVisible();
  await expect(list(page)).toContainText('Open the color box on the foreground');
  await expect(list(page)).toContainText('Nudge the selection');
  await expect(list(page).locator('dd', { hasText: /^Zoom/ })).toHaveText('Zoom'); // both views zoom
  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await page.keyboard.press('?');
  await list(page).getByRole('button', { name: 'Done' }).click();
  await expect(list(page)).toBeHidden();
});

test('in Edit Mode ? types, and Alt+? opens the list without typing; canceled with Escape, the text input has focus and Space types a space', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('a?');
  await expect(list(page)).toBeHidden();
  await page.keyboard.press('Alt+Shift+Slash');
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.type(' b'); // right away
  await expect.poll(() => chars(page, 2, 2, 5)).toBe('a? b');
  await expect.poll(() => typingFocused(page)).toBe(true);
});

