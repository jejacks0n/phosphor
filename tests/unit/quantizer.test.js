// The color-count palette (median cut). A picture pushed hard by brightness or contrast is
// mostly pure white and black: its median falls in a box's last slice, and the box must still be
// cut, not given up on (that left one color: the whole picture's average, shown as a solid fill).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import quantize from '../../src/lib/Quantizer.js';

test('The color-count palette (median cut)', async () => {
  const image = (colors) => Uint8ClampedArray.from(colors.flatMap(([r, g, b]) => [r, g, b, 255]));
  const near = (palette, [r, g, b]) => palette.some(p => Math.abs(p.r - r) + Math.abs(p.g - g) + Math.abs(p.b - b) < 40);

  // Half white, a third black, the rest a red ramp: the median along every axis is in the last slice.
  const clipped = image([
    ...Array(600).fill([255, 255, 255]),
    ...Array(400).fill([0, 0, 0]),
    ...Array.from({ length: 200 }, (_, i) => [255, Math.round(i * 1.2), 255]),
  ]);
  const palette = quantize(clipped, 16);
  assert.ok(palette.length >= 3, `a clipped picture keeps its colors (got ${palette.length})`);
  assert.ok(near(palette, [255, 255, 255]) && near(palette, [0, 0, 0]), 'white and black both survive');

  assert.equal(quantize(image([...Array(50).fill([255, 0, 0]), ...Array(50).fill([0, 0, 255])]), 16).length, 2); // two colors: two
  assert.equal(quantize(image(Array(10).fill([9, 9, 9])), 16).length, 1);                                         // one color: one

  // No more colors than asked for: those exact colors, not their 5-bit buckets' middles.
  const four = image([...Array(30).fill([255, 0, 0]), ...Array(20).fill([0, 255, 0]), ...Array(10).fill([0, 0, 255]), ...Array(5).fill([255, 255, 255])]);
  const hex = (p) => p.map(({ r, g, b }) => [r, g, b].join()).sort();
  assert.deepEqual(hex(quantize(four, 256)), ['0,0,255', '0,255,0', '255,0,0', '255,255,255']);
  assert.deepEqual(hex(quantize(four, 4)), ['0,0,255', '0,255,0', '255,0,0', '255,255,255']);
  assert.equal(quantize(four, 3).length, 3);                                                                       // more than asked: median cut
});

