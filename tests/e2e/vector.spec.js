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

test('on VECTOR the color pair is Fill and Stroke: it shows the selected shape\'s, or the next shape\'s, and the options row has no colors and stays the height ANSI\'s is', async ({ page }) => {
  await openApp(page);
  await tab(page, 'ANSI').click();
  await page.keyboard.press('m');
  const height = async () => (await page.locator('.edit-toolbar').boundingBox()).height;
  const ansi = await height();
  await tab(page, 'VECTOR').click();
  const pair = page.locator('.color-pair');
  await expect(pair.getByRole('button', { name: 'Fill', exact: true })).toBeVisible();
  await expect(pair.getByRole('button', { name: 'Stroke', exact: true })).toBeVisible();
  await expect(page.locator('.vector-options').getByRole('button', { name: 'Fill', exact: true })).toHaveCount(0);
  expect(await height()).toBe(ansi);
  const fg = await store(page, 'workspace', (w) => w.editFgColor);
  await expect(pair.getByRole('button', { name: 'Fill', exact: true })).toHaveAttribute('title', new RegExp(`^Fill: ${fg} \\(`));
  await expect(pair.getByRole('button', { name: 'Stroke', exact: true })).toHaveAttribute('title', /^Stroke: none \(/);
  const key = await addRect(page, 10, 10, 20, 20);
  await page.mouse.click(...Object.values(await gridPoint(page, 11, 11)));
  expect(await selected(page)).toEqual([key]);
  await expect(pair.getByRole('button', { name: 'Fill', exact: true })).toHaveAttribute('title', /^Fill: #ff0000 \(/);
  expect(await height()).toBe(ansi);
  await page.keyboard.press('ControlOrMeta+Shift+x'); // swaps the shape's Fill and Stroke
  expect((await shapeList(page))[0]).toMatchObject({ fill: null, stroke: '#ff0000' });
  await page.keyboard.press('ControlOrMeta+z');
  expect((await shapeList(page))[0]).toMatchObject({ fill: '#ff0000', stroke: null });
  expect(await store(page, 'workspace', (w) => w.editFgColor)).toBe(fg); // ANSI's colors are left alone
});

test('VECTOR\'s color box is the one the other tabs have, with Fill and Stroke for FG and BG, and Swap', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await store(page, 'workspace', (w) => { w.recentColors = ['#00ff00']; });
  const key = await addRect(page, 10, 10, 20, 20);
  await page.mouse.click(...Object.values(await gridPoint(page, 11, 11)));
  expect(await selected(page)).toEqual([key]);
  await page.locator('.color-pair .chip.fg').click();
  const box = page.locator('.color-popover');
  await expect(box.locator('.head button.on')).toHaveText('Fill');
  await box.getByRole('button', { name: 'Stroke', exact: true }).click();
  await expect(box.locator('.head button.on')).toHaveText('Stroke');
  await box.locator('.swatch.small').first().click(); // the stroke's now
  expect((await shapeList(page))[0]).toMatchObject({ fill: '#ff0000', stroke: '#00ff00' });
  await box.getByRole('button', { name: /Swap/ }).click();
  expect((await shapeList(page))[0]).toMatchObject({ fill: '#00ff00', stroke: '#ff0000' });
  await page.keyboard.press('Escape');
  await undoSteps(page, 2); // Swap, Stroke
  expect((await shapeList(page))[0]).toMatchObject({ fill: '#ff0000', stroke: null });
});

// Shift held once the drag is going (pressed first, it adds to or takes from the selection).
test('Shift while moving a shape keeps it on a straight line or a 45° angle', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const key = await addRect(page, 10, 10, 20, 20);
  await page.mouse.click(...Object.values(await gridPoint(page, 15, 15)));
  const drag = async (to) => {
    const from = await gridPoint(page, 15, 15);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 4, from.y + 4);
    await page.keyboard.down('Shift');
    const end = await gridPoint(page, 15 + to.x, 15 + to.y);
    for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + (end.x - from.x) * i / 6, from.y + (end.y - from.y) * i / 6);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const m = await matrix(page, key);
    await page.keyboard.press('ControlOrMeta+z');
    return [m[4], m[5]];
  };
  const [ax, ay] = await drag({ x: 12, y: 2 }); // mostly across: level
  expect(ay).toBe(0);
  expect(ax).toBeGreaterThan(10);
  const [bx, by] = await drag({ x: 2, y: -12 }); // mostly up: straight up
  expect(bx).toBe(0);
  expect(by).toBeLessThan(-10);
  const [cx, cy] = await drag({ x: 9, y: 11 }); // near the diagonal: on it
  expect(cx).toBeCloseTo(cy, 4);
  expect(cx).toBeGreaterThan(8);
  expect(await matrix(page, key)).toEqual([1, 0, 0, 1, 0, 0]);
});

