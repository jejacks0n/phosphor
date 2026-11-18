// The Paint Bucket: drawn text and box lines are walls the fill stops at and never covers.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import shapes from '@/tools/shapes';
import bucket from '@/tools/bucket';
import gradient from '@/tools/gradient';

async function blank(cols = 30, rows = 30) {
  const { project, workspace } = await createTestApp();
  project.cols = cols;
  project.rows = rows;
  await project.setBlankCanvas({ withLayer: true });
  project.render();
  await settle(project);
  workspace.editorTab = 'output';
  return { project, workspace };
}

const ev = { stopPropagation() {} };

// docs/model.md R1: only a character of someone's own is a wall. Colors only's ▄ paint blocks and the cells Merge down
// froze are paint, which a fill crosses as it crosses any paint (within its Tolerance; here every color is within it).
test('R1: a fill crosses a Colors only line and a frozen cell in Color ASCII; a typed line still stops it', async () => {
  const { project, workspace } = await blank(20, 20);
  project.renderStyle = 'colorAscii';
  await settle(project);
  const column = (col) => Array.from({ length: 20 }, (_, y) => ({ x: col, y, r: 255, g: 255, b: 255, alpha: 1 }));
  project.paintEditPixels([...column(5), ...column(8)]);
  project.writeEditCells(Array.from({ length: 10 }, (_, row) => ({ col: 5, row, attrs: { char: '▄' } }))); // as Colors only leaves them
  project.writeEditCells(Array.from({ length: 10 }, (_, row) => ({ col: 12, row, attrs: { char: '|', fg: '#ffffff', bg: '#000000' } })));
  project.commitEdit();
  project.setEditCells(new Map([...project.editCells, ...Array.from({ length: 10 }, (_, row) => [`8,${row}`, Object.freeze({ char: '#', fg: '#ffffff', bg: '#000000', frozen: true })])]), Array.from({ length: 10 }, (_, row) => `8,${row}`));
  project.commitEdit();
  project.render();
  await settle(project);
  Object.assign(workspace, { editFgColor: '#ff0000', editFillTolerance: 100, editFillContiguous: true });
  bucket.begin({ project, workspace, view: 'output' }, { x: 2.5, y: 10.5 }, ev);
  await settle(project);
  expect(project.paintLayer.colorAt(6, 10)).not.toBeNull();  // past the Colors only line
  expect(project.paintLayer.colorAt(10, 10)).not.toBeNull(); // past the frozen cells
  expect(project.paintLayer.colorAt(14, 10)).toBeNull();     // not past the typed line
});

test('a fill inside a box drawn with Shapes (Double) stays inside it, and the frame keeps its character', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  workspace.shapeDrawWith = 'double';
  workspace.editBgNone = true;
  workspace.editFgColor = '#ffffff';
  shapes.begin(ctx, { x: 5.5, y: 10.5 });
  shapes.move(ctx, { x: 5.5, y: 10.5 }, { x: 20.5, y: 30.5 });
  shapes.end(ctx);
  expect(project.cells[cellIndex(5, 5, project.cols)].char).toBe('╔');
  await settle(project);

  workspace.editFgColor = '#ff0000';
  bucket.begin(ctx, { x: 10.5, y: 20.5 }, ev);
  await settle(project);
  expect(project.paintLayer.colorAt(10, 20)).not.toBeNull(); // inside
  expect(project.paintLayer.colorAt(0, 0)).toBeNull();       // outside
  expect(project.cellHasPaint(5, 5)).toBe(false);            // the frame
});

test('a fill on the background leaves typed text readable', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  project.typeAt(2, 2, 'A', { fg: '#ffffff', bg: '#000000' });
  project.typeAt(4, 2, '漢', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  workspace.editFgColor = '#ff0000';
  bucket.begin(ctx, { x: 20.5, y: 20.5 }, ev);
  await settle(project);
  for (const col of [2, 4, 5]) expect(project.cellHasPaint(col, 2)).toBe(false);
  const cell = project.cells[cellIndex(2, 2, project.cols)];
  expect(cell.char).toBe('A');
  expect(cell.fg.hex).not.toBe(cell.bg.hex);
});

