import { expect, it } from 'vitest';
import { ttfOf } from '@/lib/BitmapTtf.js';
import { drawGlyph } from '@/lib/displayFonts.js';

const bytes = new Uint8Array(256 * 16);
for (let r = 0; r < 16; r++) {
  bytes[65 * 16 + r] = r % 2 ? 0x55 : 0xaa;
  bytes[r] = 0xff;
}
const face = new FontFace('BT', ttfOf({ name: 'BT', height: 16, bytes }));
await face.load();
document.fonts.add(face);
const font = { family: '"BT"', size: 16, lineHeight: 1 };

// macOS font smoothing bleeds a lit pixel's neighbors to about half alpha, so lit means nearly opaque.
const lit = (char) => {
  const d = drawGlyph(char, 8, 16, 1, '#fff', true, font);
  return Array.from({ length: 128 }, (_, i) => d[i * 4 + 3] > 200);
};

it('draws a glyph pixel for pixel', () => {
  expect(lit('A')).toEqual(Array.from({ length: 128 }, (_, i) => (((i >> 3) % 2 ? 0x55 : 0xaa) & (0x80 >> (i % 8))) !== 0));
});
it('draws slot 0 as its own glyph', () => {
  expect(lit('␀').every(Boolean)).toBe(true);
});
it('is 8 pixels wide at its height', () => {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '16px "BT"';
  expect(ctx.measureText('M').width).toBe(8);
});
it('loads a font whose name has a character above U+FFFF', async () => {
  await new FontFace('BT2', ttfOf({ name: 'A😀', height: 8, bytes: new Uint8Array(256 * 8).fill(1) })).load();
});
it('loads a font with no pixels lit', async () => {
  await new FontFace('BT3', ttfOf({ name: 'Blank', height: 8, bytes: new Uint8Array(256 * 8) })).load();
});
