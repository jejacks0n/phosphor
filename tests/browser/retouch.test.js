// Retouch: Blur, Dodge and Burn change the colors that show. In the pixel view each grid pixel's, as paint; in the ANSI
// view each cell's, on the base keeping its character; on a drawing layer a cell with colors of its own that a stroke
// changes becomes paint. A stroke is one undo step and stays inside a selection.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { blur, dodge, burn } from '@/tools/retouch';
import { getTool } from '@/tools';
import { hex2rgb } from '@/lib/ColorUtils.js';

async function blank(view = 'input') {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
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

test('ANSI view: on the base Dodge recolors a cell\'s character and background, and the character stays', async () => {
  const { project, workspace, ctx } = await blank('output');
  workspace.pickLayer('base');
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: 'A', fg: '#808080', bg: '#606060' } }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 });
  const cell = project.cells[5 * 20 + 5];
  expect(cell.char).toBe('A');
  expect(cell.fg.r).toBeGreaterThan(0x80);
  expect(cell.bg.r).toBeGreaterThan(0x60);
});

test('ANSI view: on a drawing layer, Blur turns typed cells into paint, blends them and fades them into the clear beside them', async () => {
  const { project, ctx } = await blank('output');
  project.writeEditCells([
    { col: 5, row: 5, attrs: { char: '█', fg: '#ff0000', bg: '#ff0000' } },
    { col: 6, row: 5, attrs: { char: '█', fg: '#00ff00', bg: '#00ff00' } },
  ]);
  project.commitEdit();
  stroke(blur, ctx, { x: 5.5, y: 11 }, { x: 6.5, y: 11 });
  expect(project.editCellAt(5, 5)).toBeUndefined();
  expect(project.editCellAt(6, 5)).toBeUndefined();
  expect(paintAt(project, 5, 10)[1]).toBeGreaterThan(0); // the green beside it came in
  expect(paintAt(project, 6, 10)[0]).toBeGreaterThan(0);
  expect(alphaAt(project, 5, 10)).toBeLessThan(1);       // faded into the clear above and beside
  expect(alphaAt(project, 4, 10)).toBeGreaterThan(0);
  expect(project.editCellAt(4, 5)).toBeUndefined();      // what spread there is paint, not a cell
  project.undo();
  expect(project.editCellAt(5, 5)).toEqual({ char: '█', fg: '#ff0000', bg: '#ff0000' });
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
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: '▀', fg: '#ffffff', fgIndex: 231, bg: '#000000', bgIndex: 16 } }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 }); // Midtones: its white half and black half stay
  expect(project.editCellAt(5, 5)).toEqual({ char: '▀', fg: '#ffffff', fgIndex: 231, bg: '#000000', bgIndex: 16 });
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

test('ANSI view: on a drawing layer Retouch works pixel by pixel, as the Brush paints: one half of a cell, the other left', async () => {
  const { project, workspace, ctx } = await blank('output');
  paintGray(project);
  workspace.retouchSize = 1;
  stroke(dodge, ctx, { x: 5.5, y: 10.5 });
  expect(paintAt(project, 5, 10)[0]).toBeGreaterThan(128);
  expect(paintAt(project, 5, 11)).toEqual([128, 128, 128]);
});

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

// In the PIXEL view a stroke unlocks what it reaches: a cell the layer holds (typed, or one a merge wrote exactly) and
// a character pinned on the base go, their two halves becoming paint (the base's pixels) in the colors they showed, and
// the stroke works on those as on any paint. Text you want kept goes on a layer of its own.
test('pixel view: on a drawing layer Blur unlocks the cells it reaches into paint and fades their edge; undo brings them back', async () => {
  const { project, workspace, ctx } = await blank();
  const cells = [];
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) cells.push({ col, row, attrs: { char: '░', fg: '#ff0000', bg: '#ff0000' } });
  project.writeEditCells(cells);
  project.commitEdit();
  workspace.retouchSize = 6;
  stroke(blur, ctx, { x: 10, y: 10.5 });
  expect(project.editCellAt(9, 5)).toBeUndefined(); // reached: unlocked
  expect(project.editCellAt(2, 2)).toBeDefined();   // out of reach: still a cell
  expect(paintAt(project, 9, 10)).toEqual([255, 0, 0]);
  expect(alphaAt(project, 9, 10)).toBeLessThan(1);  // faded into the clear beside it
  expect(alphaAt(project, 9, 10)).toBeGreaterThan(0.5);
  expect(project.editCellAt(7, 5)).toBeDefined();   // red all around: unchanged, so still a cell
  project.undo();
  expect(project.editCellAt(9, 5)).toEqual({ char: '░', fg: '#ff0000', bg: '#ff0000' });
  expect(project.paintLayer.hasPaint).toBe(false);
});