test('a box hidden under paint of one color isn\'t a wall: the fill covers what you see', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, { shapeKind: 'rect', shapeDrawWith: 'single', editBgNone: true, editFgColor: '#ffffff' });
  shapes.begin(ctx, { x: 8.5, y: 8.5 });
  shapes.move(ctx, { x: 8.5, y: 8.5 }, { x: 20.5, y: 20.5 });
  shapes.end(ctx); // cells 8..20, rows 4..10
  const pixels = [];
  for (let y = 4; y < 26; y++) for (let x = 4; x < 26; x++) pixels.push({ x, y, alpha: 1 });
  project.paintStroke(pixels, '#00aa00'); // over the whole box: its lines are green on green
  project.commitEdit();
  await settle(project);

  workspace.editFgColor = '#ff0000';
  bucket.begin(ctx, { x: 5.5, y: 5.5 }, ev);
  await settle(project);
  expect(project.paintLayer.colorAt(14, 14)).toEqual({ r: 255, g: 0, b: 0 }); // inside the hidden box
});

// Cells: the fill finds the cells that match the one clicked (Match) and sets what Set lights.
const RED = { fg: '#ff0000', bg: '#000000' }, BLUE = { fg: '#0000ff', bg: '#000000' };
const row = (project, r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, k) => project.cells[cellIndex(c0 + k, r, project.cols)].char).join('');

test('Cells fills the matching cells it touches with what Set lights', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  [...'aab'].forEach((ch, k) => project.typeAt(2 + k, 2, ch, RED));
  project.typeAt(2, 3, 'a', BLUE);
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, { bucketFillWith: 'cells', bucketMatch: { fg: true, bg: false, char: true }, bucketSet: { fg: false, bg: false, char: true }, activeChar: '#' });
  bucket.begin(ctx, { x: 2.5, y: 4.5 }, ev);
  await settle(project);
  expect(row(project, 2, 2, 4)).toBe('##b');
  expect(row(project, 3, 2, 2)).toBe('a');

  Object.assign(workspace, { editFillContiguous: false, bucketMatch: { fg: false, bg: false, char: true }, bucketSet: { fg: true, bg: false, char: false }, editFgColor: '#00ff00', editFgNone: false });
  bucket.begin(ctx, { x: 4.5, y: 4.5 }, ev); // the b: every b, anywhere
  project.typeAt(10, 10, 'b', RED);
  project.commitEdit();
  bucket.begin(ctx, { x: 2.5, y: 6.5 }, ev); // the blue a: every a
  await settle(project);
  expect(row(project, 3, 2, 2)).toBe('a');
  expect(project.cells[cellIndex(2, 3, project.cols)].fg.hex).toBe('#00ff00');
  expect(project.cells[cellIndex(4, 2, project.cols)].fg.hex).toBe('#00ff00');
  expect(project.cells[cellIndex(10, 10, project.cols)].fg.hex).toBe('#ff0000'); // typed after that fill
});

test('Cells stays inside the selection', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  [...'aaaa'].forEach((ch, k) => project.typeAt(k, 2, ch, RED));
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, { bucketFillWith: 'cells', bucketSet: { fg: false, bg: false, char: true }, activeChar: '#', selection: { c0: 0, r0: 2, c1: 1, r1: 2 } });
  bucket.begin(ctx, { x: 0.5, y: 4.5 }, ev);
  await settle(project);
  expect(row(project, 2, 0, 3)).toBe('##aa');
});

// All layers, the Paint Bucket's and the Gradient's (they share a fill's area): on, as it starts, a fill reads what every
// shown layer shows together; off, the layer in use alone, where clear is a color of its own. Either way it fills the
// layer in use.
const BLUE_PAINT = { r: 0, g: 0, b: 255, alpha: 1 };
const ringPixels = (x0, y0, x1, y1) => {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y, ...BLUE_PAINT });
  return out;
};

