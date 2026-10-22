// Brush pixel generation shared by both editors (grid pixels, clipped to the grid).
// Run: node scripts/check-brushes.mjs
import assert from 'node:assert/strict';
import { interpolate, pencilPixels, squarePixels, brushPixels } from '../src/lib/Brushes.js';

assert.deepEqual(interpolate({ x: 0, y: 0 }, { x: 1, y: 0 }), [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }]);
assert.deepEqual(interpolate({ x: 3, y: 3 }, { x: 3, y: 3 }), [{ x: 3, y: 3 }]);

assert.deepEqual(pencilPixels({ x: 0.5, y: 0.5 }, { x: 3.5, y: 0.5 }, 10, 10).map(p => p.x), [0, 1, 2, 3]);
assert.deepEqual(pencilPixels({ x: -2, y: 0 }, { x: 1.5, y: 0 }, 10, 10).map(p => p.x), [0, 1]);
assert.ok(pencilPixels({ x: 0, y: 0 }, { x: 3, y: 0 }, 10, 10).every(p => p.alpha === 1));

assert.equal(squarePixels({ x: 5, y: 5 }, { x: 5, y: 5 }, 2, 10, 10).length, 4);
assert.equal(squarePixels({ x: 5, y: 5 }, { x: 6, y: 5 }, 2, 10, 10).length, 6); // deduped across the stroke
assert.equal(squarePixels({ x: 0, y: 0 }, { x: 0, y: 0 }, 4, 10, 10).length, 4); // clipped at the edge

const soft = brushPixels({ x: 5.5, y: 5.5 }, { x: 5.5, y: 5.5 }, { size: 1, flow: 1, hardness: 0.5 }, 10, 10);
assert.deepEqual(soft, [{ x: 5, y: 5, alpha: 1 }]);
// brushes of size <= 1 fall off linearly (the old PIXEL-view curve would give 0.354 here)
assert.deepEqual(brushPixels({ x: 5.75, y: 5.5 }, { x: 5.75, y: 5.5 }, { size: 1, flow: 1, hardness: 0 }, 10, 10), [{ x: 5, y: 5, alpha: 0.5 }]);
const hard = brushPixels({ x: 5, y: 5 }, { x: 5, y: 5 }, { size: 4, flow: 0.5, hardness: 1 }, 10, 10);
assert.ok(hard.length > 0 && hard.every(p => p.alpha === 0.5));
const feathered = brushPixels({ x: 5, y: 5 }, { x: 5, y: 5 }, { size: 6, flow: 1, hardness: 0 }, 10, 10);
assert.ok(feathered.some(p => p.alpha < 1) && feathered.every(p => p.alpha > 0 && p.alpha <= 1));
console.log('brushes ok');
