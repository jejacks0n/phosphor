// The VECTOR tab: the ANSI art with the shapes' outlines over it, and the tools that draw and change them.
import { test, expect, openApp, store, tab, settled } from './support.js';

// The page position of grid pixel (x, y) (fractional) in the ANSI and VECTOR views.
async function gridPoint(page, x, y) {
  const box = await page.locator('.ansi-editor .display').boundingBox();
  const { cols, rows } = await store(page, 'project', (p) => ({ cols: p.cols, rows: p.rows }));
  return { x: box.x + x * (box.width / cols), y: box.y + y * (box.height / rows) };
}

// A rectangle from (x0, y0) to (x1, y1), in grid pixels, added through the store; its key.
const addRect = (page, x0, y0, x1, y1) => store(page, 'project', `(p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0],
  points: [[${x0}, ${y0}, 0, 0, 0, 0, 0], [${x1}, ${y0}, 0, 0, 0, 0, 0], [${x1}, ${y1}, 0, 0, 0, 0, 0], [${x0}, ${y1}, 0, 0, 0, 0, 0]] })`);
const matrix = (page, key) => store(page, 'project', `(p) => p.shapes.get('${key}').m`);
const selected = (page) => store(page, 'workspace', (w) => w.vectorSelected);
const cells = (page) => store(page, 'project', (p) => p.cells.map((c) => c.char + c.fg.hex + c.bg.hex).join('|'));

async function dragPoints(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 6, from.y + (to.y - from.y) * i / 6);
  await page.mouse.up();
}

test('the VECTOR tab shows the ANSI art and its address is /vector', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await expect(tab(page, 'VECTOR')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => new URL(page.url()).hash).toBe('#/vector');
  await expect(page.locator('.ansi-editor .display canvas')).toBeVisible();
  await expect(page.locator('.vector-overlay')).toHaveCount(1);
  await page.keyboard.press('v');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('vselect');
});

test('clicking a shape selects it, dragging moves it, a handle scales it, the knob rotates it, and undo takes each back', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const bare = await cells(page);
  const key = await addRect(page, 10, 10, 20, 20);
  await settled(page);
  expect(await cells(page)).not.toBe(bare);

  await page.mouse.click(...Object.values(await gridPoint(page, 15, 15)));
  expect(await selected(page)).toEqual([key]);

  await dragPoints(page, await gridPoint(page, 15, 15), await gridPoint(page, 19, 17));
  const moved = await matrix(page, key);
  expect(moved[0]).toBe(1);
  expect(moved[4]).toBeCloseTo(4, 0);
  expect(moved[5]).toBeCloseTo(2, 0);

  // the bottom-right handle, from (24, 22) out to (34, 32): twice as wide and as tall, the top-left staying
  await dragPoints(page, await gridPoint(page, 24, 22), await gridPoint(page, 34, 32));
  const scaled = await matrix(page, key);
  expect(scaled[0]).toBeCloseTo(2, 1);
  expect(scaled[3]).toBeCloseTo(2, 1);

  // the knob, 24 CSS px above the top edge's middle, dragged a quarter turn around the center
  const center = await gridPoint(page, 24, 22), top = await gridPoint(page, 24, 12);
  const knob = { x: top.x, y: top.y - 24 };
  await dragPoints(page, knob, { x: center.x + (center.y - knob.y), y: center.y });
  const turned = await matrix(page, key);
  expect(Math.abs(turned[1])).toBeGreaterThan(1); // b: a rotation's sine, scaled

  for (const back of [scaled, moved, [1, 0, 0, 1, 0, 0]]) {
    await page.keyboard.press('ControlOrMeta+z');
    expect(await matrix(page, key)).toEqual(back);
  }
});

test('Esc deselects and arrows nudge; a double-click edits points, and Esc leaves them first', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  const key = await addRect(page, 10, 10, 20, 20);
  await page.mouse.click(...Object.values(await gridPoint(page, 15, 15)));
  await page.keyboard.press('ArrowRight');
  expect((await matrix(page, key))[4]).toBe(1);
  await page.keyboard.press('Shift+ArrowDown');
  expect((await matrix(page, key))[5]).toBe(10);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await matrix(page, key))[5]).toBe(0);
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([]);

  await page.mouse.dblclick(...Object.values(await gridPoint(page, 16, 15)));
  expect(await store(page, 'workspace', (w) => w.vectorPoints)).toBe(key);
  await page.keyboard.press('Escape');
  expect(await store(page, 'workspace', (w) => w.vectorPoints)).toBe(null);
  expect(await selected(page)).toEqual([key]);
  await page.keyboard.press('Delete');
  expect(await store(page, 'project', (p) => p.shapes.size)).toBe(0);
});

const shapeList = (page) => store(page, 'project', (p) => [...p.shapes].map(([key, s]) => ({ key, ...s })));
const undoSteps = async (page, n) => { for (let i = 0; i < n; i++) await page.keyboard.press('ControlOrMeta+z'); };

