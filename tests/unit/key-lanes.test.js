// The Keys panel's lanes: lined up with the scrubber while frames fit, a scrolling, zoomable window past that.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MIN_FRAME_PX, frameAt, labelEvery, laneLayout, xOf, zoomAround } from '../../src/lib/keyLanes.js';

const lanes = (count, width, more = {}) => laneLayout({ count, width, thumb: 17, zoom: null, scroll: 0, minPx: MIN_FRAME_PX, ...more });

test('fits while frames are 14px or more apart', () => {
  const fits = lanes(11, 157); // 140px of thumb travel over 10 gaps
  assert.equal(fits.fits, true);
  assert.equal(fits.px, 14);
  assert.deepEqual([fits.first, fits.last], [0, 10]);
  assert.deepEqual([xOf(0, fits), xOf(5, fits), xOf(10, fits)], [8.5, 78.5, 148.5]); // the scrubber's marks
  assert.deepEqual([frameAt(80, fits), frameAt(-50, fits), frameAt(500, fits)], [5, 0, 10]);

  const tight = lanes(12, 157);
  assert.equal(tight.fits, false);
  assert.equal(tight.px, 14);
  assert.equal(lanes(11, 157, { zoom: 20 }).fits, false); // zoomed in
  assert.equal(lanes(11, 157, { zoom: 10 }).fits, true); // zoomed out past fitting: lined up again
  assert.equal(lanes(1, 157).fits, true);
});

test('scroll clamps at both ends', () => {
  const start = lanes(200, 517, { scroll: -50 });
  assert.equal(start.scroll, 0);
  assert.deepEqual([start.first, start.last], [0, 35]);
  const end = lanes(200, 517, { scroll: 99999 });
  assert.equal(end.scroll, 199 * 14 + 17 - 517);
  assert.deepEqual([end.first, end.last], [164, 199]);
  assert.equal(xOf(199, end), 517 - 8.5); // the last frame where the scrubber's is
  assert.equal(frameAt(517, end), 199);
  const px = 21.000509842090043, width = 326.6402549119539; // frame 112 just at the right end, which floats put a hair past
  assert.equal(laneLayout({ count: 200, width, thumb: 17, zoom: px, scroll: 112 * px + 17 - width, minPx: 14 }).last, 112);
});

test('zoomAround keeps the frame under the pointer', () => {
  const before = lanes(200, 517, { scroll: 700 });
  const under = (layout, x) => (layout.scroll + x - 8.5) / layout.px;
  for (const factor of [1.25, 1 / 1.25, 3]) {
    const { zoom, scroll } = zoomAround(before, factor, 200);
    const after = lanes(200, 517, { zoom, scroll });
    assert.equal(after.px, 14 * factor);
    assert.ok(Math.abs(under(after, 200) - under(before, 200)) < 1e-9);
    assert.equal(frameAt(200, after), frameAt(200, before));
  }
  // Zoomed out until every frame fits again: back to fitting, if that's at least the usable width.
  assert.deepEqual(zoomAround(lanes(11, 300, { zoom: 30 }), 1 / 1.25, 100), { zoom: null, scroll: 0 });
  // If fitting is tighter than that, the zoom stops at fitting.
  const out = zoomAround(lanes(200, 517, { zoom: 3 }), 1 / 1.25, 100);
  assert.equal(lanes(200, 517, out).fits, true);
  assert.notEqual(out.zoom, null);
});

test('labelEvery thins numbers', () => {
  assert.deepEqual([20, 14, 13.9, 4, 3.9, 1].map(labelEvery), [1, 1, 5, 5, 10, 10]);
});
