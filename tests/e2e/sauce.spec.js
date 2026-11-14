// The SAUCE tab with real keys and a real paste: what doesn't fit a field is named under it, never dropped silently.
import { test, expect, openApp, store } from './support.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('a pasted title keeps the 35 characters the record holds, an emoji as one, and says what it left out', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: /sauce/i }).click();
  const title = page.getByLabel('Title', { exact: true });
  await title.click();
  await page.evaluate(() => navigator.clipboard.writeText('Café € 🎨 Restaurée par Walt, été 1996 xyz'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect(title).toHaveValue('Café € 🎨 Restaurée par Walt, été 19');
  await expect(page.locator('#sauce-title-count')).toHaveText('35 / 35');
  await expect(page.locator('#sauce-title-note')).toHaveText('Only 35 characters fit. Left out: "96 xyz"');
  await page.keyboard.press('Backspace'); // the next change clears it
  await expect(page.locator('#sauce-title-note')).toHaveText('');
  await page.keyboard.type('XY');
  await expect(title).toHaveValue('Café € 🎨 Restaurée par Walt, été 1X');
  await expect(page.locator('#sauce-title-note')).toHaveText('Only 35 characters fit. Left out: "Y"');
  await expect(title).toBeFocused();
  expect(await store(page, 'project', (p) => p.sauceTitle)).toBe('Café € 🎨 Restaurée par Walt, été 1X');
});
