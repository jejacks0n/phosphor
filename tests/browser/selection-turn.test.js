// Flip and rotate a selection: its cells move, their characters turn with them (box pieces, blocks,
// arrows), and its paint and base turn too, as one undo step.
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
  return { project, workspace, type, read };
}

test('flipping across and down turns box pieces, half-blocks and arrows with the cells', async () => {
  const { project, type, read } = await scene();
  type(2, 2, ['┌─▀→', '└─▌↑']);
  expect(project.turnSelection({ c0: 2, r0: 2, c1: 5, r1: 3 }, EDIT, 'h')).toEqual({ c0: 2, r0: 2, c1: 5, r1: 3 });
  expect(read(2, 2, 5, 3)).toEqual(['←▀─┐', '↑▐─┘']);
  project.turnSelection({ c0: 2, r0: 2, c1: 5, r1: 3 }, EDIT, 'v');
  expect(read(2, 2, 5, 3)).toEqual(['↓▐─┐', '←▄─┘']);
});

test('a quarter turn makes a w x h block h x w from the same corner, and is one undo step', async () => {
  const { project, type, read } = await scene();
  type(2, 2, ['┌──┐', '└──┘']);
  const before = read(2, 2, 5, 5);
  expect(project.turnSelection({ c0: 2, r0: 2, c1: 5, r1: 3 }, EDIT, 'cw')).toEqual({ c0: 2, r0: 2, c1: 3, r1: 5 });
  expect(read(2, 2, 3, 5)).toEqual(['┌┐', '││', '││', '└┘']);
  project.undo(); await settle(project);
  expect(read(2, 2, 5, 5)).toEqual(before);
});

test('a turned block that would run off the grid moves back onto it', async () => {
  const { project, type, read } = await scene();
  type(27, 13, ['ABC']);
  expect(project.turnSelection({ c0: 27, r0: 13, c1: 29, r1: 13 }, EDIT, 'cw')).toEqual({ c0: 27, r0: 12, c1: 27, r1: 14 });
  expect(read(27, 12, 27, 14)).toEqual(['A', 'B', 'C']);
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
  const { project, type, read } = await scene();
  type(2, 2, ['ABC']);
  type(2, 3, ['xyz']);
  const base = project.baseColorAt(2, 6);
  let rect = project.turnSelection({ c0: 2, r0: 2, c1: 4, r1: 2 }, BOTH, 'cw'); // down over x
  expect(read(2, 2, 2, 4)).toEqual(['A', 'B', 'C']);
  project.floatSelection(rect, BOTH, 10, 0);
  await settle(project);
  expect(read(2, 3, 4, 3)).toEqual(['xyz']);
  expect(project.baseColorAt(2, 6)).toBe(base);
  expect(read(12, 2, 12, 4)).toEqual(['A', 'B', 'C']);
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
