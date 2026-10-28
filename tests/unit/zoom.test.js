// The zoom ranges: PIXEL zooms 1 to 16, ANSI zooms out to 25%.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { clampZoom, clampAnsiZoom } from '../../src/lib/zoom.js';

test('the ANSI zoom is 25% to 100%', () => {
  assert.deepEqual([0.1, 0.25, 0.6, 1, 3].map(clampAnsiZoom), [0.25, 0.25, 0.6, 1, 1]);
  assert.deepEqual([0.5, 1, 20].map(clampZoom), [1, 1, 16]);
});
