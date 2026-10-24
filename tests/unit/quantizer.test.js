// The colour-count palette (median cut). A picture pushed hard by brightness or contrast is
// mostly pure white and black: its median falls in a box's last slice, and the box must still be
// cut, not given up on (that left one colour: the whole picture's average, shown as a solid fill).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import quantize, { makeRoom } from '../../src/lib/Quantizer.js';

test('The colour-count palette (median cut)', async () => {
  const image = (colors) => Uint8ClampedArray.from(colors.flatMap(([r, g, b]) => [r, g, b, 255]));
  const near = (palette, [r, g, b]) => palette.some(p => Math.abs(p.r - r) + Math.abs(p.g - g) + Math.abs(p.b - b) < 40);

  // Half white, a third black, the rest a red ramp: the median along every axis is in the last slice.
  const clipped = image([
    ...Array(600).fill([255, 255, 255]),
    ...Array(400).fill([0, 0, 0]),
    ...Array.from({ length: 200 }, (_, i) => [255, Math.round(i * 1.2), 255]),
  ]);
  const palette = quantize(clipped, 16);
  assert.ok(palette.length >= 3, `a clipped picture keeps its colours (got ${palette.length})`);
  assert.ok(near(palette, [255, 255, 255]) && near(palette, [0, 0, 0]), 'white and black both survive');

  assert.equal(quantize(image([...Array(50).fill([255, 0, 0]), ...Array(50).fill([0, 0, 255])]), 16).length, 2); // two colours: two
  assert.equal(quantize(image(Array(10).fill([9, 9, 9])), 16).length, 1);                                         // one colour: one

  // No more colours than asked for: those exact colours, not their 5-bit buckets' middles.
  const four = image([...Array(30).fill([255, 0, 0]), ...Array(20).fill([0, 255, 0]), ...Array(10).fill([0, 0, 255]), ...Array(5).fill([255, 255, 255])]);
  const hex = (p) => p.map(({ r, g, b }) => [r, g, b].join()).sort();
  assert.deepEqual(hex(quantize(four, 256)), ['0,0,255', '0,255,0', '255,0,0', '255,255,255']);
  assert.deepEqual(hex(quantize(four, 4)), ['0,0,255', '0,255,0', '255,0,0', '255,255,255']);
  assert.equal(quantize(four, 3).length, 3);                                                                       // more than asked: median cut
});

// "Make room" (the Number palette trial): the picture's colours stay; a drawn colour far from all of
// them gets a slot by merging the two closest picture colours (weighted by their pixels).
test('Make room: drawn colours get slots by merging the closest pair, the rest stays', () => {
  const key = (p) => p.map(({ r, g, b }) => [r, g, b].join()).sort();
  const base = [
    { r: 0, g: 0, b: 0, weight: 100 }, { r: 200, g: 0, b: 0, weight: 50 },
    { r: 0, g: 0, b: 200, weight: 30 }, { r: 0, g: 0, b: 210, weight: 10 },
  ];
  // Full (4 of 4): white merges the two blues, weighted 30:10.
  const four = makeRoom(base, [{ r: 255, g: 255, b: 255, count: 5 }], 4);
  assert.deepEqual(key(four), key([{ r: 0, g: 0, b: 0 }, { r: 200, g: 0, b: 0 }, { r: 0, g: 0, b: 203 }, { r: 255, g: 255, b: 255 }]));
  // Room to spare: added, nothing merged.
  assert.deepEqual(key(makeRoom(base, [{ r: 255, g: 255, b: 255, count: 5 }], 8)), key([...base, { r: 255, g: 255, b: 255 }]));
  // Near a palette colour already (a soft-brush blend): no slot.
  assert.deepEqual(key(makeRoom(base, [{ r: 205, g: 6, b: 4, count: 9 }], 4)), key(base));
  // No more than half the slots go to the drawing, most-used colours first.
  const drawn = [{ r: 255, g: 255, b: 255, count: 1 }, { r: 0, g: 255, b: 0, count: 9 }, { r: 255, g: 255, b: 0, count: 5 }];
  const two = makeRoom(base, drawn, 4);
  assert.ok(key(two).includes('0,255,0') && key(two).includes('255,255,0') && !key(two).includes('255,255,255'));
});
