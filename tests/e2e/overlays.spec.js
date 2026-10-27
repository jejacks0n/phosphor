// The ANSI view's overlays sit on the cells they mark, inside the display's border: the cell
// highlight, the text cursor, the selection and the Shapes outline.
import { test, expect } from '@playwright/test';
import { openApp, store, cellPoint, drag, chars } from './support.js';

// A cell's top-left on the page, measured from inside the display's border.
async function cellCorner(page, col, row) {
  const display = page.locator('.ansi-editor .display');
  const box = await display.boundingBox();
  const inner = await display.evaluate((el) => ({ left: el.clientLeft, top: el.clientTop, width: el.clientWidth, height: el.clientHeight }));
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.floor(p.rows / 2) }));
  return { x: box.x + inner.left + col * (inner.width / cols), y: box.y + inner.top + row * (inner.height / rows) };
}

async function expectAt(page, selector, col, row) {
  const box = await page.locator(`.ansi-editor ${selector}`).boundingBox();
  const corner = await cellCorner(page, col, row);
  expect(Math.abs(box.x - corner.x)).toBeLessThan(0.5);
  expect(Math.abs(box.y - corner.y)).toBeLessThan(0.5);
}

test('the cell highlight and the text cursor sit on their cell', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Edit Mode' }).click();
  const at = await cellPoint(page, 5, 5);
  await page.mouse.move(at.x, at.y);
  await expectAt(page, '.tool-preview', 5, 5);
  await page.mouse.click(at.x, at.y);
  await expectAt(page, '.text-cursor', 5, 5);
});

test('the selection and the Shapes outline sit on their cells', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await drag(page, await cellPoint(page, 3, 3), await cellPoint(page, 8, 6));
  await expectAt(page, '.marquee', 3, 3);

  await page.getByRole('button', { name: 'Shapes' }).click();
  const from = await cellPoint(page, 10, 4), to = await cellPoint(page, 16, 8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await expectAt(page, '.shape-drag', 10, 4);
  await page.mouse.up();
});

test('a Line drag shows a line from its first cell, snapped across for box lines, and draws it on release', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Shapes' }).click();
  await page.getByRole('button', { name: 'Line', exact: true }).click();
  const from = await cellPoint(page, 5, 10), to = await cellPoint(page, 20, 12);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  const line = await page.locator('.ansi-editor .shape-drag').boundingBox();
  const [corner, next] = [await cellCorner(page, 5, 10), await cellCorner(page, 6, 11)];
  expect(Math.abs(line.x - (corner.x + next.x) / 2)).toBeLessThan(0.5); // starts at the first cell's center
  expect(Math.abs(line.y - (corner.y + next.y) / 2)).toBeLessThan(0.5);
  expect(line.height).toBeLessThan(2);                 // across: closer to across than down (Double box line)
  expect(line.width).toBeGreaterThan(to.x - from.x - 2);
  await page.mouse.up();
  await expect(page.locator('.ansi-editor .shape-drag')).toHaveCount(0);
  expect(await chars(page, 10, 5, 20)).toBe('═'.repeat(16));
});
