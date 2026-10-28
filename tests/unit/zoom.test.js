// The zoom ranges: PIXEL zooms 1 to 16, ANSI zooms out to 25%.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clampZoom, clampAnsiZoom, dragZoom } from '../../src/lib/zoom.js';

test('the ANSI zoom is 25% to 100%', () => {
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
});