test('the Shape tool draws a rectangle, an ellipse and a 5-sided polygon that convert to cells, each one undo step', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const bare = await cells(page);
  await page.keyboard.press('u');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('vshape');
  const kinds = [['Rectangle', 10, 4], ['Ellipse', 25, 4], ['Polygon', 40, 5]];
  for (const [kind, x, points] of kinds) {
    await page.getByRole('button', { name: kind, exact: true }).click();
    await dragPoints(page, await gridPoint(page, x, 10), await gridPoint(page, x + 10, 20));
    const list = await shapeList(page);
    expect(list.at(-1).points).toHaveLength(points);
    expect(await selected(page)).toEqual([list.at(-1).key]);
  }
  expect((await shapeList(page)).map((s) => s.points[0].length)).toEqual([7, 7, 7]);
  await settled(page);
  expect(await cells(page)).not.toBe(bare);
  await page.mouse.click(...Object.values(await gridPoint(page, 60, 10))); // a click makes nothing
  expect(await shapeList(page)).toHaveLength(3);
  await undoSteps(page, 3);
  expect(await shapeList(page)).toHaveLength(0);
});

test('Fill, Stroke and Width change the selected shape; Forward and Back restack it; Delete removes it', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await store(page, 'workspace', (w) => { w.recentColors = ['#00ff00']; });
  const below = await addRect(page, 10, 10, 20, 20);
  const above = await addRect(page, 15, 15, 25, 25);
  await page.mouse.click(...Object.values(await gridPoint(page, 11, 11)));
  expect(await selected(page)).toEqual([below]);

  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  await page.locator('.color-popover .swatch.none').click();
  await page.getByRole('button', { name: 'Stroke', exact: true }).click();
  await page.locator('.color-popover .swatch.small').first().click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Width', { exact: true }).fill('4');
  const changed = (await shapeList(page)).find((s) => s.key === below);
  expect([changed.fill, changed.stroke, changed.width]).toEqual([null, '#00ff00', 4]);

  const z = async () => Object.fromEntries((await shapeList(page)).map((s) => [s.key, s.z]));
  const before = await z(page);
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  expect((await z(page))[below]).toBeGreaterThan((await z(page))[above]);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  expect(await z(page)).toEqual(before);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  expect((await shapeList(page)).map((s) => s.key)).toEqual([above]);

  await undoSteps(page, 6); // Delete, Back, Forward, Width, Stroke, Fill
  const back = (await shapeList(page)).find((s) => s.key === below);
  expect([back.fill, back.stroke, back.width]).toEqual(['#ff0000', null, 1]);
});

test('the eyedropper sets the selected shape\'s fill, and Shift its stroke', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  const key = await addRect(page, 10, 10, 20, 20);
  await page.mouse.click(...Object.values(await gridPoint(page, 15, 15)));
  const color = await store(page, 'project', (p) => p.rawColorAt(40.5, 30.5));
  await page.keyboard.press('i');
  await page.mouse.click(...Object.values(await gridPoint(page, 40.5, 30.5)));
  expect((await shapeList(page))[0].fill).toBe(color);
  await page.keyboard.down('Shift');
  await page.mouse.click(...Object.values(await gridPoint(page, 40.5, 30.5)));
  await page.keyboard.up('Shift');
  expect((await shapeList(page))[0].stroke).toBe(color);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await shapeList(page))[0].stroke).toBe(null);

  await store(page, 'workspace', (w) => { w.vectorSelected = []; });
  await page.mouse.click(...Object.values(await gridPoint(page, 40.5, 30.5)));
  expect(await store(page, 'workspace', (w) => w.vectorStyle.fill)).toBe(color);
  expect(key).toMatch(/^v:/);
});

test('Clear isn\'t on VECTOR, and on ANSI it has nothing to clear when only shapes are drawn', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  await addRect(page, 10, 10, 30, 30);
  const clear = page.getByTitle('Clear edit layer: erase everything on the edit layer.');
  await expect(clear).toHaveCount(0);
  await tab(page, 'ANSI').click();
  await expect(clear).toBeDisabled();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('the options row is Fill, Stroke, Width, Points and ⋯', async ({ page }) => {
    await openApp(page);
    await tab(page, 'VECTOR').click();
    const key = await addRect(page, 4, 4, 14, 14);
    await store(page, 'workspace', `(w) => { w.vectorSelected = ['${key}']; }`);
    const row = page.locator('.vector-options');
    for (const name of ['Fill', 'Stroke', 'Points']) await expect(row.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(row.getByLabel('Width', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Forward', exact: true })).toHaveCount(0);
    await expect(row.locator('.hint')).toHaveCount(0);
    await row.getByRole('button', { name: 'More', exact: true }).click();
    for (const name of ['Forward', 'Back', 'Delete']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  });
});
