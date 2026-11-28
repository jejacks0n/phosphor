// Resize a selection (#208, the Select tool's handles): its pixels (paint, the base's pixels and colors) drawn to a new
// size, landing as Rotate's do; off while it has characters; it floats like a move, and the scale and the moves together
// are one undo step.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import select, { handlesShown } from '@/tools/select';
import { combine, selects } from '@/lib/selectionMask';

const ATTRS = { fg: '#ffffff', bg: '#000000' };
const EDIT = ['edit'], BOTH = ['base', 'edit'];
const RED = '#ff0000';

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  workspace.editorTab = 'output';
  const paint = (x, y) => (project.paintLayer?.pixelAt(x, y)?.a ? project.rawColorAt(x, y) : null);
  const block = (x0, y0, w, h, color = RED) => {
    const points = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) points.push({ x, y, alpha: 1 });
    project.paintStroke(points, color);
    project.commitEdit();
  };
  const char = (col, row) => project.cells[cellIndex(col, row, project.cols)].char;
  return { project, workspace, paint, block, char };
}

test('paint scales to the new size from the top left corner it is given, where it was is given back, and it is one undo step', async () => {
  const { project, paint, block } = await scene();
  block(2, 4, 2, 2); // cells (2, 2) and (3, 2)
  const version = project.history.version;
  expect(project.scaleSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT, { c0: 4, r0: 3, w: 4, px: 4 })).toEqual({ c0: 4, r0: 3, c1: 7, r1: 4 });
  for (let y = 6; y < 10; y++) for (let x = 4; x < 8; x++) expect(paint(x, y)).toBe(RED);
  expect([paint(2, 4), paint(3, 5), paint(8, 6), paint(4, 10)]).toEqual([null, null, null, null]);
  expect(project.history.version).toBe(version + 1);
  project.undo(); await settle(project);
  expect([paint(2, 4), paint(3, 5), paint(4, 6)]).toEqual([RED, RED, null]);
});

test("the picture's pixels scale hard-edged on the base, each new pixel the one under its middle", async () => {
  const { project } = await scene();
  const rect = { c0: 4, r0: 4, c1: 5, r1: 4 }; // pixels x 4-5, y 8-9
  const was = (x, y) => project.baseColorAt(x, y);
  const before = [[4, 8], [5, 8], [4, 9], [5, 9]].map(([x, y]) => was(x, y));
  project.scaleSelection(rect, ['base'], { c0: 4, r0: 4, w: 4, px: 4 });
  await settle(project);
  const after = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) after.push(project.baseColorAt(4 + x, 8 + y));
  const want = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) want.push(before[2 * Math.floor(y / 2) + Math.floor(x / 2)]);
  expect(after).toEqual(want);
});

test('a scaled run, moved and scaled back to its own size, is exact: always scaled from the block it lifted; all of it is one undo step', async () => {
  const { project, paint, block } = await scene();
  block(2, 4, 1, 2, RED);
  block(3, 4, 1, 2, '#0000ff');
  let rect = project.scaleSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT, { c0: 2, r0: 2, w: 1, px: 2 }); // squeezed to one cell
  expect(rect).toEqual({ c0: 2, r0: 2, c1: 2, r1: 2 });
  rect = project.floatSelection(rect, EDIT, 5, 1);
  project.scaleSelection(rect, EDIT, { c0: 7, r0: 3, w: 2, px: 2 });
  await settle(project);
  expect([paint(7, 6), paint(8, 6), paint(7, 7), paint(8, 7)]).toEqual([RED, '#0000ff', RED, '#0000ff']);
  expect([paint(2, 4), paint(3, 4)]).toEqual([null, null]);
  project.undo(); await settle(project);
  expect([paint(2, 4), paint(3, 4), paint(7, 6)]).toEqual([RED, '#0000ff', null]);
});