// A 20 x 20 canvas whose base is white on the left half and black on the right, with a blue outline painted on Layer 1
// (pixels 4 to 15 each way) and Layer 1 picked, in the PIXEL view.
async function outlined() {
  const { project, workspace } = await blank(20, 20);
  workspace.pickLayer('base');
  project.beginEdit();
  project.writeBase(Array.from({ length: 200 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10), hex: '#ffffff' })));
  project.commitEdit();
  workspace.pickLayer('edit');
  project.paintEditPixels(ringPixels(4, 4, 15, 15));
  project.commitEdit();
  project.render();
  await settle(project);
  workspace.editorTab = 'input';
  Object.assign(workspace, { editFgColor: '#ff0000', editFgNone: false, editFillTolerance: 10, editFillContiguous: true, editFillFeather: 0 });
  const paint = (x, y) => { const p = project.paintLayer.pixelAt(x, y); return p ? [p.r, p.g, p.b] : null; };
  return { project, workspace, ctx: { project, workspace, view: 'input' }, paint };
}
const RED_PAINT = [255, 0, 0], BLUE_RGB = [0, 0, 255];

test('with All layers off a fill reads the layer in use alone: inside a painted outline it floods the clear inside, whatever shows under it', async () => {
  const { project, workspace, ctx, paint } = await outlined();
  expect(workspace.editFillAllLayers).toBe(true); // on to start: what you see
  bucket.begin(ctx, { x: 6.5, y: 10.5 }, ev);
  await settle(project);
  expect(paint(6, 10)).toEqual(RED_PAINT);
  expect(paint(13, 10)).toBeNull(); // the black half under the outline is another color: the fill stopped at it
  project.undo();

  workspace.editFillAllLayers = false;
  bucket.begin(ctx, { x: 6.5, y: 10.5 }, ev);
  await settle(project);
  expect([paint(5, 5), paint(6, 10), paint(13, 10), paint(14, 14)]).toEqual([RED_PAINT, RED_PAINT, RED_PAINT, RED_PAINT]); // all of the inside
  expect([paint(4, 4), paint(15, 10)]).toEqual([BLUE_RGB, BLUE_RGB]); // the outline is its wall,
  expect([paint(2, 2), paint(17, 10)]).toEqual([null, null]); // and outside it nothing
  project.undo();
  bucket.begin(ctx, { x: 1.5, y: 1.5 }, ev); // outside the outline: all the clear round it, both halves of the base
  await settle(project);
  expect([paint(2, 2), paint(17, 17), paint(6, 10)]).toEqual([RED_PAINT, RED_PAINT, null]);
});

test('with All layers off a click on the layer\'s paint fills that paint, not the same color on another layer', async () => {
  const { project, workspace, ctx, paint } = await outlined();
  workspace.pickLayer('base');
  project.beginEdit();
  project.writeBase([{ x: 17, y: 17, hex: '#0000ff' }]); // the outline's blue, in the picture
  project.commitEdit();
  workspace.pickLayer('edit');
  project.render();
  await settle(project);
  workspace.editFillContiguous = false; // every match, anywhere
  bucket.begin(ctx, { x: 4.5, y: 4.5 }, ev);
  await settle(project);
  expect([paint(4, 4), paint(17, 17)]).toEqual([RED_PAINT, RED_PAINT]); // on: the blue that shows, the picture's too
  project.undo();
  workspace.editFillAllLayers = false;
  bucket.begin(ctx, { x: 4.5, y: 4.5 }, ev);
  await settle(project);
  expect([paint(4, 4), paint(15, 15), paint(17, 17), paint(10, 10)]).toEqual([RED_PAINT, RED_PAINT, null, null]); // off: the layer's own blue
});

