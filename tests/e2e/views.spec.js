import { test, expect } from '@playwright/test';
import { openApp, store, editAt } from './support.js';

test('Canvas and DOM views: the DOM view\'s text is the cells\' characters', async ({ page }) => {
  await openApp(page);
  await editAt(page, 1, 1);
  await page.keyboard.insertText('漢字 ok');
  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'DOM', exact: true })).toBeVisible();
  await expect(page.locator('.ansi-editor pre.display')).toBeVisible();
  await expect(page.locator('.ansi-editor canvas.display')).toHaveCount(0);

  const expected = await store(page, 'project', (p) => Array.from({ length: Math.ceil(p.rows / 2) }, (_, r) => p.cells.slice(r * p.cols, (r + 1) * p.cols).filter((c) => c.wide !== 'trail').map((c) => c.char).join('')));
  await expect.poll(() => page.locator('.ansi-editor pre.display > span').allTextContents()).toEqual(expected);
  expect(expected[1].slice(1, 6)).toBe('漢字 ok'); // col 0 is the picture's

  await page.getByRole('button', { name: 'DOM', exact: true }).click();
  await expect(page.locator('.ansi-editor canvas.display')).toBeVisible();
});
