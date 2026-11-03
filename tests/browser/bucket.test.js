// The Paint Bucket: drawn text and box lines are walls the fill stops at and never covers.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import shapes from '@/tools/shapes';
import bucket from '@/tools/bucket';

async function blank(cols = 30, rows = 30) {
  const { project, workspace } = await createTestApp();
  project.cols = cols;
  project.rows = rows;
  await project.setBlankCanvas();
  project.render();
  await settle(project);
  workspace.editorTab = 'output';
  return { project, workspace };
}

const ev = { stopPropagation() {} };

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

// Gradients: a drag draws the line, the release fills the bucket's area from FG at the press to BG.
const GRADIENT = { editFgColor: '#ff0000', editBgColor: '#0000ff', editFgNone: false, editBgNone: false };
function dragLine(ctx, from, to) {
  const started = bucket.begin(ctx, from, ev);
  if (started) {
    bucket.move(ctx, from, to);
    bucket.end(ctx);
  }
  return started;
}
const paintAt = (project, x, y) => { const p = project.paintLayer?.pixelAt(x, y); return p ? [p.r, p.g, p.b] : null; };

test('Linear, Fill: Normal: each grid pixel its blend, FG at the press and BG past the release, as one undo step', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  project.clearHistory();
  Object.assign(workspace, GRADIENT, { bucketGradient: 'linear' });
  expect(dragLine(ctx, { x: 0, y: 15 }, { x: 30, y: 15 })).toBe(true);
  expect(workspace.shapeDrag).toBeNull();
  await settle(project);
  expect(paintAt(project, 0, 3)).toEqual([251, 0, 4]);
  expect(paintAt(project, 29, 50)).toEqual([4, 0, 251]);
  expect(paintAt(project, 15, 0)).toEqual([123, 0, 132]); // square to the line: every row alike
  expect(paintAt(project, 15, 59)).toEqual([123, 0, 132]);
  project.undo();
  expect(project.canUndo).toBe(false);
  expect(paintAt(project, 15, 0)).toBeNull();
});

test('Spherical, PIXEL tab: the press is the center, the line\'s length the radius', async () => {
  const { project, workspace } = await blank(30, 60);
  workspace.editorTab = 'input';
  const ctx = { project, workspace, view: 'input' };
  Object.assign(workspace, GRADIENT, { bucketGradient: 'spherical' });
  dragLine(ctx, { x: 15.5, y: 30.5 }, { x: 15.5, y: 40.5 });
  await settle(project);
  expect(paintAt(project, 15, 30)).toEqual([255, 0, 0]);
  expect(paintAt(project, 20, 30)).toEqual([128, 0, 128]); // halfway out, any direction
  expect(paintAt(project, 15, 25)).toEqual([128, 0, 128]);
  expect(paintAt(project, 0, 0)).toEqual([0, 0, 255]);     // past the radius
});

test('Shift snaps the line to 45°', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, GRADIENT, { bucketGradient: 'linear', isShiftPressed: true });
  bucket.begin(ctx, { x: 0, y: 10 }, ev);
  bucket.move(ctx, { x: 0, y: 10 }, { x: 20, y: 14 });
  expect(workspace.shapeDrag).toEqual({ from: { x: 0, y: 10 }, to: { x: 20, y: 10 }, line: true });
  bucket.end(ctx);
  workspace.isShiftPressed = false;
  await settle(project);
  expect(paintAt(project, 10, 0)).toEqual(paintAt(project, 10, 59)); // straight across: every row alike
});

test('Linear, Fill: Cells: blend characters in the two colors only, inside the selection, over the paint', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  project.paintStroke([{ x: 3, y: 10, alpha: 1 }], '#00ff00');
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, GRADIENT, { bucketGradient: 'linear', bucketFillWith: 'cells', bucketMatch: { fg: true, bg: true, char: false }, editFillTolerance: 100, selection: { c0: 0, r0: 5, c1: 29, r1: 5 } });
  expect(dragLine(ctx, { x: 4, y: 11 }, { x: 24, y: 11 })).toBe(true);
  await settle(project);
  const line = row(project, 5, 0, 29);
  expect(line.slice(0, 4)).toBe('████');
  expect(line.slice(25)).toBe('     ');
  for (const ch of '▓▒░') expect(line).toContain(ch);
  for (let col = 0; col < 30; col++) {
    const cell = project.cells[cellIndex(col, 5, project.cols)];
    expect([cell.fg.hex, cell.bg.hex]).toEqual(['#ff0000', '#0000ff']);
  }
  expect(project.cellHasPaint(3, 5)).toBe(false);
  expect(project.editCellAt(0, 4)).toBeFalsy(); // outside the selection
  expect(project.editCellAt(0, 6)).toBeFalsy();
});

test('a click without a drag fills solid FG; a drag with BG None fills nothing and says why', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, GRADIENT, { bucketGradient: 'linear' });
  dragLine(ctx, { x: 5.2, y: 5.2 }, { x: 5.7, y: 5.6 });
  await settle(project);
  expect(paintAt(project, 20, 40)).toEqual([255, 0, 0]);

  const { toastMessage } = await import('@/composables/useToast');
  project.clearHistory();
  workspace.editFgColor = '#00ff00';
  workspace.editBgNone = true;
  dragLine(ctx, { x: 0, y: 0 }, { x: 20, y: 0 });
  await settle(project);
  expect(project.canUndo).toBe(false);
  expect(paintAt(project, 20, 40)).toEqual([255, 0, 0]);
  expect(toastMessage.value).toMatch(/needs both a foreground and a background color/);
});

test('a press outside the selection starts no line', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, GRADIENT, { bucketGradient: 'spherical', selection: { c0: 0, r0: 0, c1: 4, r1: 4 } });
  expect(bucket.begin(ctx, { x: 20, y: 20 }, ev)).toBe(false);
  expect(workspace.shapeDrag).toBeNull();
  workspace.bucketFillWith = 'cells';
  expect(bucket.begin(ctx, { x: 20, y: 20 }, ev)).toBe(false);
});

test('typed text stays a wall, and with Animate on the gradient lands on the frame showing', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  project.setAnimate(true);
  project.addFrame('blank');
  project.showFrame(1);
  project.typeAt(10, 10, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, GRADIENT, { bucketGradient: 'linear' });
  dragLine(ctx, { x: 0, y: 0 }, { x: 30, y: 0 });
  await settle(project);
  expect(project.cellHasPaint(10, 10)).toBe(false);
  expect(project.cellHasPaint(20, 20)).toBe(true);
  project.showFrame(0);
  await settle(project);
  expect(project.cellHasPaint(20, 20)).toBe(false);
});
