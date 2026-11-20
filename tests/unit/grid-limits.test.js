// The grid's limits: MAX_COLS wide, MAX_LINES lines tall (two pixel rows a line), MAX_CELLS in all,
// so a narrow piece can run long and a wide one stays short.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MAX_COLS, MAX_LINES, MAX_CELLS, gridFits, maxColsBeside, maxRowsBeside, lockedGrid, fontGrid } from '../../src/lib/Cells.js';

test('The grid fits within its column, line and cell limits, and a size is shrunk to fit them', () => {
  assert.ok(gridFits(80, 2 * MAX_LINES));                                // 80 wide runs the full height
  assert.ok(!gridFits(80, 2 * MAX_LINES + 2));                           // but no further
  assert.ok(!gridFits(MAX_COLS + 1, 2));
  assert.ok(gridFits(MAX_COLS, 3332) && !gridFits(MAX_COLS, 3334));     // 300 x 1666 lines is the budget's 499,800 cells

  assert.equal(maxRowsBeside(80), 2 * MAX_LINES);                        // the line limit binds
  assert.equal(maxRowsBeside(MAX_COLS), 3332);                           // the cell budget binds
  assert.equal(maxColsBeside(2), MAX_COLS);
  assert.equal(maxColsBeside(2 * MAX_LINES), MAX_CELLS / MAX_LINES);

  assert.deepEqual(lockedGrid(80, 1), { cols: 80, rows: 80 });           // fits: the asked-for width
  assert.deepEqual(lockedGrid(80, 40 / 1200), { cols: 80, rows: 2400 }); // a tall picture that fits: the asked-for width
  assert.deepEqual(lockedGrid(80, 1 / 300), { cols: 33, rows: 9900 });   // a taller one: as wide as the line limit allows
  assert.deepEqual(lockedGrid(1000, 4), { cols: MAX_COLS, rows: 75 });   // a wide picture: as wide as the column limit allows
  assert.deepEqual(lockedGrid(MAX_COLS, 1 / 16), { cols: 250, rows: 4000 }); // between: as big as the cell budget allows
  assert.ok(!gridFits(251, 4016));
  assert.deepEqual(lockedGrid(80, 1 / 100_000), { cols: 1, rows: 2 * MAX_LINES }); // past every limit: one column, full height
});

test('fontGrid keeps the columns and the picture\'s shape, from the two heights; past the limits the columns give way', () => {
  assert.deepEqual(fontGrid(80, 60, 16, 16), { cols: 80, rows: 60 });
  assert.deepEqual(fontGrid(80, 60, 16, 8), { cols: 80, rows: 120 });
  assert.deepEqual(fontGrid(80, 120, 8, 16), { cols: 80, rows: 60 });
  assert.deepEqual(fontGrid(80, 60, 16, 11), { cols: 80, rows: 88 });
  assert.deepEqual(fontGrid(80, 9000, 16, 8), { cols: 44, rows: 9900 });
});
