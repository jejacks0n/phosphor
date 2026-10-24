import { test, expect } from '@playwright/test';
import { openApp, store, editAt, settled, cellPoint, drag } from './support.js';
import { AnsiFile } from '../../src/lib/AnsiFile.js';

const dialog = (page) => page.getByRole('dialog');
const nameField = (page) => dialog(page).getByRole('textbox', { name: 'File name' });

test('Cmd+S opens it with the name ready to type over; a new name renames the download and the document', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(dialog(page)).toHaveAccessibleName('Save project');
  await expect(nameField(page)).toBeFocused();
  await expect(nameField(page)).toHaveValue('gradient');
  expect(await nameField(page).evaluate((el) => [el.selectionStart, el.selectionEnd])).toEqual([0, 8]);

  await page.keyboard.type('my art.phosphor'); // a typed extension isn't doubled
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toBe('my art.phosphor');
  await expect(dialog(page)).toBeHidden();
  expect(await store(page, 'project', (p) => p.filename)).toBe('my art');

  await page.getByRole('button', { name: 'Export .utf8ans' }).click();
  await expect(nameField(page)).toHaveValue('my art');
});

test('Escape, Cancel and the backdrop close it without saving; an empty name can\'t be saved', async ({ page }) => {
  await openApp(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  const open = () => page.getByRole('button', { name: 'Save Project (.phosphor)' }).click();

  await open();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await open();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
  await open();
  await page.mouse.click(5, 5);
  await expect(dialog(page)).toBeHidden();

  await open();
  await nameField(page).fill('   ');
  await expect(dialog(page).getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  expect(downloads).toBe(0);
  expect(await store(page, 'project', (p) => p.filename)).toBe('gradient');
});

test('keys stay inside it: Cmd+Z in the name field undoes nothing on the canvas', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
  await page.keyboard.press('ControlOrMeta+s');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('Backspace');
  expect(await store(page, 'project', (p) => p.hasEdits)).toBe(true);
  await expect(dialog(page)).toBeVisible();
});

test('.ans: every character that will be replaced is listed, in a list that scrolls', async ({ page }) => {
  await openApp(page);
  await editAt(page, 1, 1);
  await page.keyboard.insertText('一二三四五六七八九十百千万ąćęłńśźż'); // none of them in CP437
  await settled(page);
  const cells = await store(page, 'project', (p) => p.cells);
  const expected = [...AnsiFile.unmappable(cells)].map(([char, { as }]) => `${char}→${as}`);

  await page.getByRole('button', { name: 'Export .ans' }).click();
  const list = dialog(page).getByRole('list', { name: 'Replacements' });
  const shown = (await list.getByRole('listitem').allTextContents()).map((t) => t.replace(/\s+/g, '').replace(/\d+cells?$/, ''));
  expect(shown).toEqual(expected);
  expect(shown.length).toBeGreaterThanOrEqual(21 + 4); // the 21 typed, and the default set's ▁▂▃▅
  await expect(list.getByRole('listitem').filter({ hasText: '一' })).toHaveText(/一\s*→\s*\?\s*1 cell$/);

  const { scrollHeight, clientHeight } = await list.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);
  const box = await dialog(page).boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
});
