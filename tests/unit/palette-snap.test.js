// Snapping a color to a palette (every quantization goes through paletteIndex): a color that is
// in the palette is itself, even where the 5-bit lookup for large palettes would lump two close
// shades together; anything else gets the lookup's nearest.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { paletteIndex, nearestColor, rgb2hex } from '../../src/lib/ColorUtils.js';

test('Snapping a color to a palette: palette colors are themselves, others their nearest', () => {
  // 20 colors (the lookup path), with shades closer than its 8-level steps.
  const rgbs = [[255, 255, 255], [250, 250, 250], [248, 248, 248], [0, 0, 0], [3, 3, 3], [255, 0, 0], [252, 4, 4]];
  for (let i = 0; rgbs.length < 20; i++) rgbs.push([i * 12, 128, 255 - i * 12]);
  const palette = rgbs.map(([r, g, b], c) => ({ r, g, b, c, hex: rgb2hex({ r, g, b }) }));
  palette.forEach(({ r, g, b }, i) => assert.equal(paletteIndex(r, g, b, palette), i, `${rgb2hex({ r, g, b })} is itself`));
  assert.equal(nearestColor({ r: 1, g: 1, b: 1 }, palette).hex, '#000000');
  assert.ok(['#ff0000', '#fc0404'].includes(nearestColor({ r: 254, g: 1, b: 2 }, palette).hex));
});
