// EditLayer's pure math: integer paint scale, grid-resize remapping, and where a saved
// paint layer lands on load. Run: node scripts/check-edit-layer.mjs
import assert from 'node:assert/strict';
import { editScaleFor, resizeTransform, savedPaintRect } from '../src/document/EditLayer.js';

assert.equal(editScaleFor(378, 790, 80, 168), 5);
assert.equal(editScaleFor(10, 10, 80, 50), 1);
assert.equal(editScaleFor(40000, 40000, 300, 300), 13); // capped: floor(4000 / 300)

const same = { dx: 16, dy: 0, dw: 47, dh: 100 };
assert.deepEqual(resizeTransform(same, same), { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });
assert.deepEqual(resizeTransform({ dx: 0, dy: 0, dw: 80, dh: 168 }, { dx: 10, dy: 0, dw: 40, dh: 84 }),
  { offsetX: 10, offsetY: 0, scaleX: 0.5, scaleY: 0.5 });

// Current saves store the grid-sized layer: stretch it over the whole layer.
assert.deepEqual(savedPaintRect({ width: 400, height: 500 }, { width: 378, height: 790 }, { dx: 16, dy: 0, dw: 48, dh: 100 }, 5, 400, 500),
  { x: 0, y: 0, w: 400, h: 500 });
// Older saves (examples/*.phosphor) store paint at the image's size: place it where the image sits.
assert.deepEqual(savedPaintRect({ width: 378, height: 790 }, { width: 378, height: 790 }, { dx: 16, dy: 0, dw: 48, dh: 100 }, 5, 400, 500),
  { x: 80, y: 0, w: 240, h: 500 });
console.log('edit layer ok');
