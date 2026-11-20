// Bitmap fonts for the block tests, built from VGA-shaped glyphs. Every slot not named holds a mark in its
// top-left corner with an empty top row: no block, and never a shade.
const rowsOf = (h, f) => Array.from({ length: h }, (_, r) => f(r));
const solid = (h, byte) => rowsOf(h, () => byte);
const lowerHalf = (h) => rowsOf(h, (r) => (r >= Math.floor(h / 2) ? 0xff : 0));
const checker = (a, b) => (h) => rowsOf(h, (r) => (r % 2 ? b : a));
const mark = (h) => rowsOf(h, (r) => (r >= 1 && r < h / 2 - 1 ? 0xf0 : 0));

export function fontWith(glyphs, height = 16) {
  const bytes = new Uint8Array(256 * height);
  for (let slot = 0; slot < 256; slot++) {
    const g = glyphs[slot];
    bytes.set(typeof g === 'function' ? g(height) : g ?? mark(height), slot * height);
  }
  return { name: 'T', height, bytes };
}

const cp437 = {
  219: (h) => solid(h, 0xff), 220: lowerHalf, 223: (h) => solid(h, 0xff).map((b, r) => (r < h / 2 ? b : 0)),
  221: (h) => solid(h, 0xf0), 222: (h) => solid(h, 0x0f),
  176: checker(0x88, 0x22), 177: checker(0xaa, 0x55), 178: checker(0xdd, 0x77),
};
const blank = (h) => solid(h, 0);

export const cp437Font = fontWith(cp437);
export const lowerAt240 = fontWith({ ...cp437, 220: undefined, 240: lowerHalf });
export const noLowerHalf = fontWith({ ...cp437, 220: blank });
export const solidAt220 = fontWith({ ...cp437, 219: blank, 220: (h) => solid(h, 0xff) });
export const lightAt240 = fontWith({ ...cp437, 176: blank, 240: checker(0x88, 0x22), 179: (h) => solid(h, 0x18), 186: (h) => solid(h, 0x66), 72: (h) => solid(h, 0x7e) });

// Slanted's block shapes: the top rows shifted a pixel, the shades the uneven IBM VGA patterns.
const slanted = (top, bottom) => (h) => rowsOf(h, (r) => (r < 7 ? top : bottom));
const vga = (hex) => () => hex.split(' ').map((x) => parseInt(x, 16));
export const slantedLike = fontWith({
  219: slanted(0x7f, 0xff), 220: slanted(0x00, 0xff), 223: slanted(0x7f, 0x00), 221: slanted(0x78, 0xf0), 222: slanted(0x07, 0x0f),
  176: vga('00 88 88 22 22 22 88 88 00 22 22 00 88 88 00 22'),
  177: vga('00 aa 82 55 54 aa aa 55 55 aa aa 55 55 aa aa 55'),
  178: vga('00 77 77 ff dd ff 77 77 ff dd dd ff 77 77 ff dd'),
});

// Nine rows: the lower half starts in row 4 (a row long) or row 5.
const rowsFrom = (start) => (h) => rowsOf(h, (r) => (r >= start ? 0xff : 0));
export const nineRowFontWithLowerHalfRows4to8 = fontWith({ 220: rowsFrom(4) }, 9);
export const nineRowFontWithLowerHalfRows5to8 = fontWith({ 220: rowsFrom(5) }, 9);
