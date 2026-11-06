// The Paint Bucket's gradients through the real UI: a drag on each tab and in each Fill mode, and Shift.
import { test, expect, openApp, store, tab, cellPoint, pixelPoint, drag, chars } from './support.js';

// The bucket, filling the whole picture (Tolerance 100), from red to blue, set to a Gradient.
async function gradientBucket(page, gradient) {
  await page.keyboard.press('g');
  await store(page, 'workspace', (w) => { Object.assign(w, { editFillTolerance: 100, editFgColor: '#ff0000', editBgColor: '#0000ff', editFgNone: false, editBgNone: false }); });
  await page.getByRole('group', { name: 'Gradient' }).getByRole('button', { name: gradient }).click();
}
const paintAt = (page, x, y) => store(page, 'project', `(p) => { const c = p.paintLayer?.pixelAt(${x}, ${y}); return c ? [c.r, c.g, c.b] : null; }`);
const size = (page) => store(page, 'project', (p) => ({ cols: p.cols, rows: p.rows }));

test('PIXEL tab, Linear: a drag fills from FG at the press to BG at the release, as one undo step', async ({ page }) => {
  await openApp(page);
  await tab(page, 'PIXEL').click();
  await gradientBucket(page, 'Linear');
  const { cols } = await size(page);
  await drag(page, await pixelPoint(page, 0, 4), await pixelPoint(page, cols - 1, 4));
  await expect.poll(() => paintAt(page, 0, 10)).toEqual([255, 0, 0]);
  expect(await paintAt(page, cols - 1, 0)).toEqual([0, 0, 255]);
  const [r, , b] = await paintAt(page, Math.floor(cols / 2), 2);
  expect(r).toBeGreaterThan(100);
  expect(b).toBeGreaterThan(100);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => paintAt(page, 0, 10)).toBeNull();
});

test('ANSI tab, Fill: Normal, Spherical: the press is the center, the line shows while dragging; Shift snaps a Linear line to 45°', async ({ page }) => {
  await openApp(page);
  await gradientBucket(page, 'Spherical');
  const from = await cellPoint(page, 10, 10, 0), to = await cellPoint(page, 10, 14, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await expect(page.locator('.shape-drag')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.shape-drag')).toHaveCount(0);
  await expect.poll(() => paintAt(page, 0, 0)).toEqual([0, 0, 255]); // past the radius
  const [r, g, b] = await paintAt(page, 10, 20); // the press, within a fraction of a grid pixel
  expect([r > 240, g, b < 15]).toEqual([true, 0, true]);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => paintAt(page, 0, 0)).toBeNull();

  await gradientBucket(page, 'Linear');
  const start = await cellPoint(page, 2, 4, 0), end = await cellPoint(page, 20, 6, 0); // a little downhill
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.keyboard.down('Shift');
  await expect(page.locator('footer.ansi-status')).toContainText('snap to 45°'); // said while Shift's held
  const held = await store(page, 'workspace', (w) => w.shapeDrag);
  expect(held.to.y).toBe(held.from.y);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const { rows } = await size(page);
  await expect.poll(() => paintAt(page, 11, 0)).not.toBeNull();
  expect(await paintAt(page, 11, rows - 1)).toEqual(await paintAt(page, 11, 0)); // straight across: every row alike
});

test('ANSI tab, Fill: Cells, Linear: blend characters in the two colors', async ({ page }) => {
  await openApp(page);
  await gradientBucket(page, 'Linear');
  await page.getByRole('button', { name: 'Colors only' }).click();
  await page.getByRole('button', { name: '▒▓ Cells' }).click();
  await expect(page.getByRole('group', { name: 'Set', exact: true })).toHaveCount(0); // a gradient sets the character and both colors
  // Match the colors only, within Tolerance 100: every cell.
  await page.getByRole('group', { name: 'Match' }).getByRole('button', { name: 'Char' }).click();
  await drag(page, await cellPoint(page, 2, 5), await cellPoint(page, 22, 5));
  await expect.poll(() => chars(page, 5, 0, 2)).toBe('███');
  const row = await chars(page, 5, 0, 26);
  expect(row.slice(23)).toBe('    ');
  for (const ch of '▓▒░') expect(row).toContain(ch);
  const colors = await store(page, 'project', (p) => [...new Set(p.cells.slice(5 * p.cols, 5 * p.cols + 27).map((c) => `${c.fg.hex} ${c.bg.hex}`))]);
  expect(colors).toEqual(['#ff0000 #0000ff']);
});
