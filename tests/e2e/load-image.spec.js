import { test, expect } from '@playwright/test';
import { openApp, store } from './support.js';

test('an image loaded with the file input shows as cells in the ANSI tab', async ({ page }) => {
  await openApp(page);
  const { cols, count, filename } = await store(page, 'project', (p) => ({ cols: p.cols, count: p.cells.length, filename: p.filename }));
  expect(cols).toBe(80);
  expect(count).toBe(80 * 40);
  expect(filename).toBe('gradient');
  await expect(page.locator('.ansi-editor .display canvas')).toBeVisible();
});
