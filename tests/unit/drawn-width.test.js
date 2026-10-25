// Characters that draw wider than the columns they're given (﷽ gets one column and draws about
// eleven): how many columns a measured width covers, and which cells after it each one spills over,
// as a terminal draws them (the row keeps its columns; the overflow covers what follows).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { spanOf, layoutSpills } from '../../src/lib/DrawnWidth.js';

test('How many columns a measured width covers', () => {
  assert.equal(spanOf(1, 1), 1);
  assert.equal(spanOf(1.03, 1), 1);    // a hair over (ŀ): not an overflow
  assert.equal(spanOf(0.8, 1), 1);
  assert.equal(spanOf(1.72, 1), 2);    // ⟿
  assert.equal(spanOf(10.82, 1), 11);  // ﷽
  assert.equal(spanOf(1.7, 2), 2);     // 漢 draws inside its two columns
  assert.equal(spanOf(3.4, 2), 4);     // a two-column character drawing wider than two
});

test('Which cells an overflowing character spills over', () => {
  const C = (char, wide) => ({ char, ...(wide && { wide }) });
  const spans = { '﷽': 4, '⟿': 2, '漢': 2, '𒐫': 3 };
  const span = (cell) => spans[cell.char] ?? 1;
  // One row of 8: ﷽ at 0 covers 1-3; ⟿ at 5 covers 6.
  const row = [C('﷽'), C('a'), C('b'), C('c'), C('d'), C('⟿'), C('e'), C('f')];
  const spills = layoutSpills(row, 8, span);
  assert.deepEqual(spills.map((s) => s && [s.from, s.slice]), [null, [0, 1], [0, 2], [0, 3], null, null, [5, 1], null]);
  // A two-column character's own two cells aren't spills; one drawing over 2 spills from its third column.
  const wide = layoutSpills([C('漢', 'lead'), C('漢', 'trail'), C('x'), C('y')], 4, (c) => (c.char === '漢' ? 3 : 1));
  assert.deepEqual(wide.map((s) => s && [s.from, s.slice]), [null, null, [0, 2], null]);
  // A later overflow draws over an earlier one (left to right, as a terminal draws them).
  const both = layoutSpills([C('𒐫'), C('﷽'), C('a'), C('b'), C('c'), C('d')], 6, span);
  assert.deepEqual(both.map((s) => s && [s.from, s.slice]), [null, [0, 1], [1, 1], [1, 2], [1, 3], null]);
  // Spills stop at the row's end: nothing reaches the next row.
  const edge = layoutSpills([C('a'), C('a'), C('a'), C('﷽'), C('a'), C('b'), C('c'), C('d')], 4, span);
  assert.deepEqual(edge.map((s) => s && [s.from, s.slice]), [null, null, null, null, null, null, null, null]);
});