test('pixel view: a typed letter a stroke reaches becomes paint in the colors it showed, its character gone', async () => {
  const { project, ctx } = await blank();
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: 'A', fg: '#ffffff', bg: '#000080' } }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 });
  expect(project.editCellAt(5, 5)).toBeUndefined();
  const [top] = paintAt(project, 5, 10), [, , blue] = paintAt(project, 5, 11);
  expect(top).toBeGreaterThan(0);  // the letter's white mixed into its blue, lightened
  expect(blue).toBeGreaterThan(0x80);
});

test('pixel view: on the base a pinned character stays, and its two pixels (background over foreground) change', async () => {
  const { project, workspace, ctx } = await blank();
  workspace.pickLayer('base');
  project.writeBaseCells([{ col: 5, row: 5, char: 'A', fg: '#ffffff', bg: '#000080' }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 });
  expect(project.baseRecords.pins.get('5,5')).toBe('A');
  expect(hex2rgb(project.baseColorAt(5, 10)).b).toBeGreaterThan(0x80); // its navy background, lightened
  expect(project.baseColorAt(5, 11)).toBe('#ffffff');                  // its white foreground: Midtones leaves white
  project.undo();
  expect(project.baseColorAt(5, 10)).toBe('#000080');
});

test('ANSI view: Retouch leaves a cell with only a character (the Brush\'s ▄) a cell, and keeps the base\'s pins', async () => {
  const { project, workspace, ctx } = await blank('output');
  project.paintStroke([{ x: 5, y: 10, alpha: 1 }, { x: 5, y: 11, alpha: 1 }], '#ff0000', { blockChars: true });
  project.commitEdit();
  stroke(blur, ctx, { x: 5.5, y: 11 });
  expect(project.editCellAt(5, 5)).toEqual({ char: '▄' });
  expect(alphaAt(project, 5, 10)).toBeLessThan(1); // its paint fades
  workspace.pickLayer('base');
  project.writeBaseCells([{ col: 12, row: 5, char: 'B', fg: '#ffffff', bg: '#000080' }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 12.5, y: 11 });
  expect(project.baseRecords.pins.get('12,5')).toBe('B');
});

test('pixel view: a stroke unlocks a cell once, so its later moves don\'t lay it back over what it already blurred', async () => {
  const { project, workspace, ctx } = await blank();
  const cells = [];
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) cells.push({ col, row, attrs: { char: '░', fg: '#ff0000', bg: '#ff0000' } });
  project.writeEditCells(cells);
  project.commitEdit();
  workspace.retouchSize = 1; // a pixel at a time: the top half of cell 9,5, then its bottom half
  getTool('blur').begin(ctx, { x: 9.5, y: 10.5 }, {});
  const once = alphaAt(project, 9, 10);
  blur.move(ctx, { x: 9.5, y: 11.5 }, { x: 9.5, y: 11.5 });
  blur.end(ctx);
  expect(once).toBeLessThan(1);
  expect(alphaAt(project, 9, 10)).toBe(once);
});

// The report (projects/blur-shape-issue.phosphor): blurred in the ANSI view, a shape merged down kept a hard edge and
// never faded into the clear, while a painted circle beside it did. The merge wrote most of the shape's cells exactly
// (with Layer 1's By shape, paint wouldn't show as the shape did), with colors of their own; the circle's cells are the
// Brush's ▄, with only a character, their colors in paint.
test('the report: in the ANSI view Blur fades a merged shape\'s exact cells into the clear, as it does a painted circle', async () => {
  const { project, workspace } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/blur-shape-issue.phosphor')).arrayBuffer()], 'blur-shape-issue.phosphor'));
  await settle(project);
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  Object.assign(workspace, { retouchSize: 6, retouchStrength: 100, retouchHardness: 50 });
  const ctx = { project, workspace, view: 'output' };
  expect(project.editCellAt(16, 10)?.fg).toBeDefined(); // the shape's left edge: an exact cell
  for (let i = 0; i < 4; i++) stroke(blur, ctx, { x: 16.5, y: 16 }, { x: 16.5, y: 30 });
  expect(project.editCellAt(16, 10)).toBeUndefined();
  expect(alphaAt(project, 16, 20)).toBeGreaterThan(0);
  expect(alphaAt(project, 16, 20)).toBeLessThan(0.9); // faded, as the circle's edge does
  expect(alphaAt(project, 14, 20)).toBeGreaterThan(0); // into the clear beside it
});
