// selectionClip: whether a tool may change a cell or grid pixel, from the selection in its view.
import { test, expect } from 'vitest';
import { selectionClip } from '@/lib/selectionClip';

const workspace = (selection) => ({ selection });

test('a rectangle in the ANSI view lets the tools change its cells and their two grid pixels', () => {
  const clip = selectionClip(workspace({ c0: 2, r0: 1, c1: 4, r1: 2 }), 'output');
  expect([clip.cell(2, 1), clip.cell(4, 2)]).toEqual([true, true]);
  expect([clip.cell(1, 1), clip.cell(5, 2), clip.cell(3, 3)]).toEqual([false, false, false]);
  expect([clip.pixel(3, 2), clip.pixel(3, 5)]).toEqual([true, true]);
  expect([clip.pixel(3, 1), clip.pixel(3, 6)]).toEqual([false, false]);
});

test('with no selection, or in the pixel view, nothing limits the tools', () => {
  expect(selectionClip(workspace(null), 'output')).toBe(null);
  expect(selectionClip(workspace({ c0: 2, r0: 1, c1: 4, r1: 2 }), 'input')).toBe(null);
});
