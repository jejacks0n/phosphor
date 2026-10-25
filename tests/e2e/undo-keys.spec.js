// Undo and redo from the keyboard: Shift makes the key 'Z', which redo must still see.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag } from './support.js';

for (const keys of ['Control+Shift+KeyZ', 'Meta+Shift+KeyZ']) {
  test(`${keys} redoes what was undone`, async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Pencil (1px)' }).click();
    await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
    await page.keyboard.press('ControlOrMeta+z');
    expect(await store(page, 'project', (p) => p.canRedo)).toBe(true);
    await page.keyboard.press(keys);
    expect(await store(page, 'project', (p) => p.canRedo)).toBe(false);
  });
}
