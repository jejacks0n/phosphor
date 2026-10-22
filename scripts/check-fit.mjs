// Invariant behind Merge Layers: an image baked at cols*k x rows*k (integer edit scale k) must re-fit
// into the grid as identity, otherwise every merge shifts/shrinks the image. Run: node scripts/check-fit.mjs
import assert from 'node:assert/strict';
import { fitRect } from '../src/lib/Canvas.js';

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
console.log('fitRect ok');
