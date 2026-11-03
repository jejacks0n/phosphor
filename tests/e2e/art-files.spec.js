// Opening .ans, .utf8ans, .asc and .txt files from the start screen: the file picker and the drop zone.
import { test, expect } from './support.js';
import { imageInput, chars, store, tab, settled } from './support.js';

// Two rows: "Hi" in red, then "there".
const boat = Buffer.from('\x1b[31mHi\x1b[0m\r\nthere', 'latin1');

test('the file picker opens a .ans on the ANSI tab, named for the file', async ({ page }) => {
  await page.goto('/');
  await imageInput(page).setInputFiles({ name: 'boat.ans', mimeType: 'application/octet-stream', buffer: boat });
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  expect(await chars(page, 0, 0, 1)).toBe('Hi');
  expect(await chars(page, 1, 0, 4)).toBe('there');
  expect(await store(page, 'project', (p) => p.filename)).toBe('boat');
});

test('a .txt that is too big says so and stays on the start screen', async ({ page }) => {
  await page.goto('/');
  await imageInput(page).setInputFiles({ name: 'wide.txt', mimeType: 'text/plain', buffer: Buffer.from('x'.repeat(301)) });
  await expect(page.locator('.app-toast')).toHaveText(/301.*at most 300 columns/);
  await expect(imageInput(page)).toBeAttached();
  expect(await store(page, 'project', (p) => !!p.image)).toBe(false);
});

test('dropping a .ans on the start screen opens it', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((bytes) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], 'dropped.ans'));
    document.querySelector('article.drop-zone').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [...boat]);
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  expect(await chars(page, 0, 0, 1)).toBe('Hi');
  expect(await store(page, 'project', (p) => p.filename)).toBe('dropped');
});
