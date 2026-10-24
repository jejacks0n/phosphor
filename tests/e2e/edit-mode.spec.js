import { test, expect } from '@playwright/test';
import { openApp, store, chars, editAt } from './support.js';

test('typing, Enter, Backspace, a paste and an input-method composition', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('Hix');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter'); // the next row's first column
  await page.keyboard.insertText('漢b'); // what a paste into the text input delivers
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ね', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: 'ねこ', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '猫' });
  await expect.poll(() => chars(page, 3, 0, 4)).toBe('漢b猫');
  expect(await chars(page, 2, 2, 3)).toBe('Hi');
  expect(await store(page, 'project', (p) => p.editCellAt(4, 2)?.char ?? null)).toBe(' '); // the x, backspaced
});

test('the view scrolls to keep the cursor in sight', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  for (let i = 0; i < 37; i++) await page.keyboard.press('Enter');
  expect(await store(page, 'workspace', (w) => w.textCursor.row)).toBe(39);
  const scroller = page.locator('.ansi-editor > article');
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const view = await scroller.boundingBox();
  const cursor = await page.locator('.ansi-editor .text-cursor').boundingBox();
  expect(cursor.y).toBeGreaterThanOrEqual(view.y);
  expect(cursor.y + cursor.height).toBeLessThanOrEqual(view.y + view.height);
});
