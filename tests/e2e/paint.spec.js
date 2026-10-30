import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag, chars, tab } from './support.js';

const row = (page, r) => store(page, 'project', `(p) => p.cells.slice(${r} * p.cols, ${r} * p.cols + 20).map((c) => c.fg.hex + c.bg.hex)`);

for (const tool of ['Pencil (1px)', 'Brush (soft)']) {
  test(`${tool} strokes change the cells under them`, async ({ page }) => {
    await openApp(page);
    const before = await row(page, 5);
    await page.getByRole('button', { name: tool }).click();
    await drag(page, await cellPoint(page, 4, 5, 0), await cellPoint(page, 14, 5, 0));
    const after = await row(page, 5);
    const changed = after.map((v, i) => v !== before[i]);
    expect(changed.slice(5, 14).every(Boolean)).toBe(true);
    expect(changed.slice(17).some(Boolean)).toBe(false);
    expect(await store(page, 'project', (p) => p.hasEdits)).toBe(true);
  });
}

test('each pointer move of a stroke paints once', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  await page.evaluate(() => {
    const p = document.querySelector('#phosphor').__vue_app__.config.globalProperties.$pinia._s.get('project');
    const paintStroke = p.paintStroke;
    window.strokes = 0;
    p.paintStroke = (...args) => { window.strokes++; return paintStroke(...args); };
  });
  const a = await cellPoint(page, 2, 2), b = await cellPoint(page, 12, 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.strokes)).toBe(11); // the press, then the 10 moves
});

test('a right-click paints nothing', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  const at = await cellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false);
});

test('DOM view: a Pencil click paints the cell under the pointer, at the far right too', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'DOM', exact: true }).click();
  await expect(page.locator('.ansi-editor pre.display')).toBeVisible();
  await page.getByRole('button', { name: 'Pencil (1px)' }).click();
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: Math.floor(p.rows / 2) }));
  const display = page.locator('.ansi-editor .display');
  const box = await display.boundingBox();
  const inner = await display.evaluate((el) => ({ l: el.clientLeft, t: el.clientTop, w: el.clientWidth, h: el.clientHeight }));
  const col = cols - 2, row = 3;
  await page.mouse.click(box.x + inner.l + (col + 0.5) * inner.w / cols, box.y + inner.t + (row + 0.75) * inner.h / rows);
  const painted = await store(page, 'project', `(p) => [${col - 1}, ${col}, ${col + 1}].map((c) => p.cellHasPaint(c, ${row}))`);
  expect(painted).toEqual([false, true, false]);
});

test("Half-block: the Pencil's and Brush's Draw with offer it in the ANSI view, and a cell painted with it becomes a ▄", async ({ page }) => {
  await openApp(page);
  for (const tool of ['Brush (soft)', 'Pencil (1px)']) {
    await page.getByRole('button', { name: tool }).click();
    await page.getByRole('button', { name: 'Normal mode' }).click(); // the default
    await page.getByRole('button', { name: 'Half-block' }).click();
  }
  const at = await cellPoint(page, 7, 4, 0);
  await page.mouse.click(at.x, at.y);
  expect(await chars(page, 4, 7, 7)).toBe('▄');
  await page.getByRole('button', { name: 'Brush (soft)' }).click();
  await expect(page.getByRole('button', { name: 'Half-block' })).toBeVisible(); // its own setting, kept
  await tab(page, 'PIXEL').click();
  await expect(page.getByRole('button', { name: 'Half-block' })).toHaveCount(0); // the Pixel view has no characters
});
