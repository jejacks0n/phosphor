// The window of cells a view draws: the view's size and the grid decide how many cells, and
// scrolling moves the window's origin, clamped so it stays whole at the grid's edges. And the whole
// cells on screen, which the ANSI view publishes.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { viewWindow, wholeCellsIn, scrollToCell } from '../../src/lib/viewWindow.js';

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

test('the whole cells on screen: a cell hidden by under a pixel still counts', () => {
  assert.deepEqual(
    wholeCellsIn({ x: 37, y: 53, width: 600, height: 400 }, { cellWidth: 10, lineHeight: 20 }, 80, 50),
    { col: 4, row: 3, cols: 59, rows: 19 },
  );
  assert.deepEqual(
    wholeCellsIn({ x: 31, y: 21, width: 600, height: 400 }, { cellWidth: 10, lineHeight: 20 }, 80, 50),
    { col: 3, row: 1, cols: 60, rows: 20 },
  );
});

test('the whole cells on screen: a grid smaller than the view is all of it', () => {
  assert.deepEqual(
    wholeCellsIn({ x: -300, y: -200, width: 1400, height: 900 }, { cellWidth: 10, lineHeight: 20 }, 80, 25),
    { col: 0, row: 0, cols: 80, rows: 25 },
  );
});

test('the whole cells on screen: at half the cell, twice as many', () => {
  const view = { x: 40, y: 60, width: 600, height: 400 };
  assert.deepEqual(wholeCellsIn(view, { cellWidth: 10, lineHeight: 20 }, 300, 500), { col: 4, row: 3, cols: 60, rows: 20 });
  assert.deepEqual(wholeCellsIn(view, { cellWidth: 5, lineHeight: 10 }, 300, 500), { col: 8, row: 6, cols: 120, rows: 40 });
});

test('scrolling to a cell makes it the first whole cell on screen', () => {
  const cell = { cellWidth: 10, lineHeight: 20 }, view = { x: 37, y: 500, width: 600, height: 400 };
  const { left, top } = scrollToCell(view, cell, 12, 7);
  assert.deepEqual({ left, top }, { left: 83, top: -360 });
  const there = wholeCellsIn({ ...view, x: view.x + left, y: view.y + top }, cell, 300, 500);
  assert.deepEqual([there.col, there.row], [12, 7]);
});

test('scrolling to a first cell already on screen stays put; one scrolled past comes back', () => {
  const cell = { cellWidth: 10, lineHeight: 20 };
  assert.deepEqual(scrollToCell({ x: -300, y: -200 }, cell, 0, 0), { left: 0, top: 0 });
  assert.deepEqual(scrollToCell({ x: 50, y: -200 }, cell, 0, 0), { left: -50, top: 0 });
});

// A scroll lands on a whole px (the sizer may sit part way into one), so a cell under 2 px can miss.
test('scrolling to a first whole cell from anywhere keeps it, and the box within one cell', () => {
  const round = (x, part) => Math.round(x + part) - part;
  for (const size of [1, 1.2, 1.37, 1.5, 1.84, 2, 3, 5, 8.59, 13.59]) {
    for (const part of [0, 0.25, 0.5, 0.75]) {
      for (let scrolled = 3; scrolled < 400; scrolled += 7) {
        const view = { x: scrolled - part, y: scrolled - part, width: 301, height: 203 }, cell = { cellWidth: size, lineHeight: 2 * size };
        const kept = wholeCellsIn(view, cell, 2000, 2000);
        const { left, top } = scrollToCell(view, cell, kept.col, kept.row);
        const back = wholeCellsIn({ ...view, x: round(view.x + left, part), y: round(view.y + top, part) }, cell, 2000, 2000);
        const at = `size ${size}, part ${part}, scrolled ${scrolled}`;
        assert.deepEqual([back.col, back.row], [kept.col, kept.row], at);
        assert.ok(Math.abs(back.cols - kept.cols) <= 1 && Math.abs(back.rows - kept.rows) <= 1, at);
      }
    }
  }
});
