import { test, expect } from './support.js';
import { openApp, store, settled } from './support.js';

const contrast = (page) => page.getByRole('group', { name: /Adjustments/ }).getByRole('slider').nth(1);
const value = (page) => store(page, 'project', (p) => p.contrast);

test('dragging a slider is one undo step; keyboard nudges a moment apart are one more', async ({ page }) => {
  await openApp(page);
  const cells = await store(page, 'project', (p) => JSON.stringify(p.cells));
  await contrast(page).scrollIntoViewIfNeeded();
  const box = await contrast(page).boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  for (const f of [0.25, 0.3, 0.35, 0.4]) await page.mouse.move(box.x + box.width * f, box.y + box.height / 2, { steps: 3 });
  await page.mouse.up();
  const dragged = await value(page);
  expect(dragged).toBeGreaterThan(100);

  await contrast(page).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => value(page)).toBe(dragged + 5);

  await page.getByRole('button', { name: /^Undo \(/ }).click();
  expect(await value(page)).toBe(dragged);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await value(page)).toBe(100);
  await settled(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(cells);
  await expect(page.getByRole('button', { name: /^Undo \(/ })).toBeDisabled();

  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await value(page)).toBe(dragged);
  await page.getByRole('group', { name: /Adjustments/ }).getByRole('button', { name: 'RESET' }).click();
  expect(await value(page)).toBe(100);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await value(page)).toBe(dragged);
});
