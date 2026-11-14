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

test('on a phone the settings drawer is out of the Tab order while closed: Choose a file is a few presses away, and the drawer is reachable once opened', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const choose = page.locator('button.browse'), panel = page.locator('aside.control-panel');
  await expect(choose).toBeVisible();
  const inPanel = () => panel.evaluate((el) => el.contains(document.activeElement));
  let presses = 0;
  while (presses < 80 && !(await choose.evaluate((el) => el === document.activeElement))) {
    await page.keyboard.press('Tab');
    presses++;
    expect(await inPanel()).toBe(false);
  }
  await expect(choose).toBeFocused();
  expect(presses).toBeLessThanOrEqual(6);

  const menu = page.getByRole('button', { name: 'Toggle settings' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab'); // the drawer comes before the workspace
  expect(await inPanel()).toBe(true);
});