test('with All layers off and the base picked, a fill reads the picture alone: paint on a layer above neither stops it nor counts', async () => {
  const { project, workspace } = await blank(20, 20);
  project.paintEditPixels(Array.from({ length: 20 }, (_, x) => ({ x, y: 10, r: 255, g: 0, b: 0, alpha: 1 }))); // a red line across Layer 1
  project.commitEdit();
  workspace.pickLayer('base');
  project.render();
  await settle(project);
  workspace.editorTab = 'input';
  Object.assign(workspace, { editFgColor: '#00ff00', editFgNone: false, editFillTolerance: 10, editFillContiguous: true, editFillFeather: 0 });
  const ctx = { project, workspace, view: 'input' };
  bucket.begin(ctx, { x: 5.5, y: 5.5 }, ev);
  await settle(project);
  expect([project.baseColorAt(5, 5), project.baseColorAt(5, 15)]).toEqual(['#00ff00', '#000000']); // on: the line that shows stops it
  project.undo();
  await settle(project); // the picture is read as last drawn
  workspace.editFillAllLayers = false;
  bucket.begin(ctx, { x: 5.5, y: 5.5 }, ev);
  await settle(project);
  expect([project.baseColorAt(5, 5), project.baseColorAt(5, 10), project.baseColorAt(5, 15)]).toEqual(['#00ff00', '#00ff00', '#00ff00']);
});

test('with All layers off, Cells reads the layer\'s own cells: inside a typed box it fills the empty cells, whatever shows under them', async () => {
  const { project, workspace } = await blank(20, 20);
  workspace.pickLayer('base');
  project.beginEdit();
  project.writeBase(Array.from({ length: 200 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10), hex: '#ffffff' })));
  project.commitEdit();
  workspace.pickLayer('edit');
  for (let row = 2; row <= 7; row++) for (let col = 3; col <= 16; col++) if (row === 2 || row === 7 || col === 3 || col === 16) project.typeAt(col, row, '#', BLUE);
  project.commitEdit();
  project.render();
  await settle(project);
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, { bucketFillWith: 'cells', bucketSet: { fg: false, bg: false, char: true }, activeChar: 'x', editFillContiguous: true });
  const typed = (col, row) => project.editCellAt(col, row)?.char;
  bucket.begin(ctx, { x: 5.5, y: 9.5 }, ev); // cell (5, 4), over the white half
  await settle(project);
  expect([typed(5, 4), typed(12, 4)]).toEqual(['x', undefined]); // on: the cells under the box differ, left from right
  project.undo();
  workspace.editFillAllLayers = false;
  bucket.begin(ctx, { x: 5.5, y: 9.5 }, ev);
  await settle(project);
  expect([typed(4, 3), typed(5, 4), typed(12, 4), typed(15, 6)]).toEqual(['x', 'x', 'x', 'x']); // off: every empty cell inside
  expect([typed(3, 4), typed(16, 2), typed(1, 1), typed(18, 8)]).toEqual(['#', '#', undefined, undefined]); // the box is its wall
});

test('the Gradient fills the same area: All layers is on its row too, and off it reads the layer alone', async () => {
  expect([bucket, gradient].map((tool) => tool.options.some((o) => o.key === 'editFillAllLayers' && o.type === 'checkbox'))).toEqual([true, true]);
  const { project, workspace, ctx, paint } = await outlined();
  Object.assign(workspace, { editBgColor: '#00ff00', editBgNone: false, editFillAllLayers: false });
  gradient.begin(ctx, { x: 6.5, y: 10.5 }, ev);
  gradient.move(ctx, { x: 6.5, y: 10.5 }, { x: 13.5, y: 10.5 });
  gradient.end(ctx);
  await settle(project);
  expect([paint(5, 5), paint(13, 10), paint(14, 14)].every(Boolean)).toBe(true); // the whole inside, the black half too
  expect([paint(4, 4), paint(2, 2)]).toEqual([BLUE_RGB, null]);
});
