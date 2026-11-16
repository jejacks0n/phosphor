// Retouch: Blur, Dodge and Burn change the colors that show. In the pixel view each grid pixel's, as paint; in the ANSI
// view each cell's, keeping its character. A stroke is one undo step and stays inside a selection.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { blur, dodge, burn } from '@/tools/retouch';
import { getTool } from '@/tools';
import { hex2rgb } from '@/lib/ColorUtils';

async function blank(view = 'input') {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  workspace.editorTab = view;
  Object.assign(workspace, { retouchSize: 4, retouchStrength: 100, retouchHardness: 100, retouchRange: 'midtones' });
  return { project, workspace, ctx: { project, workspace, view } };
}
function stroke(tool, ctx, from, to = from) {
  getTool(tool.id).begin(ctx, from, {});
  tool.move(ctx, from, to);
  tool.end(ctx);
}
const paintAt = (project, x, y) => { const p = project.paintLayer?.pixelAt(x, y); return p ? [p.r, p.g, p.b] : null; };
function paintGray(project, value = 128, x0 = 0, x1 = 19) {
  const pixels = [];
  for (let y = 0; y < 20; y++) for (let x = x0; x <= x1; x++) pixels.push({ x, y, r: value, g: value, b: value, alpha: 1 });
  project.paintEditPixels(pixels);
  project.commitEdit();
}

test('the toolbar offers them in the pixel and ANSI views, by R, O and Shift+O', () => {
  expect([blur, dodge, burn].map((tool) => [tool.id, tool.keys, tool.views])).toEqual([
    ['blur', ['R'], ['input', 'output']], ['dodge', ['O'], ['input', 'output']], ['burn', ['Shift+O'], ['input', 'output']],
  ]);
  expect(getTool('dodge')).toBe(dodge);
});

test('pixel view: Dodge lightens and Burn darkens what shows, each stroke one undo step', async () => {
  const { project, ctx } = await blank();
  paintGray(project);
  stroke(dodge, ctx, { x: 10, y: 10 });
  const [light] = paintAt(project, 10, 10);
  expect(light).toBeGreaterThan(180);
  expect(paintAt(project, 2, 2)).toEqual([128, 128, 128]); // out of the brush's reach
  project.undo();
  expect(paintAt(project, 10, 10)).toEqual([128, 128, 128]);
  stroke(burn, ctx, { x: 10, y: 10 });
  expect(paintAt(project, 10, 10)[0]).toBeLessThan(70);
});

test('going over a spot again in one stroke adds nothing; another stroke does', async () => {
  const { project, workspace, ctx } = await blank();
  workspace.retouchStrength = 40;
  paintGray(project);
  getTool('dodge').begin(ctx, { x: 10, y: 10 }, {});
  dodge.move(ctx, { x: 10, y: 10 }, { x: 14, y: 10 });
  dodge.move(ctx, { x: 14, y: 10 }, { x: 10, y: 10 });
  dodge.end(ctx);
  const once = paintAt(project, 10, 10)[0];
  expect(once).toBeGreaterThan(128);
  stroke(dodge, ctx, { x: 10, y: 10 });
  expect(paintAt(project, 10, 10)[0]).toBeGreaterThan(once);
});

test('pixel view: Blur softens an edge', async () => {
  const { project, ctx } = await blank();
  paintGray(project, 0, 0, 9);
  paintGray(project, 255, 10, 19);
  stroke(blur, ctx, { x: 10, y: 10 });
  const [left] = paintAt(project, 9, 10), [right] = paintAt(project, 10, 10);
  expect(left).toBeGreaterThan(0);
  expect(right).toBeLessThan(255);
});

test('ANSI view: Dodge recolors a cell\'s character and background, and the character stays', async () => {
  const { project, ctx } = await blank('output');
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: 'A', fg: '#808080', bg: '#606060' } }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 });
  const cell = project.editCellAt(5, 5);
  expect(cell.char).toBe('A');
  expect(hex2rgb(cell.fg).r).toBeGreaterThan(0x80);
  expect(hex2rgb(cell.bg).r).toBeGreaterThan(0x60);
});

test('ANSI view: on a drawing layer, Blur leaves the empty cells beside a typed one empty, and blends typed cells, keeping their characters', async () => {
  const { project, ctx } = await blank('output');
  project.writeEditCells([
    { col: 5, row: 5, attrs: { char: 'A', fg: '#ff0000', bg: '#0000ff' } },
    { col: 6, row: 5, attrs: { char: 'B', fg: '#00ff00', bg: '#0000ff' } },
  ]);
  project.commitEdit();
  stroke(blur, ctx, { x: 5.5, y: 11 }, { x: 6.5, y: 11 });
  expect(project.editCellAt(4, 5)).toBeUndefined();
  expect(project.editCellAt(7, 5)).toBeUndefined();
  expect(project.editCellAt(5, 6)).toBeUndefined();
  const [a, b] = [project.editCellAt(5, 5), project.editCellAt(6, 5)];
  expect([a.char, b.char]).toEqual(['A', 'B']);
  expect(hex2rgb(a.fg).g).toBeGreaterThan(0); // the green beside it came in
  expect(hex2rgb(b.fg).r).toBeGreaterThan(0);
  expect([a.bg, b.bg]).toEqual(['#0000ff', '#0000ff']); // blue around blue: blue
});

test('a selection keeps the stroke inside it', async () => {
  const { project, workspace, ctx } = await blank();
  paintGray(project);
  workspace.selection = { c0: 0, r0: 0, c1: 9, r1: 19 };
  stroke(dodge, ctx, { x: 10, y: 10 });
  expect(paintAt(project, 9, 10)[0]).toBeGreaterThan(128);
  expect(paintAt(project, 10, 10)).toEqual([128, 128, 128]);
});

