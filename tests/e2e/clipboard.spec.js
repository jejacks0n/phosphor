import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag, chars, editAt } from './support.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function select(page, c0, r0, c1, r1) {
  await drag(page, await cellPoint(page, c0, r0), await cellPoint(page, c1, r1));
  await expect.poll(() => store(page, 'workspace', (w) => w.selection)).toEqual({ c0, r0, c1, r1 });
}

test('copy and paste a block, then paste text copied elsewhere', async ({ page }) => {
  await openApp(page);
  await editAt(page, 2, 2);
  await page.keyboard.type('Copy me');
  await page.getByRole('button', { name: 'Select', exact: true }).click();

  await select(page, 2, 2, 8, 3);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`Copy me\n${await chars(page, 3, 2, 8)}`);

  await select(page, 20, 10, 21, 11);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => chars(page, 10, 20, 26)).toBe('Copy me');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual({ c0: 20, r0: 10, c1: 26, r1: 11 });

  await page.evaluate(() => navigator.clipboard.writeText('from elsewhere'));
  await select(page, 10, 20, 11, 21);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => chars(page, 20, 10, 23)).toBe('from elsewhere');
});
