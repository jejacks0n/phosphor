import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag } from './support.js';

const workspace = (page, read) => store(page, 'workspace', read);

test('an eyedropper pick puts the colour it replaced and the colour it picked in Recent, once', async ({ page }) => {
  await openApp(page);
  // A slot set to None has no colour to remember.
  const colours = (w) => ({ fg: w.editFgNone ? null : w.editFgColor, bg: w.editBgNone ? null : w.editBgColor, recent: [...w.recentColors] });
  const before = await workspace(page, colours);
  await page.getByRole('button', { name: 'Color Picker' }).click();
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 30, 20)); // picks all along the way

  const after = await workspace(page, colours);
  expect(after.fg).not.toBe(before.fg);
  // Newest first: each picked colour just ahead of the colour it replaced (fg, then bg), the same
  // colour only once; nothing from along the drag.
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

  // Getting the old colour back: one click in the colour popover's Recent row.
  await page.getByRole('button', { name: 'Foreground colour' }).click();
  await page.getByTitle(`Recent: ${before.fg}`).click();
  expect(await workspace(page, (w) => w.editFgColor)).toBe(before.fg);
});
