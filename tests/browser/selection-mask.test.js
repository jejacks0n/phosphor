// A selection with a mask (the Magic Wand's, or one Shift and Alt made: src/lib/selectionMask.js) acts on its cells
// alone: copy, paste, moves, Delete, flips and the Select tool's drags leave the rest of its rectangle as it is.
import { test, expect } from 'vitest';
import { markRaw } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex, charRowsOf } from '@/lib/Cells';
import { masked, selects } from '@/lib/selectionMask';
import select, { opCursor } from '@/tools/select';
import wand from '@/tools/wand';
import bucket from '@/tools/bucket';

const ATTRS = { fg: '#ffffff', bg: '#000000' };

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  workspace.editorTab = 'output';
  const type = (col, row, text) => { [...text].forEach((ch, i) => { if (ch !== ' ') project.typeAt(col + i, row, ch, ATTRS); }); project.commitEdit(); };
  // A selection of these cells.
  const selectionOf = (cells) => {
    const mask = new Uint8Array(project.cols * charRowsOf(project.rows));
    for (const [col, row] of cells) mask[row * project.cols + col] = 1;
    return masked(markRaw({ view: 'output', width: project.cols, height: charRowsOf(project.rows), mask }));
  };
  const own = (col, row) => project.editCells.get(`${col},${row}`)?.char ?? null;
  const shown = (c0, c1, row) => Array.from({ length: c1 - c0 + 1 }, (_, i) => project.cells[cellIndex(c0 + i, row, project.cols)].char).join('');
  return { project, workspace, type, selectionOf, own, shown };
}

test('a masked selection copies only its cells: pasted, the rest of its rectangle shows what it lands on', async () => {
  const { project, type, selectionOf, own } = await scene();
  type(2, 2, 'ABC');
  type(2, 5, 'xyz');
  const block = project.copySelection(selectionOf([[2, 2], [4, 2]]), ['edit']);
  const landed = project.pasteSelection(block, 2, 5);
  expect([own(2, 5), own(3, 5), own(4, 5)]).toEqual(['A', 'y', 'C']);
  expect([selects(landed, 2, 5), selects(landed, 3, 5), selects(landed, 4, 5)]).toEqual([true, false, true]);
});

test('a masked selection moves only its cells, the cell between stays, and one undo puts it all back', async () => {
  const { project, type, selectionOf, own } = await scene();
  type(2, 2, 'ABC');
  const before = new Map(project.editCells);
  const landed = project.floatSelection(selectionOf([[2, 2], [4, 2]]), ['edit'], 0, 3);
  expect([own(2, 2), own(3, 2), own(4, 2)]).toEqual([null, 'B', null]);
  expect([own(2, 5), own(3, 5), own(4, 5)]).toEqual(['A', null, 'C']);
  expect([selects(landed, 2, 5), selects(landed, 3, 5)]).toEqual([true, false]);
  project.floatSelection(landed, ['edit'], 1, 0); // floating on: the same run
  expect([own(3, 5), own(4, 5), own(5, 5)]).toEqual(['A', null, 'C']);
  project.undo();
  expect(project.editCells).toEqual(before);
});

test('Delete with a masked selection takes away only its cells', async () => {
  const { project, workspace, type, selectionOf, own } = await scene();
  type(2, 2, 'ABC');
  project.deleteSelection(selectionOf([[2, 2], [4, 2]]), ['edit']);
  expect([own(2, 2), own(3, 2), own(4, 2)]).toEqual([null, 'B', null]);
  workspace.editorTab = 'input'; // whole cells in the PIXEL view too, as the Select tool's actions always are
  project.paintEditPixels([{ x: 6, y: 4, r: 0, g: 255, b: 0, alpha: 1 }, { x: 7, y: 5, r: 0, g: 255, b: 0, alpha: 1 }]);
  project.commitEdit();
  project.deleteSelection(selectionOf([[6, 2]]), ['edit']);
  expect([project.paintLayer.pixelAt(6, 4), project.paintLayer.pixelAt(7, 5)?.g]).toEqual([null, 255]);
});

