// Flip and rotate a selection. A flip moves its cells, their characters turning with them (box pieces,
// blocks, arrows), and its paint and base flip too; Rotate turns its pixels. Each is one undo step.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';

const ATTRS = { fg: '#ffffff', bg: '#000000' };
const EDIT = { base: false, edit: true }, BOTH = { base: true, edit: true };

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  const type = (col, row, lines) => {
    lines.forEach((line, r) => [...line].forEach((ch, c) => project.typeAt(col + c, row + r, ch, ATTRS)));
    project.commitEdit();
  };
  const read = (c0, r0, c1, r1) => Array.from({ length: r1 - r0 + 1 }, (_, r) =>
    Array.from({ length: c1 - c0 + 1 }, (_, c) => project.cells[cellIndex(c0 + c, r0 + r, project.cols)].char).join(''));
  // The paint at a grid pixel, or null where there's none.
  const paint = (x, y) => (project.paintLayer?.pixelAt(x, y)?.a ? project.rawColorAt(x, y) : null);
  return { project, workspace, type, read, paint };
}

test('flipping across and down turns box pieces, half-blocks and arrows with the cells', async () => {
  const { project, type, read } = await scene();
  type(2, 2, ['┌─▀→', '└─▌↑']);
  expect(project.turnSelection({ c0: 2, r0: 2, c1: 5, r1: 3 }, EDIT, 'h')).toEqual({ c0: 2, r0: 2, c1: 5, r1: 3 });
  expect(read(2, 2, 5, 3)).toEqual(['←▀─┐', '↑▐─┘']);
  project.turnSelection({ c0: 2, r0: 2, c1: 5, r1: 3 }, EDIT, 'v');
  expect(read(2, 2, 5, 3)).toEqual(['↓▐─┐', '←▄─┘']);
});

// Rotate turns the picture by its shape (a cell is two grid pixels, one wide and two tall), so
// square stays square. Pixels: the paint, the base's pixels and colors, and the Half-block's ▄.
test('Rotate turns the pixels: a 2 x 1-cell square stays 2 x 1, and it is one undo step', async () => {
  const { project, paint } = await scene();
  project.paintStroke([{ x: 2, y: 4, alpha: 1 }], '#ff0000');
  project.paintStroke([{ x: 3, y: 4, alpha: 1 }], '#00ff00');
  project.paintStroke([{ x: 2, y: 5, alpha: 1 }], '#0000ff');
  project.paintStroke([{ x: 3, y: 5, alpha: 1 }], '#ffffff');
  project.commitEdit();
  expect(project.turnSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT, 'cw')).toEqual({ c0: 2, r0: 2, c1: 3, r1: 2 });
  // red green / blue white turned clockwise: blue red / white green
  expect([paint(2, 4), paint(3, 4), paint(2, 5), paint(3, 5)]).toEqual(['#0000ff', '#ff0000', '#ffffff', '#00ff00']);
  project.undo(); await settle(project);
  expect([paint(2, 4), paint(3, 4), paint(2, 5), paint(3, 5)]).toEqual(['#ff0000', '#00ff00', '#0000ff', '#ffffff']);
});

test("a Half-block's ▄ goes with its paint when it rotates, and only to cells the paint lands in", async () => {
  const { project, read, paint } = await scene();
  project.paintStroke([{ x: 2, y: 4, alpha: 1 }], '#ff0000', { blockChars: true }); // the top half of cell (2, 2)
  project.commitEdit();
  expect(read(2, 2, 3, 2)).toEqual(['▄' + read(3, 2, 3, 2)[0]]);
  project.turnSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT, 'cw'); // the pixel turns to the top right
  expect(paint(3, 4)).toBe('#ff0000');
  expect([project.editCellAt(2, 2), project.editCellAt(3, 2)?.char]).toEqual([undefined, '▄']);
});

