// The Select tool's Flip horizontally, Flip vertically and Rotate 90° buttons: a flip turns the
// block in place and its characters with it; Rotate turns pixels, so it's off while the selection
// has characters.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag, editAt, chars } from './support.js';

test('the flip buttons turn the selection and its characters; Rotate waits for a selection without them', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Rotate 90° clockwise' })).toBeDisabled();
});

test('Rotate turns a painted 2 x 1-cell square and it stays 2 x 1', async ({ page }) => {
  await openApp(page);
  await store(page, 'project', (p) => {
    p.paintStroke([{ x: 10, y: 10, alpha: 1 }], '#ff0000');
    p.commitEdit();
  });
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 10, 5), await cellPoint(page, 11, 5));
  await page.getByRole('button', { name: 'Rotate 90° clockwise' }).click();
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 10, r0: 5, c1: 11, r1: 5 });
  expect(await store(page, 'project', (p) => [p.rawColorAt(11, 10), p.rawColorAt(10, 10) === '#ff0000'])).toEqual(['#ff0000', false]);
});
