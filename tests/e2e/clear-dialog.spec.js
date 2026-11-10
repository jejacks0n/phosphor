import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag } from './support.js';

const clearButton = (page) => page.getByRole('button', { name: /^Clear/ }).first();
const dialog = (page) => page.getByRole('dialog', { name: /^Clear / });
const hasEdits = (page) => store(page, 'project', (p) => p.hasEdits);

// Clear asks in the app's own dialog, not the browser's: after the browser's, the page can be left without the keys
// until a click, so Cmd+Z right after a clear did nothing.
test('Clear asks in a dialog; Cancel keeps the layer, Clear empties it, and the undo key right after brings it back', async ({ page }) => {
  page.on('dialog', () => { throw new Error('Clear asked with the browser\'s confirm'); });
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil' }).click();
  await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
  expect(await hasEdits(page)).toBe(true);

  await clearButton(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await hasEdits(page)).toBe(true);

  await clearButton(page).click();
  await dialog(page).getByRole('button', { name: /^Clear it/ }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await hasEdits(page)).toBe(false);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => hasEdits(page)).toBe(true);
});