test('Fill, Stroke and Stroke width change the selected shape; Forward and Back restack it; Delete removes it', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await store(page, 'workspace', (w) => { w.recentColors = ['#00ff00']; });
  const below = await addRect(page, 10, 10, 20, 20);
  const above = await addRect(page, 15, 15, 25, 25);
  await page.mouse.click(...Object.values(await gridPoint(page, 11, 11)));
  expect(await selected(page)).toEqual([below]);

  await page.locator('.color-pair .chip.fg').click();
  await page.locator('.color-popover .swatch.none').click();
  await page.locator('.color-pair .chip.bg').click();
  await page.locator('.color-popover .swatch.small').first().click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Stroke width', { exact: true }).fill('4');
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

  await undoSteps(page, 6); // Delete, Back, Forward, Stroke width, Stroke, Fill
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

test('the Pen draws a closed shape with a curve, and Enter or a tool change leaves an open one', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const bare = await cells(page);
  await page.keyboard.press('p');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('pen');
  const click = async (x, y) => page.mouse.click(...Object.values(await gridPoint(page, x, y)));
  await click(10, 10);
  await click(30, 10);
  await dragPoints(page, await gridPoint(page, 30, 30), await gridPoint(page, 36, 30)); // a smooth point
  await click(10.2, 10.2); // the first point: closed
  const [closed] = await shapeList(page);
  expect(closed).toMatchObject({ closed: true, stroke: null });
  expect(closed.points).toHaveLength(3);
  expect(closed.points[2][6]).toBe(1);
  expect(closed.points[2][4]).toBeCloseTo(6, 0);
  await expect.poll(() => cells(page)).not.toEqual(bare);
  expect(await store(page, 'workspace', (w) => w.vectorPen)).toBe(null);

  await click(5, 40);
  await click(25, 45);
  await page.keyboard.press('Enter');
  await click(5, 50);
  await click(25, 55);
  await page.keyboard.press('v');
  const shapes = await shapeList(page);
  expect(shapes).toHaveLength(3);
  expect(shapes.filter((s) => !s.closed)).toHaveLength(2);
  for (const open of shapes.filter((s) => !s.closed)) expect(open.fill).toBe(null);
  await undoSteps(page, 3);
  await expect.poll(() => cells(page)).toEqual(bare);
});

test('Shift with the Pen keeps the next point, and a smooth point\'s handle, across, up and down or at 45°', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  await page.keyboard.press('p');
  const at = (x, y) => gridPoint(page, x, y);
  await page.mouse.click(...Object.values(await at(10, 10)));
  await page.keyboard.down('Shift');
  await page.mouse.click(...Object.values(await at(30, 12))); // mostly across: level with the first
  await page.mouse.click(...Object.values(await at(40, 21))); // near the diagonal: on it
  await dragPoints(page, await at(40, 40), await at(46, 41.5)); // straight down, its handle level
  await page.keyboard.up('Shift');
  await page.keyboard.press('Enter');
  const [{ points }] = await shapeList(page);
  expect(points[1][1]).toBeCloseTo(points[0][1], 4);
  expect(points[2][0] - points[1][0]).toBeCloseTo(points[2][1] - points[1][1], 4);
  expect(points[3][0]).toBeCloseTo(points[2][0], 4);
  expect(points[3][5]).toBeCloseTo(0, 4);
  expect(points[3][4]).toBeGreaterThan(4);
});

