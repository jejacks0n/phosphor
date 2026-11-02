import { test, expect } from './support.js';
import { openApp, store, cellPoint, drag, chars, tab, settled } from './support.js';

const row = (page, r) => store(page, 'project', `(p) => p.cells.slice(${r} * p.cols, ${r} * p.cols + 20).map((c) => c.fg.hex + c.bg.hex)`);

for (const tool of ['Pencil (1px)', 'Brush (soft)']) {
  test(`${tool}: a right-click paints nothing, and strokes change the cells under them`, async ({ page }) => {
    await openApp(page);
    const before = await row(page, 5);
    await page.getByRole('button', { name: tool }).click();
    const at = await cellPoint(page, 4, 4);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    expect(await store(page, 'project', (p) => p.hasEdits)).toBe(false);
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

test('Shift while dragging a shape makes a square, a circle or a 45° line, and the status bar says so', async ({ page }) => {
  await openApp(page);
  await tab(page, 'ANSI').click();
  await settled(page);
  await page.keyboard.press('u');
  const hint = page.locator('footer.ansi-status');
  const dragTo = async (kind, words) => {
    await store(page, 'workspace', `(w) => { w.shapeKind = '${kind}'; w.shapeDrawWith = 'half'; }`);
    await expect(hint).toContainText(words);
    const from = await cellPoint(page, 4, 4), to = await cellPoint(page, 16, 7);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y);
    const without = await store(page, 'workspace', (w) => w.shapeDrag);
    await page.keyboard.down('Shift');
    const held = await store(page, 'workspace', (w) => w.shapeDrag);
    await page.keyboard.up('Shift');
    expect(await store(page, 'workspace', (w) => w.shapeDrag)).toEqual(without);
    await page.keyboard.down('Shift');
    await page.mouse.up();
    await page.keyboard.up('Shift');
    expect(await store(page, 'workspace', (w) => w.shapeDrag)).toBe(null);
    return { without, held };
  };
  for (const [kind, words] of [['rect', 'square'], ['ellipse', 'circle']]) {
    const { without, held } = await dragTo(kind, words);
    expect(without.to.y - without.from.y).toBeLessThan(without.to.x - without.from.x);
    expect(held.to.y - held.from.y).toBe(held.to.x - held.from.x);
  }
  const { held } = await dragTo('line', 'snap to 45°');
  expect(Math.abs(held.to.y - held.from.y)).toBe(Math.abs(held.to.x - held.from.x));   // 12 across and 3 rows (6 pixels) down is 26.6°: the diagonal
});