test('paint outside the mask stays behind: a moved block holds only its cells\' paint', async () => {
  const { project, selectionOf } = await scene();
  const green = (x, y) => ({ x, y, r: 0, g: 255, b: 0, alpha: 1 });
  project.paintEditPixels([green(2, 4), green(3, 4)]);
  project.commitEdit();
  project.floatSelection(selectionOf([[2, 2]]), ['edit'], 0, 2); // cell (3, 2) is in its rectangle's row but not its mask
  expect([project.paintLayer.pixelAt(2, 4), project.paintLayer.pixelAt(3, 4)?.g, project.paintLayer.pixelAt(2, 8)?.g]).toEqual([null, 255, 255]);
});

test('on the base, a masked move takes only its cells\' pixels and pins, and the base elsewhere stays as it was', async () => {
  const { project, selectionOf } = await scene();
  await settle(project);
  const color = (col, row) => [project.baseColorAt(col, 2 * row), project.baseColorAt(col, 2 * row + 1)];
  const lifted = color(2, 2), stays = color(3, 2), under = color(3, 6);
  project.writeBaseCells([{ col: 2, row: 2, char: 'Q', fg: '#ff0000', bg: '#0000ff' }]);
  const pinned = color(2, 2);
  project.floatSelection(selectionOf([[2, 2], [4, 2]]), ['base'], 0, 4);
  expect(color(2, 6)).toEqual(pinned);
  expect(project.baseRecords.pins.get('2,6')).toBe('Q');
  expect(color(3, 2)).toEqual(stays); // between the two, and not in the mask: not lifted
  expect(color(3, 6)).toEqual(under); // nor landed on
  expect(color(2, 2)).toEqual(['#000000', '#000000']); // where it came from turns black, as a move on the base does
  expect(lifted).not.toEqual(pinned);
});

test('a flip turns the mask with its cells, and lands them over what is there', async () => {
  const { project, type, selectionOf, own } = await scene();
  type(2, 2, 'Ax');
  type(3, 3, 'B');
  const landed = project.turnSelection(selectionOf([[2, 2], [3, 3]]), ['edit'], 'h');
  expect([own(2, 2), own(3, 2), own(2, 3), own(3, 3)]).toEqual([null, 'A', 'B', null]);
  expect([selects(landed, 2, 2), selects(landed, 3, 2), selects(landed, 2, 3), selects(landed, 3, 3)]).toEqual([false, true, true, false]);
});

test('Rotate counts only the characters in the mask', async () => {
  const { project, type, selectionOf } = await scene();
  type(3, 2, 'A');
  project.paintEditPixels([{ x: 2, y: 4, r: 0, g: 255, b: 0, alpha: 1 }]);
  project.commitEdit();
  expect(project.hasCharacters(selectionOf([[2, 2]]), ['edit'])).toBe(false);
  expect(project.hasCharacters(selectionOf([[2, 2], [3, 2]]), ['edit'])).toBe(true);
});

