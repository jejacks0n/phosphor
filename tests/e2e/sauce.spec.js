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

test('a long paste into Comments is kept whole, and the count under it says from which line the file stops', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: /sauce/i }).click();
  const comments = page.locator('#sauce-comments');
  await comments.click();
  const lines = Array.from({ length: 300 }, (_, i) => `${String(i + 1).padStart(3, '0')} greets: the crew, the board, and everyone who kept these files alive`).join('\n');
  await page.evaluate((text) => navigator.clipboard.writeText(text), lines);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(comments).toHaveValue(lines); // not cut by characters
  const own = await store(page, 'project', (p) => p.sauceCommentFit().own); // a converted image: Phosphor's lines come first
  await expect(page.locator('#sauce-comments-count')).toHaveText(new RegExp(`^${600 + own} of 255 SAUCE lines\\. From line \\d+ \\(".+"\\) on, comments won't be in the file\\.$`));
  await expect(page.locator('#sauce-comments-note')).toHaveText('');

  await page.locator('.sauce-editor').getByRole('button', { name: 'Export…' }).click();
  await expect(page.getByRole('dialog')).toContainText('Comments: only the first 255 SAUCE lines fit.');
});
