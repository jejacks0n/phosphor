import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag } from './support.js';

const mergeButton = (page) => page.getByRole('button', { name: 'Merge down: the edit layer into the base layer' });
const dialog = (page) => page.getByRole('dialog', { name: 'Merge the edit layer down' });
const hasEdits = (page) => store(page, 'project', (p) => p.hasEdits);

async function drawLine(page, row) {
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  await drag(page, await cellPoint(page, 4, row, 0), await cellPoint(page, 14, row, 0));
}

test('the merge dialog: centred, cancelled three ways, keys kept inside, each choice merges', async ({ page }) => {
  await openApp(page);
  await drawLine(page, 5);

  await mergeButton(page).click();
  const box = await page.locator('.merge-dialog').boundingBox();
  const viewport = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await expect(dialog(page).getByRole('button', { name: /^Exactly/ })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await mergeButton(page).click();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toBeHidden();
  await mergeButton(page).click();
  await page.mouse.click(5, 5); // the backdrop
  await expect(dialog(page)).toBeHidden();
  expect(await hasEdits(page)).toBe(true);

  await mergeButton(page).click();
  const cells = await store(page, 'project', (p) => JSON.stringify(p.cells));
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(dialog(page)).toBeVisible();
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(cells);

  await dialog(page).getByRole('button', { name: /^Exactly/ }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await hasEdits(page)).toBe(false);

  await drawLine(page, 10);
  await mergeButton(page).click();
  await dialog(page).getByRole('button', { name: /^Into the picture/ }).click();
  await expect.poll(() => hasEdits(page)).toBe(false);
});