test('a hole made in a selection is an undo step though its rectangle is the same', async () => {
  const { project, workspace, selectionOf } = await scene();
  workspace.selection = { c0: 1, r0: 1, c1: 3, r1: 3 };
  const version = project.history.version;
  project.changeSelection((w) => { w.selection = selectionOf([[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]); });
  expect(project.history.version).toBe(version + 1);
  project.undo();
  expect(workspace.selection).toEqual({ c0: 1, r0: 1, c1: 3, r1: 3 });
});

test('the Select tool drags a masked selection by one of its cells; a drag from a cell it leaves out draws a new one', async () => {
  const { project, workspace, type, selectionOf, own } = await scene();
  type(2, 2, 'ABC');
  const ctx = { project, workspace, view: 'output' };
  const at = (col, row) => ({ x: col + 0.5, y: 2 * row + 1 });
  const drag = (from, to) => { select.begin(ctx, at(...from), {}); select.move(ctx, at(...from), at(...to)); select.end(ctx); };
  workspace.selection = selectionOf([[2, 2], [4, 2]]);
  drag([3, 2], [3, 6]); // from B, which it leaves out
  expect(workspace.selection).toEqual({ c0: 3, r0: 2, c1: 3, r1: 6 });
  expect(own(3, 2)).toBe('B');
  workspace.selection = selectionOf([[2, 2], [4, 2]]);
  drag([2, 2], [2, 4]); // from A: the block moves
  expect([own(2, 4), own(3, 4), own(4, 4), own(3, 2)]).toEqual(['A', null, 'C', 'B']);
});

// The Select tool's drags, as a pointer makes them: from one cell to another, with the keys held.
const dragger = (project, workspace) => {
  const ctx = { project, workspace, view: 'output' };
  const at = (col, row) => ({ x: col + 0.5, y: 2 * row + 1 });
  return (from, to, event = {}) => { select.begin(ctx, at(...from), event); select.move(ctx, at(...from), at(...to)); select.end(ctx); };
};

test('Shift-drag adds a rectangle to the selection, in one undo step; copied, both come, and the gap between shows what they land on', async () => {
  const { project, workspace, type, own } = await scene();
  type(2, 2, 'AxB');
  type(2, 6, 'pqr');
  const drag = dragger(project, workspace);
  drag([2, 2], [2, 3]);
  drag([4, 2], [4, 3], { shiftKey: true });
  expect([selects(workspace.selection, 2, 2), selects(workspace.selection, 3, 2), selects(workspace.selection, 4, 3)]).toEqual([true, false, true]);
  const both = workspace.selection;
  project.pasteSelection(project.copySelection(both, ['edit']), 2, 6);
  expect([own(2, 6), own(3, 6), own(4, 6)]).toEqual(['A', 'q', 'B']);
  project.undo(); // the paste
  project.undo(); // the rectangle Shift added
  expect(workspace.selection).toEqual({ c0: 2, r0: 2, c1: 2, r1: 3 });
});

test('Alt-drag takes a hole out of the selection, and the Bucket fills around it', async () => {
  const { project, workspace } = await scene();
  project.paintStroke(Array.from({ length: 20 * 14 }, (_, i) => ({ x: i % 20, y: Math.floor(i / 20), alpha: 1 })), '#00ff00'); // cell rows 0 to 6
  project.commitEdit();
  await settle(project);
  const drag = dragger(project, workspace);
  drag([1, 1], [5, 5]);
  drag([2, 2], [4, 4], { altKey: true });
  expect([selects(workspace.selection, 1, 1), selects(workspace.selection, 3, 3), selects(workspace.selection, 5, 4)]).toEqual([true, false, true]);
  workspace.editFgColor = '#ff0000';
  bucket.begin({ project, workspace, view: 'output' }, { x: 1.5, y: 2.5 }, { stopPropagation() {} });
  await settle(project);
  // In the ring, in the hole, and outside the selection.
  expect([project.rawColorAt(1, 2), project.rawColorAt(5, 10), project.rawColorAt(3, 6), project.rawColorAt(4, 8), project.rawColorAt(7, 6)])
    .toEqual(['#ff0000', '#ff0000', '#00ff00', '#00ff00', '#00ff00']);
});

test('Shift+Alt drags keep only the overlap; a Shift or Alt click takes in or leaves out its one cell', async () => {
  const { project, workspace } = await scene();
  const drag = dragger(project, workspace);
  const cells = () => [0, 1, 2, 3, 4].map((col) => (selects(workspace.selection, col, 1) ? '#' : '.')).join('');
  drag([0, 1], [3, 1]);
  drag([2, 0], [4, 2], { shiftKey: true, altKey: true });
  expect(cells()).toBe('..##.');
  drag([0, 1], [0, 1], { shiftKey: true }); // a click
  expect(cells()).toBe('#.##.');
  drag([3, 1], [3, 1], { altKey: true });
  expect(cells()).toBe('#.#..');
  drag([2, 1], [2, 1], { shiftKey: true }); // inside the selection, Shift still adds rather than moves
  expect(cells()).toBe('#.#..');
  expect(project.editCells.size).toBe(0);
});

test('the pointer shows +, − or × while Shift, Alt or both are held, with Select and the Magic Wand', async () => {
  const { workspace } = await scene();
  const signs = new Set();
  for (const tool of [select, wand]) {
    expect(String(tool.cursor({ workspace }, { x: 3.5, y: 3 }) ?? '')).not.toMatch(/^url/);
    for (const [shift, alt, op] of [[true, false, 'add'], [false, true, 'subtract'], [true, true, 'intersect']]) {
      Object.assign(workspace, { isShiftPressed: shift, isAltPressed: alt });
      expect(tool.cursor({ workspace }, { x: 3.5, y: 3 })).toBe(opCursor(op));
      signs.add(opCursor(op));
    }
    Object.assign(workspace, { isShiftPressed: false, isAltPressed: false });
  }
  expect(signs.size).toBe(3);
});
