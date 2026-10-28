// selectionClip: whether a tool may change a cell or grid pixel, from the selection in its view.
import { test, expect } from 'vitest';
import { selectionClip } from '@/lib/selectionClip';

const workspace = (selection, wand = null) => ({ selection, wand });
// A wand selection on a 5×4 grid of units with one unit set.
const wandAt = (view, x, y) => { const mask = new Uint8Array(5 * 4); mask[y * 5 + x] = 1; return { view, width: 5, height: 4, mask }; };

test('a rectangle in the ANSI view lets the tools change its cells and their two grid pixels', () => {
  const clip = selectionClip(workspace({ c0: 2, r0: 1, c1: 4, r1: 2 }), 'output');
  expect([clip.cell(2, 1), clip.cell(4, 2)]).toEqual([true, true]);
  expect([clip.cell(1, 1), clip.cell(5, 2), clip.cell(3, 3)]).toEqual([false, false, false]);
  expect([clip.pixel(3, 2), clip.pixel(3, 5)]).toEqual([true, true]);
  expect([clip.pixel(3, 1), clip.pixel(3, 6)]).toEqual([false, false]);
});

test('with no selection, nothing limits the tools', () => {
  expect(selectionClip(workspace(null), 'output')).toBe(null);
  expect(selectionClip(workspace(null), 'input')).toBe(null);
});

test('a rectangle limits the pixel view too: its cells, two grid pixels each', () => {
  const clip = selectionClip(workspace({ c0: 2, r0: 1, c1: 4, r1: 2 }), 'input');
  expect([clip.pixel(3, 2), clip.pixel(3, 5), clip.cell(4, 2)]).toEqual([true, true, true]);
  expect([clip.pixel(3, 1), clip.pixel(5, 3)]).toEqual([false, false]);
});

test('a wand selection in the ANSI view is a cell mask: a cell and its two grid pixels', () => {
  const clip = selectionClip(workspace(null, wandAt('output', 3, 1)), 'output');
  expect([clip.cell(3, 1), clip.pixel(3, 2), clip.pixel(3, 3)]).toEqual([true, true, true]);
  expect([clip.cell(2, 1), clip.pixel(3, 4)]).toEqual([false, false]);
});

test('a wand selection in the pixel view is a pixel mask: a cell is in it when either of its pixels is', () => {
  const clip = selectionClip(workspace(null, wandAt('input', 3, 3)), 'input');
  expect([clip.pixel(3, 3), clip.cell(3, 1)]).toEqual([true, true]);
  expect([clip.pixel(3, 2), clip.cell(3, 0)]).toEqual([false, false]);
});

test("a wand selection doesn't limit the other view's tools", () => {
  expect(selectionClip(workspace(null, wandAt('output', 3, 1)), 'input')).toBe(null);
  expect(selectionClip(workspace(null, wandAt('input', 3, 3)), 'output')).toBe(null);
});
