// Art layers: making one from a selection and dragging it on VECTOR.
import { test, expect, openApp, store, tab, settled, cellPoint, drag, chars } from './support.js';

test('Make art layer turns a selection into a layer that VECTOR drags by whole cells', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await page.mouse.click((await cellPoint(page, 5, 5)).x, (await cellPoint(page, 5, 5)).y);
  await page.getByRole('textbox', { name: 'Type into the canvas' }).waitFor();
  await page.keyboard.type('HI');
  await expect.poll(() => chars(page, 5, 5, 6)).toBe('HI');
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  await page.keyboard.press('m');
  await drag(page, await cellPoint(page, 4, 4), await cellPoint(page, 8, 6));
  await page.getByText('Make art layer', { exact: true }).click();
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await settled(page);
  expect(await store(page, 'workspace', (w) => w.vectorSelected.length)).toBe(1);
  expect(await chars(page, 5, 5, 6)).toBe('HI');

  await page.keyboard.press('v');
  await drag(page, await cellPoint(page, 5, 5), await cellPoint(page, 8, 5));
  await settled(page);
  expect(await chars(page, 5, 8, 9)).toBe('HI');
  expect(await chars(page, 5, 5, 6)).not.toBe('HI');
  expect(await chars(page, 5, 5, 7)).not.toContain('H');
});
