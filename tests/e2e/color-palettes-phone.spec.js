import { test, expect, openApp, store } from './support.js';

// The settings drawer's Palettes link on a phone, where only the whole page can go wrong: the drawer shuts, and the color
// layer's Palettes page takes the whole window, with the keyboard in it, until its close button closes it.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('on a phone, Palettes in the settings drawer shuts it and opens the color layer over the whole window, focus in it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Toggle settings' }).tap();
  await page.getByRole('button', { name: 'Manage color palettes' }).tap();

  const layer = page.locator('.color-layer');
  await expect(layer).toBeVisible();
  await expect.poll(() => store(page, 'workspace', (w) => w.settingsOpen)).toBe(false);
  await expect.poll(() => layer.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(layer.getByRole('tab', { name: 'Palettes' })).toHaveAttribute('aria-selected', 'true');
  expect(await layer.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await layer.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(layer).toHaveCount(0);
  expect(await store(page, 'workspace', (w) => w.colorBox)).toBe(null);
});
