// The Magic Wand's matching: connected units sharing a side, or all matches, among the units allowed.
import { test, expect } from 'vitest';
import { selectMatching, unitsOf, wandIn } from '@/lib/MagicWand';

// A grid from strings: a unit matches when it's the same letter as the clicked one.
const grid = (rows) => ({ width: rows[0].length, height: rows.length, at: (i) => rows[Math.floor(i / rows[0].length)][i % rows[0].length] });
const pick = (rows, start, options = {}) => {
  const g = grid(rows), seed = g.at(start.y * g.width + start.x);
  const mask = selectMatching({ width: g.width, height: g.height, start, same: (i) => g.at(i) === seed, ...options });
  return rows.map((row, y) => [...row].map((_, x) => (mask[y * g.width + x] ? '#' : '.')).join(''));
};

const ART = ['aab.a', 'aabba', 'bbb.a', 'a.b.a'];

test('contiguous selects the matching units connected by a side', () => {
  expect(pick(ART, { x: 0, y: 0 })).toEqual(['##...', '##...', '.....', '.....']);
  expect(pick(ART, { x: 2, y: 0 })).toEqual(['..#..', '..##.', '###..', '..#..']);
});

test('a checkerboard: contiguous takes one cell, not contiguous takes every other one', () => {
  const checks = ['abab', 'baba', 'abab'];
  expect(pick(checks, { x: 1, y: 1 })).toEqual(['....', '.#..', '....']);
  expect(pick(checks, { x: 1, y: 1 }, { contiguous: false })).toEqual(['#.#.', '.#.#', '#.#.']);
});

test('units allowed() rejects are neither selected nor crossed, and a start it rejects selects nothing', () => {
  const box = (i) => { const x = i % 5, y = Math.floor(i / 5); return x >= 1 && x <= 3 && y <= 2; };
  expect(pick(ART, { x: 2, y: 0 }, { allowed: box })).toEqual(['..#..', '..##.', '.##..', '.....']);
  expect(pick(ART, { x: 4, y: 0 }, { contiguous: false, allowed: box })).toEqual(['.....', '.....', '.....', '.....']);
  expect(pick(ART, { x: 1, y: 0 }, { contiguous: false, allowed: box })).toEqual(['.#...', '.#...', '.....', '.....']);
  const notColumn2 = (i) => i % 4 !== 2;
  expect(pick(['aaaa', 'aaaa'], { x: 0, y: 0 }, { allowed: notColumn2 })).toEqual(['##..', '##..']);
  expect(pick(['aaaa', 'aaaa'], { x: 2, y: 0 }, { allowed: notColumn2 })).toEqual(['....', '....']);
});

test('unitsOf lists the selected units', () => {
  const mask = Uint8Array.from([0, 1, 0, 1, 0, 0]);
  expect(unitsOf(mask, 3)).toEqual([{ x: 1, y: 0 }, { x: 0, y: 1 }]);
});

test('wandIn shows a selection in the other view: a cell is both its pixels, a pixel selects its cell', () => {
  // 2 columns, 5 grid pixel rows: 2 cell rows; the last pixel row is in no cell.
  const cells = { view: 'output', width: 2, height: 2, mask: Uint8Array.from([1, 0, 0, 1]) };
  expect(wandIn(cells, 'output', 5)).toBe(cells);
  expect(wandIn(cells, 'input', 5)).toMatchObject({ view: 'input', width: 2, height: 5 });
  expect([...wandIn(cells, 'input', 5).mask]).toEqual([1, 0, 1, 0, 0, 1, 0, 1, 0, 0]);
  const pixels = { view: 'input', width: 2, height: 5, mask: Uint8Array.from([0, 0, 0, 1, 1, 0, 0, 0, 1, 1]) };
  expect(wandIn(pixels, 'output', 5)).toMatchObject({ view: 'output', width: 2, height: 2 });
  expect([...wandIn(pixels, 'output', 5).mask]).toEqual([0, 1, 1, 0]);
});
