// The Paint Bucket's Fill → Cells through the real UI: Match and Set, and no Feathering.
import { test, expect } from '@playwright/test';
import { openApp, store, editAt, cellPoint, chars } from './support.js';

test('Fill → Cells sets the character of the matching cells it touches', async ({ page }) => {
  await openApp(page);
  await editAt(page, 4, 4);
  await page.keyboard.type('xxoxx');
  await page.keyboard.press('Escape');
  await page.keyboard.press('g');
  await expect(page.getByText('Feathering')).toBeVisible();
  await page.getByRole('button', { name: 'Normal mode' }).click();
  await page.getByRole('button', { name: '▒▓ Cells' }).click();
  await expect(page.getByText('Feathering')).toHaveCount(0);
  // Match the character only (typed text takes its background from the picture); set the character.
  const match = page.getByRole('group', { name: 'Match' }), set = page.getByRole('group', { name: 'Set' });
  await match.getByRole('button', { name: 'FG' }).click();
  await match.getByRole('button', { name: 'BG' }).click();
  await set.getByRole('button', { name: 'Char' }).click();
  await set.getByRole('button', { name: 'FG' }).click();
  await page.getByRole('checkbox', { name: 'Contiguous' }).uncheck();
  await store(page, 'workspace', (w) => { w.activeChar = '#'; });
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => chars(page, 4, 4, 8)).toBe('##o##');
});
