// The Eraser's Hard and Soft: Hard is a square that clears what it covers at once (pixels in the PIXEL view, whole cells
// with their characters in the ANSI view); Soft is round and feathered and takes paint away a little at a time, by its
// Flow, as the Brush lays it, the same in both views. On the base, where erasing is black, Soft lays the black that way.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import eraser from '@/tools/eraser';

const RED = { r: 255, g: 0, b: 0 };

// A 20 x 20 canvas with Layer 1 picked and painted solid red, in the PIXEL view.
async function painted() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.editorTab = 'input';
  workspace.pickLayer('edit');
  const all = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) all.push({ x, y, ...RED, alpha: 1 });
  project.paintEditPixels(all);
  project.commitEdit();
  const ctx = { project, workspace, view: 'input' };
  const click = (x, y, c = ctx) => { eraser.begin(c, { x, y }); eraser.end(c); };
  const alpha = (x, y) => project.paintOf('edit').pixelAt(x, y)?.a ?? 0;
  return { project, workspace, ctx, click, alpha };
}

test('Soft takes paint away a little at a time, round and feathered, more with each pass, until it\'s gone', async () => {
  const { project, workspace, click, alpha } = await painted();
  Object.assign(workspace, { editEraserSize: 6, editEraserSoft: true, editEraserFlow: 50 });
  click(10, 10);
  const once = alpha(10, 10);
  expect(once).toBeGreaterThan(0.5);   // some of it,
  expect(once).toBeLessThan(1);        // not all
  expect(alpha(9, 9)).toBe(once);      // the same all round its middle
  expect(alpha(12, 10)).toBeGreaterThan(once);   // less toward its edge
  expect(alpha(12, 10)).toBeLessThan(1);
  expect(alpha(7, 7)).toBe(1);         // round: the corner of its square is left alone
  expect(alpha(13, 10)).toBe(1);
  click(10, 10);
  expect(alpha(10, 10)).toBeLessThan(once);   // a second pass takes more
  project.undo();                             // each pass is an undo step
  expect(alpha(10, 10)).toBe(once);
  for (let pass = 0; pass < 6; pass++) click(10, 10);
  expect(alpha(10, 10)).toBe(0);              // and enough of them, all of it
  expect(alpha(7, 7)).toBe(1);
});

test('Soft at a low Flow still clears faint paint: every pass takes something', async () => {
  const { workspace, click, alpha } = await painted();
  Object.assign(workspace, { editEraserSize: 6, editEraserSoft: true, editEraserFlow: 1 });
  let before = alpha(10, 10);
  for (let pass = 0; pass < 3; pass++) {
    click(10, 10);
    expect(alpha(10, 10)).toBeLessThan(before);
    before = alpha(10, 10);
  }
});

test('Hard clears its square at once, Soft off or never touched', async () => {
  const { workspace, click, alpha } = await painted();
  expect(workspace.editEraserSoft).toBe(false);   // hard to start
  workspace.editEraserSize = 6;
  click(10, 10);
  expect([alpha(7, 7), alpha(10, 10), alpha(12, 12)]).toEqual([0, 0, 0]);   // the whole square, corners too
  expect([alpha(6, 6), alpha(13, 13)]).toEqual([1, 1]);
});

test('Soft on the base lays black a little at a time; Hard turns it black at once', async () => {
  const { project, workspace, click } = await painted();
  workspace.pickLayer('base');
  project.beginEdit();
  const all = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) all.push({ x, y, hex: '#ff0000' });
  project.writeBase(all);
  project.commitEdit();
  Object.assign(workspace, { editEraserSize: 6, editEraserSoft: true, editEraserFlow: 50 });
  const red = (x, y) => parseInt(project.baseColorAt(x, y).slice(1, 3), 16);
  click(10, 10);
  expect(red(10, 10)).toBeLessThan(255);
  expect(red(10, 10)).toBeGreaterThan(100);
  expect(project.baseColorAt(7, 7)).toBe('#ff0000');
  const once = red(10, 10);
  click(10, 10);
  expect(red(10, 10)).toBeLessThan(once);
  workspace.editEraserSoft = false;
  click(10, 10);
  expect(project.baseColorAt(10, 10)).toBe('#000000');
  expect(project.baseColorAt(7, 7)).toBe('#000000');
});