test('a block an odd number of cells wide turns into whole cells: the half row to spare keeps what was under it', async () => {
  const { project, paint } = await scene();
  project.paintStroke([2, 3, 4].flatMap((x) => [{ x, y: 4, alpha: 1 }, { x, y: 5, alpha: 1 }]), '#ff0000'); // cells 2-4 of row 2
  project.paintStroke([{ x: 2, y: 7, alpha: 1 }, { x: 3, y: 7, alpha: 1 }], '#ff00ff'); // the bottom half of row 3
  project.commitEdit();
  // 3 x 2 pixels turn into 2 x 3: two cells across, a row and a half down
  expect(project.turnSelection({ c0: 2, r0: 2, c1: 4, r1: 2 }, EDIT, 'cw')).toEqual({ c0: 2, r0: 2, c1: 3, r1: 3 });
  expect([4, 5, 6].map((y) => [paint(2, y), paint(3, y)])).toEqual([['#ff0000', '#ff0000'], ['#ff0000', '#ff0000'], ['#ff0000', '#ff0000']]);
  expect([paint(2, 7), paint(3, 7)]).toEqual(['#ff00ff', '#ff00ff']);
  expect([paint(4, 4), paint(4, 5)]).toEqual([null, null]); // where it was, and isn't now
});

test('a turned block that would run off the grid moves back onto it', async () => {
  const { project, paint } = await scene();
  project.paintStroke([{ x: 29, y: 26, alpha: 1 }], '#ff0000');
  project.paintStroke([{ x: 29, y: 27, alpha: 1 }], '#0000ff');
  project.commitEdit();
  expect(project.turnSelection({ c0: 29, r0: 13, c1: 29, r1: 13 }, EDIT, 'cw')).toEqual({ c0: 28, r0: 13, c1: 29, r1: 13 });
  expect([paint(28, 26), paint(29, 26)]).toEqual(['#0000ff', '#ff0000']);
});

test('Rotate is off while the selection holds characters, on the layers chosen; a Half-block ▄ is pixels', async () => {
  const { project, type, read } = await scene();
  type(2, 2, ['AB']);
  expect(project.hasCharacters({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT)).toBe(true);
  expect(project.hasCharacters({ c0: 2, r0: 2, c1: 3, r1: 2 }, { base: true, edit: false })).toBe(false);
  expect(project.turnSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT, 'cw')).toEqual({ c0: 2, r0: 2, c1: 3, r1: 2 });
  expect(read(2, 2, 3, 2)).toEqual(['AB']);
  project.paintStroke([{ x: 6, y: 4, alpha: 1 }], '#ff0000', { blockChars: true });
  project.commitEdit();
  expect(read(6, 2, 6, 2)).toEqual(['▄']);
  expect(project.hasCharacters({ c0: 6, r0: 2, c1: 7, r1: 2 }, BOTH)).toBe(false);
});

test('the paint and the base flip with the cells; a Half-block ▄ keeps showing its paint', async () => {
  const { project, read } = await scene();
  const left = project.baseColorAt(4, 8), right = project.baseColorAt(9, 8);
  expect(left).not.toBe(right);
  project.paintStroke([{ x: 4, y: 8, alpha: 1 }], '#ff0000', { blockChars: true }); // the top half of cell (4, 4)
  project.commitEdit();
  project.turnSelection({ c0: 4, r0: 4, c1: 9, r1: 5 }, BOTH, 'v');
  expect(project.cellHasPaint(4, 5)).toBe(true);
  expect(project.cellHasPaint(4, 4)).toBe(false);
  expect(read(4, 5, 4, 5)).toEqual(['▄']);
  project.turnSelection({ c0: 4, r0: 4, c1: 9, r1: 5 }, BOTH, 'h');
  expect(project.cellHasPaint(9, 5)).toBe(true);
  expect(project.baseColorAt(4, 11)).toBe(right); // (9, 8) flipped down then across
});