test('with the base picked it changes the base\'s own pixels', async () => {
  const { project, workspace, ctx } = await blank();
  workspace.pickLayer('base');
  workspace.retouchRange = 'shadows';
  stroke(dodge, ctx, { x: 10, y: 10 });
  expect(project.baseColorAt(10, 10)).toBe('#808080'); // black, halfway to white
  expect(paintAt(project, 10, 10)).toBeNull();
});

test('ANSI view: a cell the stroke doesn\'t change is left as it is, its 256-color index too', async () => {
  const { project, ctx } = await blank('output');
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: 'A', fg: '#ffffff', fgIndex: 231, bg: '#000000', bgIndex: 16 } }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 }); // Midtones: black and white stay
  expect(project.editCellAt(5, 5)).toEqual({ char: 'A', fg: '#ffffff', fgIndex: 231, bg: '#000000', bgIndex: 16 });
  expect(project.editCellAt(4, 5)).toBeUndefined(); // the blank canvas's black, untouched
});

// On a drawing layer Retouch works on the layer's own paint alone: nothing where it has none, whatever shows under it, and
// a clear pixel counts as clear, so Blur fades an edge out into the clear around it.
async function overGreen(view = 'input') {
  const app = await blank(view);
  app.workspace.pickLayer('base');
  paintGray(app.project, 0); // the base, so there's something under the layer
  const green = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) green.push({ x, y, r: 0, g: 200, b: 0, alpha: 1 });
  app.project.paintEditPixels(green);
  app.project.commitEdit();
  app.workspace.pickLayer('edit');
  return app;
}
const alphaAt = (project, x, y) => project.paintLayer?.pixelAt(x, y)?.a ?? 0;

for (const view of ['input', 'output']) {
  test(`${view === 'input' ? 'pixel' : 'ANSI'} view: on an empty drawing layer Blur, Dodge and Burn change nothing, whatever is under it`, async () => {
    const { project, ctx } = await overGreen(view);
    const cells = project.cells.map((cell) => cell && `${cell.char}${cell.fg.hex}${cell.bg.hex}`).join();
    for (const tool of [blur, dodge, burn]) stroke(tool, ctx, { x: 10, y: 10 });
    expect(project.paintLayer.hasPaint).toBe(false);
    expect(project.editCells.size).toBe(0);
    expect(project.cells.map((cell) => cell && `${cell.char}${cell.fg.hex}${cell.bg.hex}`).join()).toBe(cells);
  });

  test(`${view === 'input' ? 'pixel' : 'ANSI'} view: on a drawing layer Blur fades paint's edge into the clear beside it, in its own color, and a solid patch stays solid`, async () => {
    const { project, workspace, ctx } = await overGreen(view);
    const red = [];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) red.push({ x, y, r: 255, g: 0, b: 0, alpha: 1 });
    project.paintEditPixels(red);
    project.commitEdit();
    workspace.retouchSize = 6;
    stroke(blur, ctx, { x: 10, y: 10.5 });
    expect(alphaAt(project, 9, 10)).toBeLessThan(1);
    expect(alphaAt(project, 9, 10)).toBeGreaterThan(0.5);
    expect(alphaAt(project, 10, 10)).toBeGreaterThan(0); // spread a little into the clear
    expect(alphaAt(project, 10, 10)).toBeLessThan(0.5);
    expect(alphaAt(project, 12, 10)).toBe(0); // nothing painted within reach
    expect(paintAt(project, 10, 10)).toEqual([255, 0, 0]); // its own color, none of the green under it
    expect(paintAt(project, 8, 10)).toEqual([255, 0, 0]);
    expect(alphaAt(project, 7, 10)).toBe(1); // red all around: still solid
    project.undo();
    expect(alphaAt(project, 9, 10)).toBe(1);
    expect(alphaAt(project, 10, 10)).toBe(0);
  });
}

test('pixel view: on a drawing layer Dodge lightens its paint and keeps its alpha', async () => {
  const { project, ctx } = await overGreen();
  const pixels = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) pixels.push({ x, y, r: 128, g: 128, b: 128, alpha: 1 });
  project.paintEditPixels(pixels, 50);
  project.commitEdit();
  const before = alphaAt(project, 10, 10);
  stroke(dodge, ctx, { x: 10, y: 10 });
  expect(paintAt(project, 10, 10)[0]).toBeGreaterThan(180);
  expect(alphaAt(project, 10, 10)).toBeCloseTo(before, 2);
});

// The report: in Monochrome ASCII, Retouch in the ANSI view did nothing that showed. It changed the base's cells' colors and
// kept their characters, and Monochrome ASCII shows every cell white on black: a cell's brightness is its character.
test('ANSI view, Monochrome ASCII: on the base its pixels change, as in the PIXEL view, and the characters follow', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.renderStyle = 'ascii';
  await settle(project);
  workspace.pickLayer('base');
  Object.assign(workspace, { retouchSize: 8, retouchStrength: 100, retouchHardness: 100, retouchRange: 'midtones' });
  const row = () => project.cells.slice(5 * 20, 5 * 20 + 20).map((cell) => cell?.char).join('');
  const before = row();
  stroke(dodge, { project, workspace, view: 'output' }, { x: 6, y: 10.5 });
  await settle(project);
  expect(row()).not.toBe(before);
  expect(project.baseRecords.pins.size).toBe(0); // nothing pinned: the characters stay the converter's
});
