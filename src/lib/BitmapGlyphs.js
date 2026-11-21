// The pure glyph functions of a bitmap font, kept free of the app's imports so a plain Node script can load them.

// The eight block characters, in the order a font's blocks are kept, with the slot CP437 draws each in.
export const BLOCKS = Object.freeze([
  ['full', '█', 219], ['lower', '▄', 220], ['upper', '▀', 223], ['left', '▌', 221],
  ['right', '▐', 222], ['light', '░', 176], ['medium', '▒', 177], ['dark', '▓', 178],
].map(([key, char, slot]) => Object.freeze({ key, char, slot })));
export const CP437_BLOCKS = Object.freeze(BLOCKS.map((b) => b.slot));

// What each solid block's quarters (top-left, top-right, bottom-left, bottom-right) should hold.
const IDEALS = { full: [1, 1, 1, 1], lower: [0, 0, 1, 1], upper: [1, 1, 0, 0], left: [1, 0, 1, 0], right: [0, 1, 0, 1] };

// The slot of each block in a font, found from its pixels: null where it has none. A slot goes to one block.
export function findBlocks(font) {
  const taken = new Set();
  return BLOCKS.map(({ key, slot: home }) => {
    let found = null;
    const ideal = IDEALS[key];
    if (ideal) {
      const score = (s) => maskOf(font, s, 2, 2).reduce((sum, v, i) => sum + Math.abs(v - ideal[i]), 0);
      if (!taken.has(home) && score(home) < 0.7) found = home;
      else {
        let best = 0.7;
        for (let s = 0; s < 256; s++) {
          const v = taken.has(s) || s === home ? Infinity : score(s);
          if (v < best) [best, found] = [v, s];
        }
      }
    } else if (!taken.has(home)) {
      const ink = maskOf(font, home, 1, 1)[0];
      if (ink > 0.08 && ink < 0.92 && maskOf(font, home, 2, 2).every((v) => Math.abs(v - ink) < 0.2)) found = home;
    }
    if (found !== null) taken.add(found);
    return found;
  });
}

export const glyphRows = (font, slot) => font.bytes.subarray(slot * font.height, (slot + 1) * font.height);

export const lit = (rows, x, y) => (rows[y] >> (7 - x)) & 1;

// The box-averaged ink fraction over an sw x sh grid, row-major; boxes that cut pixels weigh by area.
export function maskOf(font, slot, sw, sh) {
  const rows = glyphRows(font, slot);
  const out = new Float32Array(sw * sh);
  const bw = 8 / sw;
  const bh = font.height / sh;
  for (let gy = 0; gy < sh; gy++) {
    for (let gx = 0; gx < sw; gx++) {
      let sum = 0;
      for (let y = Math.floor(gy * bh); y < Math.min(font.height, Math.ceil((gy + 1) * bh)); y++) {
        const oy = Math.min(y + 1, (gy + 1) * bh) - Math.max(y, gy * bh);
        if (oy <= 0) continue;
        for (let x = Math.floor(gx * bw); x < Math.min(8, Math.ceil((gx + 1) * bw)); x++) {
          const ox = Math.min(x + 1, (gx + 1) * bw) - Math.max(x, gx * bw);
          if (ox > 0 && lit(rows, x, y)) sum += ox * oy;
        }
      }
      out[gy * sw + gx] = sum / (bw * bh);
    }
  }
  return out;
}

export function fontId(font) {
  let h = 0x811c9dc5;
  for (const b of [font.height, ...font.bytes]) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return `bitmap-${h.toString(16).padStart(8, '0')}`;
}

// What the Fonts page and the library's index show of a font: these characters, drawn from the slots CP437 puts them in.
export const SAMPLE_CHARS = 'Aa░▒▓█▄▀╔═╗☺';

// How wide a font's glyphs really are: the rightmost lit column of any slot, plus one (8 when nothing is lit).
export function ownWidthOf(font) {
  let any = 0;
  for (const b of font.bytes) any |= b;
  return any ? 8 - (31 - Math.clz32(any & -any)) : 8;
}

export const NARROW_WIDTHS = Object.freeze([4, 5, 6, 7]);

// The own width when it's one a font is offered narrow at, else null.
export function narrowWidthOf(font) {
  const w = ownWidthOf(font);
  return NARROW_WIDTHS.includes(w) ? w : null;
}
