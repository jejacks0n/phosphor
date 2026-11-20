// Invariant behind Merge Layers: an image baked at cols*k x rows*k (integer edit scale k) must re-fit
// into the grid as identity, otherwise every merge shifts/shrinks the image.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fitRect } from '../../src/lib/Canvas.js';
import { lockedGrid } from '../../src/lib/Cells.js';

test('Invariant behind Merge Layers: an image baked at cols*k x rows*k (integer edit scale k) must re-fit into the grid as identity, otherwise every merge shifts/shrinks the image', async () => {
  for (const [sw, sh] of [[378, 790], [1920, 1080], [500, 501], [64, 300], [4000, 37]]) {
    for (let cols = 10; cols <= 300; cols += 7) {
      for (let rows = 10; rows <= 300; rows += 11) {
        const k = Math.max(1, Math.ceil(Math.max(sw / cols, sh / rows)));
        const fit = fitRect(cols * k, rows * k, cols, rows);
        assert.deepEqual(fit, { dx: 0, dy: 0, dw: cols, dh: rows }, `${sw}x${sh} -> ${cols}x${rows}`);
        const f = fitRect(sw, sh, cols, rows);
        assert.ok(f.dx >= 0 && f.dy >= 0 && f.dx + f.dw <= cols && f.dy + f.dh <= rows, `in bounds ${sw}x${sh} -> ${cols}x${rows}`);
      }
    }
  }
});

test('A picture opened at its locked grid fills it edge to edge: a grid less than a pixel longer than the picture leaves no black row or column', async () => {
  assert.deepEqual(fitRect(96, 64, 80, 54), { dx: 0, dy: 0, dw: 80, dh: 54 }); // photo.jpg: 53.3 pixel rows tall at 80 wide
  for (const [sw, sh] of [[96, 64], [1920, 1080], [378, 790], [64, 300], [4000, 37], [500, 501]]) {
    for (let cols = 2; cols <= 300; cols++) {
      const { cols: c, rows } = lockedGrid(cols, sw / sh);
      assert.deepEqual(fitRect(sw, sh, c, rows), { dx: 0, dy: 0, dw: c, dh: rows }, `${sw}x${sh} -> ${c}x${rows}`);
    }
  }
});

test('fitRect with an aspect of 1 is fitRect without one, to the pixel', () => {
  for (const [sw, sh] of [[378, 790], [1920, 1080], [500, 501], [64, 300], [4000, 37], [96, 64]])
    for (let cols = 2; cols <= 300; cols += 7) for (let rows = 2; rows <= 300; rows += 11)
      assert.deepEqual(fitRect(sw, sh, cols, rows, 1), fitRect(sw, sh, cols, rows));
});

test('in an 8×8 font (aspect 0.5) a picture opened at its locked grid fills it edge to edge', () => {
  assert.deepEqual(lockedGrid(80, (4 / 3) * 0.5), { cols: 80, rows: 120 }); // 80 columns of a 4:3 picture: 60 lines
  for (const [sw, sh] of [[96, 64], [1920, 1080], [378, 790], [64, 300]]) for (let cols = 2; cols <= 300; cols++) {
    const { cols: c, rows } = lockedGrid(cols, (sw / sh) * 0.5);
    assert.deepEqual(fitRect(sw, sh, c, rows, 0.5), { dx: 0, dy: 0, dw: c, dh: rows }, `${sw}x${sh} -> ${c}x${rows}`);
  }
});

test('an aspect letterboxes by the cell shape: a square picture in a 40 x 40 grid of 8×8 cells is 20 columns wide', () => {
  assert.deepEqual(fitRect(100, 100, 40, 40, 0.5), { dx: 10, dy: 0, dw: 20, dh: 40 });
  assert.deepEqual(fitRect(100, 100, 40, 80, 0.5), { dx: 0, dy: 0, dw: 40, dh: 80 });
});
