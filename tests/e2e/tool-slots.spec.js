// A toolbar slot of several tools, with real pointer events: a long press opens it without choosing the tool shown, a
// right-click opens it without the browser's menu, and a plain click chooses the tool shown.
import { test, expect, openApp, store } from './support.js';

const tool = (page) => store(page, 'workspace', (w) => w.activeTool);

test('a long press or a right-click opens a slot; a click chooses its tool', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('p');
  const bucket = page.getByRole('button', { name: 'Paint Bucket', exact: true });
  const box = await bucket.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole('button', { name: /^Gradient/ })).toBeVisible();
  await page.mouse.up();
  expect(await tool(page)).toBe('pencil'); // the long press only opened it
  await page.getByRole('button', { name: /^Gradient/ }).click();
  expect(await tool(page)).toBe('gradient');
  await expect(page.getByRole('button', { name: 'Gradient', exact: true })).toHaveClass(/active/); // the slot shows it now

  await page.getByRole('button', { name: 'Select', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('button', { name: /^Magic Wand/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  expect(await tool(page)).toBe('select');
});