test('a wide character flipped across still covers its own two cells', async () => {
  const { project, type, read } = await scene();
  type(2, 2, ['A']);
  project.typeAt(3, 2, '漢', ATTRS); // lead 3, trail 4
  project.commitEdit();
  project.turnSelection({ c0: 2, r0: 2, c1: 4, r1: 2 }, EDIT, 'h');
  expect(project.cells[cellIndex(2, 2, project.cols)].char).toBe('漢');
  expect(project.cells[cellIndex(3, 2, project.cols)].wide).toBe('trail');
  expect(read(4, 2, 4, 2)).toEqual(['A']);
});

// A turn floats like a move: what the block covers comes back when it moves on, and the run is one
// undo step.
test('a block moved over the picture and flipped gives back what it covered when it moves on', async () => {
  const { project, type, read } = await scene();
  type(2, 2, ['AB']);
  type(10, 2, ['xyz']);
  const base = [10, 11, 12].map((c) => project.baseColorAt(c, 4));
  let rect = project.floatSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, BOTH, 8, 0); // onto x y
  rect = project.turnSelection(rect, BOTH, 'h');
  await settle(project);
  expect(read(10, 2, 12, 2)).toEqual(['BAz']);
  project.floatSelection(rect, BOTH, 0, 3);
  await settle(project);
  expect(read(10, 2, 12, 2)).toEqual(['xyz']);
  expect([10, 11, 12].map((c) => project.baseColorAt(c, 4))).toEqual(base);
  expect(read(10, 5, 11, 5)).toEqual(['BA']);
  project.undo(); await settle(project);
  expect(read(2, 2, 3, 2)).toEqual(['AB']);
  expect(read(10, 2, 12, 2)).toEqual(['xyz']);
});

test('a block rotated over its neighbors gives them back when it moves on', async () => {
  const { project, paint } = await scene();
  project.paintStroke([2, 3, 4].flatMap((x) => [{ x, y: 4, alpha: 1 }, { x, y: 5, alpha: 1 }]), '#ff0000');
  project.paintStroke([2, 3].flatMap((x) => [{ x, y: 6, alpha: 1 }, { x, y: 7, alpha: 1 }]), '#00ff00'); // cells 2-3 of row 3
  project.commitEdit();
  const base = project.baseColorAt(2, 6);
  const rect = project.turnSelection({ c0: 2, r0: 2, c1: 4, r1: 2 }, BOTH, 'cw'); // down over the green
  expect([paint(2, 6), paint(2, 7)]).toEqual(['#ff0000', '#00ff00']);
  project.floatSelection(rect, BOTH, 10, 0);
  await settle(project);
  expect([paint(2, 6), paint(2, 7), paint(3, 6)]).toEqual(['#00ff00', '#00ff00', '#00ff00']);
  expect(project.baseColorAt(2, 6)).toBe(base);
  expect([4, 5, 6].map((y) => paint(12, y))).toEqual(['#ff0000', '#ff0000', '#ff0000']);
});

test('a pasted block turned and moved on gives back what it covered; Delete on a turned float takes the block away', async () => {
  const { project, type, read } = await scene();
  type(2, 2, ['AB']);
  type(10, 2, ['xyz']);
  let rect = project.pasteSelection(project.copySelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT), 10, 2);
  rect = project.turnSelection(rect, EDIT, 'h');
  await settle(project);
  expect(read(10, 2, 12, 2)).toEqual(['BAz']);
  project.floatSelection(rect, EDIT, 0, 2);
  await settle(project);
  expect(read(10, 2, 12, 2)).toEqual(['xyz']);
  expect(read(10, 4, 11, 4)).toEqual(['BA']);

  rect = project.turnSelection({ c0: 2, r0: 2, c1: 3, r1: 2 }, EDIT, 'h'); // the original, in place
  project.deleteSelection(rect, EDIT);
  await settle(project);
  expect(read(2, 2, 3, 2)).not.toContain('A');
});
