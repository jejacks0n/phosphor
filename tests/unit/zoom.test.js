// The zoom ranges: PIXEL zooms 1 to 16, the ANSI and VECTOR view 25% to 800%, a room's art 25% to 100%.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clampZoom, clampAnsiZoom, clampViewZoom, dragViewZoom, dragZoom } from '../../src/lib/zoom.js';

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
