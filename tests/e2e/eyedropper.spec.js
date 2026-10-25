import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag, tab, settled, editAt } from './support.js';

const workspace = (page, read) => store(page, 'workspace', read);

test('an eyedropper pick puts the color it replaced and the color it picked in Recent, once', async ({ page }) => {
  await openApp(page);
  // A slot set to None has no color to remember.
  const colors = (w) => ({ fg: w.editFgNone ? null : w.editFgColor, bg: w.editBgNone ? null : w.editBgColor, recent: [...w.recentColors] });
  const before = await workspace(page, colors);
  await page.getByRole('button', { name: 'Color Picker' }).click();
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 30, 20)); // picks all along the way

  const after = await workspace(page, colors);
  expect(after.fg).not.toBe(before.fg);
  // Newest first: each picked color just ahead of the color it replaced (fg, then bg), the same
  // color only once; nothing from along the drag.
  const expected = [];
  const remember = (hex) => {
    if (!hex) return;
    if (expected.includes(hex)) expected.splice(expected.indexOf(hex), 1);
    expected.unshift(hex);
  };
  for (const slot of ['fg', 'bg']) {
    if (after[slot] !== before[slot]) [before[slot], after[slot]].forEach(remember);
  }
  expect(after.recent.slice(0, expected.length)).toEqual(expected);
  expect(after.recent).toEqual([...expected, ...before.recent.filter((c) => !expected.includes(c))].slice(0, 12));

  // Getting the old color back: one click in the color popover's Recent row.
  await page.getByRole('button', { name: 'Foreground color' }).click();
  await page.getByTitle(`Recent: ${before.fg}`).click();
  expect(await workspace(page, (w) => w.editFgColor)).toBe(before.fg);
});

test('PIXEL view: the picker clicked off the canvas leaves the color alone', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await settled(page);
  await page.getByRole('button', { name: 'Color Picker' }).click();
  const box = await page.locator('article canvas').first().boundingBox();
  const y = box.y + box.height * 0.5;
  await page.mouse.click(box.x + box.width * 0.8, y);
  const picked = await workspace(page, (w) => w.editFgColor);
  expect(picked).not.toBe('#000000');
  await page.mouse.click(box.x + box.width + 30, y); // in the padding right of the canvas
  expect(await workspace(page, (w) => w.editFgColor)).toBe(picked);
});

test('ANSI view: an Alt-held pick off the canvas leaves the color alone', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  const box = await page.locator('.ansi-editor .display').boundingBox();
  const inside = await cellPoint(page, 30, 5, 1);
  await page.mouse.move(inside.x, inside.y);
  await page.keyboard.down('Alt');
  await page.mouse.click(inside.x, inside.y);
  const picked = await workspace(page, (w) => w.editFgColor);
  expect(picked).not.toBe('#000000');
  await page.mouse.click(box.x + box.width + 20, inside.y);
  await page.keyboard.up('Alt');
  expect(await workspace(page, (w) => w.editFgColor)).toBe(picked);
});

test('the picker on the right half of a wide character picks the wide character\'s colors', async ({ page }) => {
  await openApp(page);
  await editAt(page, 5, 3);
  await page.keyboard.insertText('漢');
  const wide = await store(page, 'project', (p) => p.underlyingAt(5, 3));
  await page.getByRole('button', { name: 'Color Picker' }).click();
  const elsewhere = await cellPoint(page, 20, 10);
  await page.mouse.click(elsewhere.x, elsewhere.y);
  expect(await workspace(page, (w) => w.editFgColor)).not.toBe(wide.fg);
  const trail = await cellPoint(page, 6, 3);
  await page.mouse.click(trail.x, trail.y);
  expect(await workspace(page, (w) => [w.editFgColor, w.editBgColor])).toEqual([wide.fg, wide.bg]);
});