test('Shift while editing points keeps a dragged point on a straight line, and a handle across, up and down or at 45°', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const key = await addRect(page, 10, 10, 30, 30);
  const point = (i) => store(page, 'project', `(p) => p.shapes.get('${key}').points[${i}]`);
  await page.mouse.dblclick(...Object.values(await gridPoint(page, 20, 20)));
  await page.mouse.move(...Object.values(await gridPoint(page, 30, 30)));
  await page.mouse.down();
  await page.keyboard.down('Shift');
  for (let i = 1; i <= 6; i++) await page.mouse.move(...Object.values(await gridPoint(page, 30 + i, 30 + i / 4)));
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const moved = await point(2);
  expect(moved[1]).toBeCloseTo(30, 4);
  expect(moved[0]).toBeGreaterThan(35);

  await page.locator('.vector-options').getByRole('button', { name: 'Smooth', exact: true }).click();
  const smooth = await point(2);
  await page.keyboard.down('Shift');
  await dragPoints(page, await gridPoint(page, smooth[0] + smooth[4], smooth[1] + smooth[5]), await gridPoint(page, smooth[0] + 8, smooth[1] + 7));
  await page.keyboard.up('Shift');
  const bent = await point(2);
  expect(bent[4]).toBeCloseTo(bent[5], 4);
  expect(bent[4]).toBeGreaterThan(6);
});

// A two-point path from (10, 20) to (30, 20), its out handle bulging the curve up: its ends and that handle, in grid pixels.
const addLine = (page) => store(page, 'project', `(p) => p.addShape({ z: 0, closed: false, fill: null, stroke: '#ff0000', width: 1, m: [1, 0, 0, 1, 0, 0],
  points: [[10, 20, 0, 0, 6, -4, 0], [30, 20, 0, 0, 0, 0, 0]] })`);
const lineEnds = (page, key) => store(page, 'project', `(p) => {
  const s = p.shapes.get('${key}'), [a, b, c, d, e, f] = s.m, w = (x, y) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
  const [p0, p1] = s.points;
  return { start: w(p0[0], p0[1]), end: w(p1[0], p1[1]), out: w(p0[0] + p0[4], p0[1] + p0[5]) };
}`);

test('the Node tool (A) edits the points of the shape pressed, a two-point line\'s ends too, and a double-click with Vector select switches to it', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const line = await addLine(page);
  await page.keyboard.press('a');
  expect(await store(page, 'workspace', (w) => w.activeTool)).toBe('vnode');
  await dragPoints(page, await gridPoint(page, 30, 20), await gridPoint(page, 34, 26)); // one press: its points, and the end dragged
  expect(await store(page, 'workspace', (w) => w.vectorPoints)).toBe(line);
  expect((await lineEnds(page, line)).end).toMatchObject({ x: expect.closeTo(34, 0), y: expect.closeTo(26, 0) });
  await expect(page.locator('.ansi-status .hint')).toContainText('drag a handle to break it from its partner');
  await page.keyboard.press('Escape');
  expect(await store(page, 'workspace', (w) => w.vectorPoints)).toBe(null);

  const rect = await addRect(page, 40, 10, 60, 30);
  await page.keyboard.press('v');
  await page.mouse.dblclick(...Object.values(await gridPoint(page, 50, 20)));
  expect(await store(page, 'workspace', (w) => [w.activeTool, w.vectorPoints])).toEqual(['vnode', rect]);
  await page.keyboard.press('v');
  expect(await store(page, 'workspace', (w) => w.vectorPoints)).toBe(null);
  expect(await selected(page)).toEqual([rect]);
});

test('the Node tool shows and drags the points of every outline in a shape', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const key = await store(page, 'project', `(p) => p.addShape({ z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0], rule: 'evenodd',
    points: [[10, 10, 0, 0, 0, 0, 0], [40, 10, 0, 0, 0, 0, 0], [40, 40, 0, 0, 0, 0, 0], [10, 40, 0, 0, 0, 0, 0]],
    more: [[true, [[20, 20, 0, 0, 0, 0, 0], [30, 20, 0, 0, 0, 0, 0], [30, 30, 0, 0, 0, 0, 0], [20, 30, 0, 0, 0, 0, 0]]]] })`);
  await page.keyboard.press('a');
  await page.mouse.click(...Object.values(await gridPoint(page, 12, 25))); // on the band: its points
  await expect(page.locator('.vector-overlay rect.handle')).toHaveCount(8);
  await dragPoints(page, await gridPoint(page, 30, 30), await gridPoint(page, 33, 34));
  const inner = await store(page, 'project', `(p) => p.shapes.get('${key}').more[0][1][2]`);
  expect(inner[0]).toBeCloseTo(33, 0);
  expect(inner[1]).toBeCloseTo(34, 0);
  const row = page.locator('.vector-options');
  await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled(); // the Point row knows an inner point
  await row.getByRole('button', { name: 'Smooth', exact: true }).click();
  expect(await store(page, 'project', `(p) => p.shapes.get('${key}').more[0][1][2][6]`)).toBe(1);
});

