// Brush pixel generation shared by both editors (grid pixels, clipped to the grid).
// Run: node scripts/check-brushes.mjs
import assert from 'node:assert/strict';
import { interpolate, pencilPixels, squarePixels, brushPixels, rectPixels, ellipsePixels, ellipseCoverage, boxCells } from '../src/lib/Brushes.js';

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
// Shapes: inputs are floored and normalized (drag any direction); results clip to the grid.
assert.equal(rectPixels({ x: 3, y: 3 }, { x: 0, y: 0 }, false, 10, 10).length, 12);   // 4x4 outline
assert.equal(rectPixels({ x: 0, y: 0 }, { x: 3, y: 3 }, true, 10, 10).length, 16);
assert.equal(rectPixels({ x: 8, y: 8 }, { x: 12, y: 12 }, true, 10, 10).length, 4);   // clipped
assert.equal(rectPixels({ x: 2, y: 2 }, { x: 2, y: 2 }, false, 10, 10).length, 1);
assert.ok(ellipsePixels({ x: 2, y: 2 }, { x: 2, y: 2 }, false, 10, 10).length >= 1);  // tiny: still a pixel
assert.ok(ellipsePixels({ x: 0, y: 0 }, { x: 1, y: 1 }, true, 10, 10).length >= 1);
const ring = ellipsePixels({ x: 0, y: 0 }, { x: 8, y: 6 }, false, 20, 20);
const disc = ellipsePixels({ x: 0, y: 0 }, { x: 8, y: 6 }, true, 20, 20);
assert.ok(ring.length < disc.length && ring.every(p => disc.some(q => q.x === p.x && q.y === p.y)));
assert.ok(disc.every(p => p.x >= 0 && p.x <= 8 && p.y >= 0 && p.y <= 6));               // inscribed
assert.equal(new Set(ring.map(p => `${p.x},${p.y}`)).size, ring.length);               // no duplicates
assert.ok([[4, 0], [0, 3], [8, 3], [4, 6]].every(([x, y]) => ring.some(p => p.x === x && p.y === y))); // touches each side
assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 2, r1: 1 }, 'double', 80, 25).map(c => c.char).join(''), '╔═╗╚═╝');
assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 2, r1: 0 }, 'single', 80, 25).map(c => c.char).join(''), '───');
assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 0, r1: 1 }, 'single', 80, 25).map(c => c.char).join(''), '││');
assert.deepEqual(boxCells({ c0: 3, r0: 3, c1: 3, r1: 3 }, 'double', 80, 25).map(c => c.char).join(''), '═');
assert.deepEqual(boxCells({ c0: 0, r0: 0, c1: 2, r1: 2 }, 'single', 80, 25).map(c => `${c.col},${c.row}`), ['0,0', '1,0', '2,0', '0,1', '2,1', '0,2', '1,2', '2,2']); // outline only
assert.deepEqual(boxCells({ c0: 2, r0: 1, c1: 0, r1: 0 }, 'double', 80, 25).map(c => c.char).join(''), '╔═╗╚═╝'); // dragged backwards
const clipped = boxCells({ c0: 78, r0: 23, c1: 81, r1: 26 }, 'single', 80, 25);
assert.ok(clipped.every(c => c.col < 80 && c.row < 25));                                  // nothing off the grid
assert.deepEqual(clipped.map(c => c.char).join(''), '┌─│');                               // cols 78-79, rows 23-24: the real corner stays a corner
// Anti-aliased: full coverage inside, partial at the edge, nothing outside; the ring stays inside the disc.
const cover = ellipseCoverage(0, 0, 9, 9, true);
assert.equal(cover(4, 4), 1);
assert.equal(cover(0, 0), 0);
assert.ok(cover(1, 1) > 0 && cover(1, 1) < 1);
const aaRing = ellipsePixels({ x: 0, y: 0 }, { x: 9, y: 9 }, false, 20, 20, true);
assert.ok(aaRing.every(p => p.alpha > 0 && p.alpha <= cover(p.x, p.y)));
assert.ok(!aaRing.some(p => p.x === 4 && p.y === 4));                                     // hollow
assert.ok(ellipsePixels({ x: 2, y: 2 }, { x: 2, y: 2 }, false, 10, 10, true).length === 1);  // tiny: still a pixel
const t0 = performance.now();
ellipsePixels({ x: -1000, y: -1000 }, { x: 1300, y: 1300 }, false, 300, 300);
ellipsePixels({ x: -1000, y: -1000 }, { x: 1300, y: 1300 }, false, 60, 60, true);
assert.ok(performance.now() - t0 < 15, 'off-grid area is skipped');
console.log('brushes ok');
