import { test, expect } from './support.js';
import { openApp, store, cellPoint } from './support.js';

// Draw with: Shade (docs/model.md R16) with real presses: the menu picks it, the options row trades the Brush's paint
// sliders for Darker and Lighter, each click steps a cell one shade on, and Cmd held as you press steps it back.
const char = (page, col, row) => store(page, 'project', `(p) => p.cells[${row} * p.cols + ${col}].char`);

test('Shade from the Brush\'s Draw with: each press steps a cell, and Cmd held steps it back', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Brush' }).click();
  await store(page, 'workspace', (w) => { w.editBrushSize = 1; });
  await page.getByRole('button', { name: 'Colors only' }).click();
  await page.getByRole('button', { name: 'Shade' }).click();
  const row = page.locator('.secondary-row');
  await expect(row.getByRole('button', { name: 'Darker' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Lighter' })).toBeVisible();
  await expect(row.getByText('Opacity')).toHaveCount(0);

  const at = await cellPoint(page, 10, 3);
  const steps = [];
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(at.x, at.y);
    steps.push(await char(page, 10, 3));
  }
  await page.keyboard.down('Meta');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Meta');
  steps.push(await char(page, 10, 3));
  expect(steps).toEqual(['░', '▒', '▓', '▒']);
  expect(await store(page, 'project', (p) => p.editCellAt(10, 3)?.char)).toBe('▒');
});