test('Join makes two shapes one with a hole, and Separate takes it apart', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const outer = await addRect(page, 10, 10, 40, 40);
  await addRect(page, 20, 20, 30, 30);
  const row = page.locator('.vector-options');
  await page.mouse.click(...Object.values(await gridPoint(page, 12, 12)));
  await expect(row.getByRole('button', { name: 'Join', exact: true })).toBeDisabled();
  await page.keyboard.down('Shift');
  await page.mouse.click(...Object.values(await gridPoint(page, 25, 25)));
  await page.keyboard.up('Shift');
  await row.getByRole('button', { name: 'Join', exact: true }).click();
  expect(await shapeList(page)).toHaveLength(1);
  expect(await selected(page)).toEqual([outer]);
  expect((await shapeList(page))[0]).toMatchObject({ rule: 'evenodd', more: [[true, expect.any(Array)]] });
  await row.getByRole('button', { name: 'Separate', exact: true }).click();
  expect(await shapeList(page)).toHaveLength(2);
  expect(await selected(page)).toHaveLength(2);
  await expect(row.getByRole('button', { name: 'Separate', exact: true })).toBeDisabled();
});

test('the Stroke panel sets caps, joins and the miter limit on the selection and on the next shape', async ({ page }) => {
  await openApp(page);
  await tab(page, 'ANSI').click();
  const height = async () => (await page.locator('.edit-toolbar').boundingBox()).height;
  const ansi = await height();
  await tab(page, 'VECTOR').click();
  await settled(page);
  const key = await addRect(page, 10, 10, 20, 20);
  await page.mouse.click(...Object.values(await gridPoint(page, 11, 11)));
  expect(await selected(page)).toEqual([key]);
  const row = page.locator('.vector-options');
  expect(await height()).toBe(ansi);
  await row.getByRole('button', { name: 'Stroke', exact: true }).click();
  const miter = page.getByLabel('Miter', { exact: true });
  await expect(page.getByRole('button', { name: 'Round cap', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(miter).toBeDisabled();
  await page.getByRole('button', { name: 'Butt cap', exact: true }).click();
  await page.getByRole('button', { name: 'Miter join', exact: true }).click();
  expect((await shapeList(page))[0]).toMatchObject({ cap: 'butt', join: 'miter' });
  await expect(page.getByRole('button', { name: 'Butt cap', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(miter).toBeEnabled();
  await miter.fill('10');
  await miter.press('Enter');
  expect((await shapeList(page))[0]).toMatchObject({ miter: 10 });
  await undoSteps(page, 1);
  expect((await shapeList(page))[0]).toMatchObject({ cap: 'butt', join: 'miter' });
  expect((await shapeList(page))[0].miter).toBeUndefined();
  await undoSteps(page, 1);
  expect((await shapeList(page))[0].join).toBeUndefined();
  await undoSteps(page, 1);
  expect((await shapeList(page))[0].cap).toBeUndefined();

  await page.keyboard.press('Escape'); // closes the panel
  await page.keyboard.press('Escape'); // deselects
  expect(await selected(page)).toEqual([]);
  await page.keyboard.press('p');
  await row.getByRole('button', { name: 'Stroke', exact: true }).click();
  await page.getByRole('button', { name: 'Bevel join', exact: true }).click();
  await page.keyboard.press('Escape');
  for (const [x, y] of [[30, 10], [40, 20], [30, 30]]) await page.mouse.click(...Object.values(await gridPoint(page, x, y)));
  await page.keyboard.press('Enter');
  const drawn = (await shapeList(page)).find((s) => s.key !== key);
  expect(drawn).toMatchObject({ join: 'bevel' });
  expect(drawn.cap).toBeUndefined();
  expect(await height()).toBe(ansi);
});

test('the Fill color box makes a gradient and takes it back to solid', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const bg = await store(page, 'workspace', (w) => w.editBgColor);
  const key = await addRect(page, 10, 10, 20, 20);
  await page.locator('.color-pair .chip.fg').click();
  const box = page.locator('.color-popover');
  await expect(box.getByRole('button', { name: 'Linear', exact: true })).toBeDisabled(); // nothing selected: the next shape's fill is solid
  await page.keyboard.press('Escape');
  await page.mouse.click(...Object.values(await gridPoint(page, 11, 11)));
  expect(await selected(page)).toEqual([key]);
  await page.locator('.color-pair .chip.fg').click();
  await expect(box.getByRole('button', { name: 'Solid', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await box.getByRole('button', { name: 'Linear', exact: true }).click();
  const fill = async () => (await shapeList(page))[0].fill;
  // Across the shape's box, left to right, from its color to the background color.
  expect(await fill()).toEqual({ type: 'linear', stops: [[0, '#ff0000'], [1, bg]], m: [10, 0, 0, 10, 10, 15] });
  await expect(page.locator('.color-pair .chip.fg')).toHaveAttribute('style', /linear-gradient/);
  await expect(page.locator('.color-pair .chip.fg')).toHaveAttribute('title', /^Fill: linear gradient/);
  await box.getByRole('button', { name: 'Radial', exact: true }).click();
  // From the middle to the farthest corner, its stops kept.
  const radial = await fill();
  expect(radial).toMatchObject({ type: 'radial', stops: [[0, '#ff0000'], [1, bg]] });
  expect(radial.m.map((v) => Math.round(v * 100) / 100)).toEqual([7.07, 0, 0, 7.07, 15, 15]);
  await expect(page.locator('.color-pair .chip.fg')).toHaveAttribute('style', /radial-gradient/);
  await box.getByRole('button', { name: 'Solid', exact: true }).click();
  expect(await fill()).toBe('#ff0000'); // its first stop

  await page.keyboard.press('Escape');
  await undoSteps(page, 1);
  expect((await fill()).type).toBe('radial');
  await undoSteps(page, 1);
  expect((await fill()).type).toBe('linear');
  await undoSteps(page, 1);
  expect(await fill()).toBe('#ff0000');

  // Swapping a gradient's Fill and Stroke: the stroke takes its first stop.
  await page.locator('.color-pair .chip.fg').click();
  await box.getByRole('button', { name: 'Linear', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+Shift+x');
  expect((await shapeList(page))[0]).toMatchObject({ fill: null, stroke: '#ff0000' });
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
  test('the options row is Stroke width, Points and ⋯', async ({ page }) => {
    await openApp(page);
    await tab(page, 'VECTOR').click();
    const key = await addRect(page, 4, 4, 14, 14);
    await store(page, 'workspace', `(w) => { w.vectorSelected = ['${key}']; }`);
    const row = page.locator('.vector-options');
    await expect(row.getByRole('button', { name: 'Points', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Fill', exact: true })).toHaveCount(0);
    await expect(row.getByLabel('Stroke width', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Forward', exact: true })).toHaveCount(0);
    await expect(row.locator('.hint')).toHaveCount(0);
    await row.getByRole('button', { name: 'More', exact: true }).click();
    for (const name of ['Forward', 'Back', 'Delete']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  });
});

test('double-click edits points: drag a point and a handle, click the outline to add one, Smooth and Corner, Delete, and empty canvas to finish', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const key = await addRect(page, 10, 10, 30, 30);
  const world = (i) => store(page, 'project', `(p) => { const s = p.shapes.get('${key}'); const [x, y] = s.points[${i}]; return { x: x + s.m[4], y: y + s.m[5], n: s.points.length, smooth: s.points[${i}][6] }; }`);
  await page.mouse.dblclick(...Object.values(await gridPoint(page, 20, 20)));
  expect(await store(page, 'workspace', (w) => w.vectorPoints)).toBe(key);
  const row = page.locator('.vector-options');
  await expect(row.getByText('Point', { exact: true })).toBeVisible();

  // A point dragged: it moves, one step.
  await dragPoints(page, await gridPoint(page, 30, 30), await gridPoint(page, 36, 34));
  expect(await world(2)).toMatchObject({ x: expect.closeTo(36, 0), y: expect.closeTo(34, 0) });
  expect(await store(page, 'workspace', (w) => w.vectorPoint)).toBe(2);

  // Clicking the top edge's middle adds a point there, selected.
  await page.mouse.click(...Object.values(await gridPoint(page, 20, 10)));
  expect((await world(1)).n).toBe(5);
  expect(await store(page, 'workspace', (w) => w.vectorPoint)).toBe(1);

  // Smooth gives it handles; dragging the out handle bends the edge; Corner takes them away: a sharp corner.
  await row.getByRole('button', { name: 'Smooth', exact: true }).click();
  expect((await world(1)).smooth).toBe(1);
  const out = await store(page, 'project', `(p) => { const s = p.shapes.get('${key}'); const q = s.points[1]; return { x: q[0] + q[4] + s.m[4], y: q[1] + q[5] + s.m[5] }; }`);
  await dragPoints(page, await gridPoint(page, out.x, out.y), await gridPoint(page, out.x, out.y - 5));
  const bent = await store(page, 'project', `(p) => p.shapes.get('${key}').points[1]`);
  expect(bent[5]).toBeLessThan(-3);
  expect(Math.hypot(bent[2], bent[3])).toBeCloseTo(10 / 3, 1); // the in handle turned with it, at its own length
  expect(bent[3]).toBeGreaterThan(2);
  // Alt-dragging the in handle breaks it from the out handle, which stays where it is; the status bar says how.
  await expect(page.locator('.ansi-status .hint')).toContainText('drag a handle to break it from its partner');
  const inHandle = { x: bent[0] + bent[2], y: bent[1] + bent[3] }, m = await matrix(page, key);
  await page.keyboard.down('Alt');
  await dragPoints(page, await gridPoint(page, inHandle.x + m[4], inHandle.y + m[5]), await gridPoint(page, inHandle.x + m[4] - 4, inHandle.y + m[5]));
  await page.keyboard.up('Alt');
  const broke = await store(page, 'project', `(p) => p.shapes.get('${key}').points[1]`);
  expect(broke.slice(4, 6)).toEqual(bent.slice(4, 6));
  expect(broke[2]).toBeLessThan(bent[2] - 2);
  expect(broke[6]).toBe(0);
  await row.getByRole('button', { name: 'Smooth', exact: true }).click(); // smooth again, for Corner below
  await row.getByRole('button', { name: 'Corner', exact: true }).click();
  expect((await world(1)).smooth).toBe(0);
  expect((await store(page, 'project', `(p) => p.shapes.get('${key}').points[1]`)).slice(2, 6)).toEqual([0, 0, 0, 0]);

  // Delete the point, then a click on empty canvas finishes; there's no Done.
  await expect(row.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  expect((await world(0)).n).toBe(4);
  await page.mouse.click(...Object.values(await gridPoint(page, 50, 20)));
  expect(await store(page, 'workspace', (w) => w.vectorPoints)).toBe(null);
  expect(await selected(page)).toEqual([key]);

  await undoSteps(page, 7); // Delete point, Corner, Smooth, the broken handle, the handle, Smooth, the added point
  expect((await world(2))).toMatchObject({ n: 4, x: expect.closeTo(36, 0) });
});

test('on a Blank frame, the shapes it carries have dimmed outlines; one changed there is its own', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const key = await addRect(page, 10, 10, 20, 20);
  await store(page, 'project', (p) => { p.setAnimate(true); p.addFrame('blank'); });
  await expect(page.locator('.vector-overlay .carried')).toHaveCount(1);
  await expect(page.locator('.vector-overlay .carried')).toHaveCSS('opacity', '0.4');
  await page.mouse.click(...Object.values(await gridPoint(page, 15, 15)));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(page.locator('.vector-overlay .carried')).toHaveCount(0);
  await store(page, 'project', (p) => p.showFrame(0));
  expect((await matrix(page, key))[4]).toBe(0);
});

test('VECTOR\'s Merge down presses the selected shapes into the base, and ANSI\'s Merge down says shapes go too', async ({ page }) => {
  await openApp(page);
  await tab(page, 'VECTOR').click();
  await settled(page);
  const a = await addRect(page, 10, 10, 20, 20), b = await addRect(page, 40, 30, 50, 40);
  await settled(page);
  const shown = await cells(page);
  const merge = page.getByRole('button', { name: /^Merge down: press the selected shapes/ });
  await page.mouse.click(...Object.values(await gridPoint(page, 15, 15)));
  await merge.click();
  await expect(page.getByRole('dialog')).toHaveCount(0); // no question on VECTOR
  expect((await shapeList(page)).map((s) => s.key)).toEqual([b]);
  await expect.poll(() => cells(page)).toEqual(shown);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await shapeList(page)).map((s) => s.key).sort()).toEqual([a, b].sort());

  await tab(page, 'ANSI').click();
  await page.getByRole('button', { name: /^Merge down: flatten/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Merge down' });
  await expect(dialog.getByText('Shapes are merged too, and stop being editable.')).toBeVisible();
  await dialog.getByRole('button', { name: /^Keep crisp cells/ }).click();
  expect(await shapeList(page)).toEqual([]);
  await expect.poll(() => cells(page)).toEqual(shown);
});