test("Resize is off while the selection holds characters, on the layers it reaches, and the handles don't show; a Half-block's ▄ goes with its paint", async () => {
  const { project, workspace, char } = await scene();
  project.typeAt(2, 2, 'A', ATTRS);
  project.commitEdit();
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 3, r1: 2 };
  expect(handlesShown(project, workspace)).toBe(false);
  expect(project.scaleSelection(workspace.selection, EDIT, { c0: 2, r0: 2, w: 4, px: 4 })).toEqual({ c0: 2, r0: 2, c1: 3, r1: 2 });
  expect(char(2, 2)).toBe('A');

  project.paintStroke([{ x: 6, y: 4, alpha: 1 }], RED, { blockChars: true }); // the top half of cell (6, 2): a ▄
  project.commitEdit();
  workspace.selection = { c0: 6, r0: 2, c1: 6, r1: 2 };
  expect(handlesShown(project, workspace)).toBe(true);
  project.scaleSelection(workspace.selection, BOTH, { c0: 6, r0: 2, w: 2, px: 4 }); // its top pixel, doubled: the top row
  expect([project.editCellAt(6, 2)?.char, project.editCellAt(7, 2)?.char, project.editCellAt(6, 3)]).toEqual(['▄', '▄', undefined]);
  workspace.selectionOffset = { dc: 1, dr: 0 }; // an outline dragged: no handles
  expect(handlesShown(project, workspace)).toBe(false);
  workspace.selectionOffset = null;
  workspace.setActiveTool('wand');
  expect(handlesShown(project, workspace)).toBe(false);
});

// docs/model.md R3: a frozen cell's pin belongs to the paint it stood over; Resize draws the paint anew, and the pin goes.
test('R3: a frozen cell in a resized block goes with the resize; its paint scales as any paint', async () => {
  const { project, paint, block } = await scene();
  block(2, 4, 2, 2);
  project.setEditCells(new Map([...project.editCells, ['2,2', Object.freeze({ char: '%', fg: RED, bg: RED, frozen: true })]]), ['2,2']);
  project.commitEdit();
  project.render();
  await settle(project);
  expect(project.hasCharacters({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT)).toBe(false);
  project.scaleSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT, { c0: 2, r0: 2, w: 4, px: 4 });
  expect([...project.editCells.values()].some((entry) => entry.frozen)).toBe(false);
  expect([paint(2, 4), paint(5, 7)]).toEqual([RED, RED]);
});

test("a masked selection scales with its mask: what it left out stays out, and what's under there shows", async () => {
  const { project, paint, block } = await scene();
  block(2, 4, 2, 2); // cells (2, 2) and (3, 2)
  block(3, 6, 1, 2, '#00ff00'); // cell (3, 3)
  block(2, 10, 1, 2, '#ffff00'); // cell (2, 5), under where the left-out corner lands
  const sel = combine({ c0: 2, r0: 2, c1: 3, r1: 2 }, { c0: 3, r0: 3, c1: 3, r1: 3 }, 'add', project.cols, project.rows);
  const landed = project.scaleSelection(sel, EDIT, { c0: 2, r0: 2, w: 4, px: 8 });
  expect([landed.c0, landed.r0, landed.c1, landed.r1]).toEqual([2, 2, 5, 5]);
  expect([selects(landed, 2, 2), selects(landed, 5, 3), selects(landed, 4, 5), selects(landed, 2, 4), selects(landed, 3, 5)]).toEqual([true, true, true, false, false]);
  expect([paint(2, 4), paint(5, 7), paint(4, 8), paint(5, 11)]).toEqual([RED, RED, '#00ff00', '#00ff00']);
  expect(paint(2, 10)).toBe('#ffff00');
});

test('the handles: a corner dragged resizes, Shift keeps the shape, the PIXEL view goes by pixel rows; the pointer shows the way', async () => {
  const { project, workspace, paint, block } = await scene();
  block(2, 4, 2, 2);
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 3, r1: 2 };
  const ctx = { project, workspace, view: 'output', unit: null };
  const drag = (from, to, shift = false) => {
    workspace.isShiftPressed = shift;
    select.begin(ctx, from, {});
    select.move(ctx, from, to);
    select.end(ctx);
    workspace.isShiftPressed = false;
  };
  expect(select.cursor(ctx, { x: 4, y: 6 })).toBe('nwse-resize'); // the bottom right corner
  expect(select.cursor(ctx, { x: 3, y: 4 })).toBe('ns-resize'); // the top's middle
  drag({ x: 4, y: 6 }, { x: 6, y: 10 }); // two cells across and down
  expect(workspace.selection).toEqual({ c0: 2, r0: 2, c1: 5, r1: 4 });
  expect(paint(5, 9)).toBe(RED);
  project.undo(); await settle(project);
  workspace.selection = { c0: 2, r0: 2, c1: 3, r1: 2 };
  drag({ x: 4, y: 6 }, { x: 8, y: 7 }, true); // Shift: twice as wide is twice as tall
  expect(workspace.selection).toEqual({ c0: 2, r0: 2, c1: 7, r1: 4 });
  project.undo(); await settle(project);

  workspace.selection = { c0: 2, r0: 2, c1: 3, r1: 2 };
  ctx.view = 'input'; // the PIXEL view: down by one pixel row
  drag({ x: 3, y: 6 }, { x: 3, y: 9 });
  expect(workspace.selection).toEqual({ c0: 2, r0: 2, c1: 3, r1: 4 }); // 5 pixel rows: two cells and the top half of a third
  expect([paint(2, 8), paint(3, 8), paint(2, 9)]).toEqual([RED, RED, null]);
});

