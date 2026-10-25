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

// After a dialog or the color box closes, the text input has focus again (so input methods keep
// typing into cells), and Space types instead of picking up the hand.
const typingFocused = (page) => page.evaluate(() => document.activeElement?.dataset?.textInput !== undefined);

test('after the color box closes, the text input has focus and Space types a space', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2); // the pointer stays over the canvas
  await page.keyboard.press('Alt+f');
  const box = page.getByRole('dialog', { name: 'Color picker' });
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
  await page.keyboard.type('a');
  await page.keyboard.down('Space');
  const toolWhileHeld = await store(page, 'workspace', (w) => w.activeTool);
  await page.keyboard.up('Space');
  await page.keyboard.type('b');
  expect(toolWhileHeld).toBe('text');
  await expect.poll(() => chars(page, 2, 2, 4)).toBe('a b');
  await expect.poll(() => typingFocused(page)).toBe(true);
});

for (const [name, open] of [['the save dialog', 'ControlOrMeta+s'], ['the shortcuts list', 'Alt+Shift+Slash']]) {
  test(`after ${name} is canceled with Escape, the text input has focus and Space types a space`, async ({ page }) => {
    await openApp(page);
    await editAt(page, 2, 2);
    await page.keyboard.type('a');
    await page.keyboard.press(open);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.keyboard.type(' b'); // right away
    await expect.poll(() => chars(page, 2, 2, 4)).toBe('a b');
    await expect.poll(() => typingFocused(page)).toBe(true);
  });
}

test('after Tab moves focus off the text input, Space still types (pointer over the canvas)', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.press('Tab');
  await page.keyboard.type('a b');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('text');
  await expect.poll(() => chars(page, 2, 2, 4)).toBe('a b');
});

test('after Tab, Enter and Space (pointer off the canvas) type and press no button', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.mouse.move(2, 2); // off the canvas
  await page.keyboard.press('Tab');
  const others = (w) => JSON.stringify({ ...w.$state, textCursor: null });
  const before = await store(page, 'workspace', others);
  await page.keyboard.type('a b');
  await page.keyboard.press('Enter');
  await page.keyboard.type('c');
  await expect.poll(() => chars(page, 2, 2, 4)).toBe('a b');
  expect(await chars(page, 3, 0, 0)).toBe('c');
  expect(await store(page, 'workspace', others)).toBe(before);
});

test('moving the cursor ends a run of typing: undo takes back only what was typed after', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('ab');
  await page.keyboard.press('ArrowDown'); // to column 4 of the next row
  await page.keyboard.type('cd');
  await expect.poll(() => chars(page, 3, 4, 5)).toBe('cd');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await chars(page, 2, 2, 3)).toBe('ab');
  expect(await store(page, 'project', (p) => p.editCellAt(4, 3) ?? null)).toBe(null);
});
