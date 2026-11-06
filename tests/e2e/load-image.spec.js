import { test, expect } from './support.js';
import { openApp, store } from './support.js';

test('an image loaded with the file input shows as cells in the ANSI tab; the page is titled Phosphor — Modern ANSI & ASCII Art Editor, and so are its link previews', async ({ page }) => {
  await openApp(page);
  const { cols, count, filename } = await store(page, 'project', (p) => ({ cols: p.cols, count: p.cells.length, filename: p.filename }));
  expect(cols).toBe(80);
  expect(count).toBe(80 * 40);
  expect(filename).toBe('gradient');
  await expect(page.locator('.ansi-editor .display canvas')).toBeVisible();

  await expect(page).toHaveTitle('Phosphor — Modern ANSI & ASCII Art Editor');
  for (const meta of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    await expect(page.locator(meta)).toHaveAttribute('content', 'Phosphor — Modern ANSI & ASCII Art Editor');
  }
});