test("at a real zoom a one-cell selection still moves from its middle and its outline from its border: a handle's reach is at most a quarter of the box; a finger's is farther", async () => {
  const { project, workspace, paint, block } = await scene();
  block(2, 4, 1, 2);
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 2, r1: 2 };
  const ctx = { project, workspace, view: 'output', unit: { x: 8, y: 8 } }; // a cell 8 x 16 CSS px
  expect(select.cursor(ctx, { x: 2.5, y: 5 })).toBe('grab');
  select.begin(ctx, { x: 2.5, y: 5 }, {});
  select.move(ctx, { x: 2.5, y: 5 }, { x: 6.5, y: 5 });
  select.end(ctx);
  expect(workspace.selection).toEqual({ c0: 6, r0: 2, c1: 6, r1: 2 });
  expect([paint(2, 4), paint(6, 4)]).toEqual([null, RED]);

  workspace.selection = { c0: 6, r0: 2, c1: 9, r1: 3 }; // 32 x 32 CSS px
  const corner = { x: 10 + 10 / 8, y: 8 + 10 / 8 }; // 10 CSS px past the bottom right corner
  expect(select.cursor(ctx, corner)).not.toBe('nwse-resize');
  select.begin(ctx, corner, { touches: [{}] });
  select.move(ctx, corner, { x: 12, y: 10 });
  select.end(ctx);
  expect(workspace.selection).toEqual({ c0: 6, r0: 2, c1: 11, r1: 4 });
});

test('a picture added with Add to this drawing (paint on its own layer) has handles, and shrinks to a corner', async () => {
  const { project, workspace } = await scene();
  workspace.pickLayer('base');
  const id = await project.addPictureToLayer(new File([await (await fetch('/tests/fixtures/images/gradient.png')).blob()], 'gradient.png', { type: 'image/png' }));
  await settle(project);
  workspace.setActiveTool('select');
  workspace.selection = { c0: 0, r0: 0, c1: 29, r1: 14 };
  expect(handlesShown(project, workspace)).toBe(true);
  const painted = (x, y) => (project.paintOf(id).pixelAt(x, y)?.a ?? 0) > 0;
  expect([painted(20, 20), painted(2, 2)]).toEqual([true, true]);
  workspace.selection = project.scaleSelection(workspace.selection, workspace.selectionIds, { c0: 0, r0: 0, w: 10, px: 10 });
  expect(workspace.selection).toEqual({ c0: 0, r0: 0, c1: 9, r1: 4 });
  expect([painted(20, 20), painted(2, 2), painted(9, 9)]).toEqual([false, true, true]);
});

test('a pasted block resized and moved on gives back what it covered, and the block it came from stays', async () => {
  const { project, paint, block } = await scene();
  block(2, 4, 2, 2);
  block(12, 6, 1, 2, '#00ff00'); // cell (12, 3)
  let rect = project.pasteSelection(project.copySelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT), 10, 2);
  rect = project.scaleSelection(rect, EDIT, { c0: 10, r0: 2, w: 4, px: 4 });
  expect(rect).toEqual({ c0: 10, r0: 2, c1: 13, r1: 3 });
  expect(paint(12, 6)).toBe(RED);
  project.floatSelection(rect, EDIT, 0, 5);
  await settle(project);
  expect([paint(12, 6), paint(2, 4), paint(13, 17), paint(10, 14)]).toEqual(['#00ff00', RED, RED, RED]);
});
