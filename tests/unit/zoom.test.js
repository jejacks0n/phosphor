// The zoom ranges: PIXEL zooms 1 to 16, the ANSI and VECTOR view 25% to 800%, a room's art 25% to 100%.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clampZoom, clampAnsiZoom, clampViewZoom, dragViewZoom, dragZoom, stepZoom } from '../../src/lib/zoom.js';

test('the ANSI and VECTOR view zooms 25% to 800%; a room\'s art 25% to 100%', () => {
  assert.deepEqual([0.1, 0.25, 0.6, 1, 3, 8, 20].map(clampViewZoom), [0.25, 0.25, 0.6, 1, 3, 8, 8]);
  assert.deepEqual([0.1, 0.25, 0.6, 1, 3].map(clampAnsiZoom), [0.25, 0.25, 0.6, 1, 1]);
  assert.deepEqual([0.5, 1, 20].map(clampZoom), [1, 1, 16]);
});

test('a Zoom tool drag crosses either view\'s whole range in 1500 px; PIXEL\'s is a hundredth a pixel, as it was', () => {
  assert.equal(dragZoom(5, 100, clampZoom), 5 + 100 * 0.01);
  assert.equal(dragZoom(5, -37, clampZoom), 5 + -37 * 0.01);
  assert.equal(dragZoom(1, 1500, clampZoom), 16);
  assert.equal(dragZoom(0.25, 1500, clampAnsiZoom), 1);
  assert.equal(dragZoom(1, -750, clampAnsiZoom), 0.625);
  assert.equal(dragZoom(1, -5000, clampAnsiZoom), 0.25);
  assert.equal(dragZoom(0.25, 1500, clampViewZoom), 8);
});

test('the ANSI view\'s Zoom tool drag goes by ratios: 300 px halves or doubles it, the whole range in 1500 px', () => {
  assert.ok(Math.abs(dragViewZoom(1, -300) - 0.5) < 1e-9);
  assert.ok(Math.abs(dragViewZoom(1, 300) - 2) < 1e-9);
  assert.ok(Math.abs(dragViewZoom(4, 300) - 8) < 1e-9);
  assert.equal(dragViewZoom(0.25, 5000), 8);
  assert.equal(dragViewZoom(1, -5000), 0.25);
});

// dex-13: a click with the Zoom tool did nothing. It steps now, by the powers of two inside the view's range.
test('a Zoom tool click goes to the next power of two up, from between steps too; Alt-click to the one below; the ends stay', () => {
  assert.deepEqual([0.25, 0.5, 1, 1.3, 2, 4, 8].map((z) => stepZoom(z, false, clampViewZoom)), [0.5, 1, 2, 2, 4, 8, 8]);
  assert.deepEqual([0.25, 0.5, 1, 1.3, 2, 4, 8].map((z) => stepZoom(z, true, clampViewZoom)), [0.25, 0.25, 0.5, 1, 1, 2, 4]);
  assert.deepEqual([1, 2, 5, 8, 16].map((z) => stepZoom(z, false, clampZoom)), [2, 4, 8, 16, 16]); // PIXEL: 1x to 16x
  assert.deepEqual([1, 2, 5, 8, 16].map((z) => stepZoom(z, true, clampZoom)), [1, 1, 4, 4, 8]);
  assert.equal(stepZoom(2 + 1e-9, false, clampViewZoom), 4); // a drag's or a wheel's rounding, a hair off a step, is on it
  assert.equal(stepZoom(2 - 1e-9, true, clampViewZoom), 1);
});
