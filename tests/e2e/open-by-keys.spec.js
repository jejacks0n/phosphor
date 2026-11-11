// The file chooser by keys: Tab and Enter on the start screen, Cmd/Ctrl+O anywhere.
import { test, expect } from './support.js';
import { openApp } from './support.js';

test('Tab reaches Choose a file on the start screen, and Enter opens the chooser', async ({ page }) => {
  await page.goto('/');
  const choose = page.locator('button.browse');
  await expect(choose).toBeVisible();
  for (let i = 0; i < 80 && !(await choose.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(choose).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await chooser;
});

test('Cmd/Ctrl+O opens the file chooser from the editor', async ({ page }) => {
  await openApp(page);
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+o');
  await chooser;
});
