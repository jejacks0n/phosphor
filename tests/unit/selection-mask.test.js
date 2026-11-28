// The selection as a mask (src/lib/selectionMask.js): its bounds, which cells it holds, moved, landed and put together.
import { test, expect } from 'vitest';
import { masked, selects, cellBits, landedAt, shifted, combine, sameSelection, maskIn } from '@/lib/selectionMask';

// A mask on a 6 x 4 grid of cells (rows: 8 grid pixel rows) from rows of # and ., in cells or grid pixels.
const COLS = 6, ROWS = 8;
const maskOf = (view, lines) => {
  const height = view === 'output' ? ROWS / 2 : ROWS, mask = new Uint8Array(COLS * height);
  lines.forEach((line, y) => [...line].forEach((c, x) => { mask[y * COLS + x] = c === '#' ? 1 : 0; }));
  return { view, width: COLS, height, mask };
};
// A selection's cells as rows of # and ., over the grid.
const cellsOf = (sel) => Array.from({ length: ROWS / 2 }, (_, row) => Array.from({ length: COLS }, (_, col) => (selects(sel, col, row) ? '#' : '.')).join(''));

test('a mask is a selection with its bounds; an empty one is nothing', () => {
  const sel = masked(maskOf('output', ['......', '.#..#.', '..#...']));
  expect([sel.c0, sel.r0, sel.c1, sel.r1]).toEqual([1, 1, 4, 2]);
  expect(cellsOf(sel)).toEqual(['......', '.#..#.', '..#...', '......']);
  expect(masked(maskOf('output', []))).toBe(null);
});

test('a mask of grid pixels holds a cell when either of its pixels is selected', () => {
  const sel = masked(maskOf('input', ['......', '......', '...#..', '......', '......', '.#....']));
  expect([sel.c0, sel.r0, sel.c1, sel.r1]).toEqual([1, 1, 3, 2]);
  expect(cellsOf(sel)).toEqual(['......', '...#..', '.#....', '......']);
});

test('a plain rectangle selects every cell of it, and has no cell marks', () => {
  const rect = { c0: 1, r0: 1, c1: 2, r1: 2 };
  expect(cellsOf(rect)).toEqual(['......', '.##...', '.##...', '......']);
  expect(cellBits(rect)).toBe(null);
  expect([...cellBits(masked(maskOf('output', ['.#.', '..#'])))]).toEqual([1, 0, 0, 1]);
});

test('a block landed is clipped to the grid, its marks with it', () => {
  expect(landedAt(3, 2, null, 4, 3, COLS, ROWS)).toEqual({ c0: 4, r0: 3, c1: 5, r1: 3 });
  const sel = landedAt(2, 2, Uint8Array.from([1, 0, 0, 1]), 5, 2, COLS, ROWS); // its right column off the grid
  expect(cellsOf(sel)).toEqual(['......', '......', '.....#', '......']);
  expect(landedAt(2, 2, Uint8Array.from([0, 0, 0, 1]), 5, 3, COLS, ROWS)).toBe(null); // its one cell off the grid
});

test('an outline moved keeps a mask in its own units: a pixel mask by two pixel rows a row', () => {
  const sel = masked(maskOf('input', ['#.....', '......', '.#....']));
  const moved = shifted(sel, 2, 1);
  expect(moved.mask.view).toBe('input');
  expect([...moved.mask.mask].flatMap((bit, i) => (bit ? [i] : []))).toEqual([2 * COLS + 2, 4 * COLS + 3]);
  expect(shifted({ c0: 0, r0: 0, c1: 1, r1: 1 }, 1, 2)).toEqual({ c0: 1, r0: 2, c1: 2, r1: 3 });
});

test('Shift adds, Alt subtracts, both keep only the overlap', () => {
  const a = { c0: 0, r0: 0, c1: 2, r1: 1 }, b = { c0: 2, r0: 1, c1: 4, r1: 2 };
  expect(cellsOf(combine(a, b, 'add', COLS, ROWS))).toEqual(['###...', '#####.', '..###.', '......']);
  expect(cellsOf(combine(a, b, 'subtract', COLS, ROWS))).toEqual(['###...', '##....', '......', '......']);
  expect(cellsOf(combine(a, b, 'intersect', COLS, ROWS))).toEqual(['......', '..#...', '......', '......']);
  expect(combine(a, a, 'subtract', COLS, ROWS)).toBe(null);
  expect(combine(null, b, 'add', COLS, ROWS)).toBe(b);
  expect(combine(null, b, 'subtract', COLS, ROWS)).toBe(null);
});

test('a pixel mask and a rectangle put together stay in pixels, so neither loses a pixel', () => {
  const pixels = masked(maskOf('input', ['#.....']));
  const sum = combine(pixels, { c0: 3, r0: 0, c1: 3, r1: 0 }, 'add', COLS, ROWS);
  expect(sum.mask.view).toBe('input');
  expect([...sum.mask.mask.slice(0, 2 * COLS)].join('')).toBe('100100000100');
  expect(maskIn({ c0: 1, r0: 1, c1: 1, r1: 1 }, 'input', COLS, ROWS).mask.filter(Boolean).length).toBe(2);
});

test('two selections are alike only with the same cells: a hole in the same bounds is another selection', () => {
  const whole = { c0: 0, r0: 0, c1: 2, r1: 2 };
  const holed = combine(whole, { c0: 1, r0: 1, c1: 1, r1: 1 }, 'subtract', COLS, ROWS);
  expect([holed.c0, holed.r0, holed.c1, holed.r1]).toEqual([0, 0, 2, 2]);
  expect(sameSelection(whole, holed)).toBe(false);
  expect(sameSelection(holed, combine(whole, { c0: 1, r0: 1, c1: 1, r1: 1 }, 'subtract', COLS, ROWS))).toBe(true);
  expect(sameSelection(whole, { ...whole })).toBe(true);
});
