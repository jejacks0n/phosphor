// The Select tool's Flip horizontally, Flip vertically and Rotate 90° buttons: the block turns in
// place and its characters turn with it.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag, editAt, chars } from './support.js';

test('the flip and rotate buttons turn the selection and its characters', async ({ page }) => {
  await openApp(page);
  await editAt(page, 5, 5);
  await page.keyboard.type('┌▀→');
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 7, 5));
  await page.getByRole('button', { name: 'Flip horizontally' }).click();
  await expect.poll(() => chars(page, 5, 5, 7)).toBe('←▀┐');
  await page.getByRole('button', { name: 'Flip vertically' }).click();
  await expect.poll(() => chars(page, 5, 5, 7)).toBe('←▄┘');
  await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 5, r0: 5, c1: 5, r1: 7 });
  await expect.poll(async () => [await chars(page, 5, 5, 5), await chars(page, 6, 5, 5), await chars(page, 7, 5, 5)].join('')).toBe('↑▌└');
});
