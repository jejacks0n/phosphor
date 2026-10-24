import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag } from './support.js';

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
