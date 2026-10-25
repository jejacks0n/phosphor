// The window of cells a view draws: the view's size and the grid decide how many cells, and
// scrolling moves the window's origin, clamped so it stays whole at the grid's edges.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { viewWindow } from '../../src/lib/viewWindow.js';

test('a grid smaller than the view is one window, the whole grid', () => {
  assert.deepEqual(
    viewWindow({ x: -300, y: -200, width: 1400, height: 900 }, { x: 10, y: 20 }, 80, 25),
    { col: 0, row: 0, cols: 80, rows: 25 },
  );
});

test('scrolled into a long grid, the window covers the view and the margin around it', () => {
  assert.deepEqual(
    viewWindow({ x: 0, y: 10_000, width: 800, height: 600 }, { x: 10, y: 20 }, 80, 1000),
    { col: 0, row: 492, cols: 80, rows: 47 },
  );
});

test('at the end of the grid the window stops at the last row, keeping its size', () => {
  assert.deepEqual(
    viewWindow({ x: 0, y: 19_900, width: 800, height: 600 }, { x: 10, y: 20 }, 80, 1000),
    { col: 0, row: 953, cols: 80, rows: 47 },
  );
});

test('a fractional unit (the PIXEL view at a fractional zoom)', () => {
  assert.deepEqual(
    viewWindow({ x: 1000, y: 0, width: 500, height: 400 }, { x: 7.5, y: 7.5 }, 300, 800),
    { col: 112, row: 0, cols: 111, rows: 97 },
  );
});
