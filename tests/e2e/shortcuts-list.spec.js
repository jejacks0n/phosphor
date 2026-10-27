import { test, expect } from './support.js';
import { openApp, editAt, chars } from './support.js';

const list = (page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });

test('? opens the shortcuts list; Escape and Done close it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  await expect(list(page)).toBeVisible();
  await expect(list(page)).toContainText('Open the color box on the foreground');
  await expect(list(page)).toContainText('Nudge the selection');
  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await page.keyboard.press('?');
  await list(page).getByRole('button', { name: 'Done' }).click();
  await expect(list(page)).toBeHidden();
});

test('in Edit Mode ? types, and Alt+? opens the list without typing', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('a?');
  await expect(list(page)).toBeHidden();
  await page.keyboard.press('Alt+Shift+Slash');
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.type('b');
  await expect.poll(() => chars(page, 2, 2, 4)).toBe('a?b');
});

test('in a text field ? types', async ({ page }) => {
  await openApp(page);
  const seed = page.getByRole('textbox', { name: 'Character Seed' });
  await seed.fill('');
  await seed.press('?');
  await expect(seed).toHaveValue('?');
  await expect(list(page)).toBeHidden();
});