test('Hard in the ANSI view erases whole cells, characters with them', async () => {
  const { project, workspace, ctx, alpha } = await painted();
  project.typeAt(10, 5, 'A', { fg: '#ffffff' });
  project.commitEdit();
  workspace.editEraserCells = 1;
  const ansi = { ...ctx, view: 'output' };
  eraser.begin(ansi, { x: 10.5, y: 10.5 });   // cell (10, 5): grid pixels (10, 10) and (10, 11)
  eraser.end(ansi);
  expect([alpha(10, 10), alpha(10, 11)]).toEqual([0, 0]);
  expect([alpha(9, 10), alpha(11, 10), alpha(10, 9), alpha(10, 12)]).toEqual([1, 1, 1, 1]);
  expect(project.editCellAt(10, 5)).toBeUndefined();
});

// Soft is the same eraser in both views, as the Brush is the same brush: round, in grid pixels at the PIXEL view's Size,
// taking paint away by its Flow. It works on paint, so a character someone typed stays, as it does under the Eraser in
// the PIXEL view; Hard is what takes characters.
test('Soft in the ANSI view takes paint away as it does in PIXEL, and leaves typed characters where they are', async () => {
  const { project, workspace, ctx, alpha } = await painted();
  project.typeAt(3, 2, 'A', { fg: '#ffffff' });   // typing clears the paint in its cell: the next cell along still has it
  project.commitEdit();
  Object.assign(workspace, { editEraserSize: 6, editEraserCells: 1, editEraserSoft: true, editEraserFlow: 50 });
  const ansi = { ...ctx, view: 'output' };
  const click = (x, y) => { eraser.begin(ansi, { x, y }); eraser.end(ansi); };
  click(10, 10);
  const once = alpha(10, 10);
  expect(once).toBeGreaterThan(0.5);
  expect(once).toBeLessThan(1);
  expect(alpha(12, 10)).toBeGreaterThan(once);   // feathered
  expect(alpha(7, 7)).toBe(1);                   // round, and six pixels across: not one cell
  click(10, 10);
  expect(alpha(10, 10)).toBeLessThan(once);
  click(4, 5);   // over the typed A, cell (3, 2), and the paint beside it
  expect(project.editCellAt(3, 2)?.char).toBe('A');
  expect(alpha(4, 5)).toBeLessThan(1);
});

test('the options row: Hard or Soft in both views; Soft brings Flow and the PIXEL Size to the ANSI view, and its outline is a circle', async () => {
  const { workspace } = await painted();
  const offered = (view) => {
    workspace.editorTab = view;
    return eraser.options.filter((o) => (!o.views || o.views.includes(view)) && (!o.when || o.when(workspace))).map((o) => o.key);
  };
  expect(offered('input')).toEqual(['editEraserSize', 'editEraserSoft']);
  expect(offered('output')).toEqual(['editEraserCells', 'editEraserSoft']);
  expect([eraser.preview.soft(workspace, 'input'), eraser.preview.soft(workspace, 'output')]).toEqual([false, false]);
  expect([eraser.preview.size(workspace, 'input'), eraser.preview.size(workspace, 'output')]).toEqual([5, 1]);
  workspace.editEraserSoft = true;
  expect(offered('input')).toEqual(['editEraserSize', 'editEraserSoft', 'editEraserFlow']);
  expect(offered('output')).toEqual(['editEraserSize', 'editEraserSoft', 'editEraserFlow']);
  expect([eraser.preview.soft(workspace, 'input'), eraser.preview.soft(workspace, 'output')]).toEqual([true, true]);
  expect([eraser.preview.size(workspace, 'input'), eraser.preview.size(workspace, 'output')]).toEqual([5, 5]);   // grid pixels in both
});
