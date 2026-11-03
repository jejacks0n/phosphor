/**
 * Dithering to a palette: a picture's grid pixels snapped to the palette in a pattern of its colors,
 * so a gradient between two of them comes out as a mix of both instead of a band of one.
 *
 * - 'floyd' (Floyd–Steinberg): each pixel's error (its color less the palette color it got) is
 *   passed on to the pixels right of it and below it, so the colors average out to the picture's.
 * - 'bayer' (ordered): each pixel is nudged lighter or darker by its place in a 4x4 pattern before
 *   it snaps, a regular crosshatch that stays put when the picture around it changes.
 *
 * strength (0..1) scales the error passed on, or the nudge; 0 is a plain snap.
 */
import { paletteIndex } from './ColorUtils.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const byte = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

// RGBA bytes (w x h) dithered to the palette: new bytes, the same alpha (none becomes opaque, as a
// plain snap writes it).
export function ditherPixels(data, w, h, palette, { style = 'floyd', strength = 1 } = {}) {
  const out = new Uint8ClampedArray(data.length);
  const floyd = style !== 'bayer';
  const work = floyd ? Float32Array.from(data) : data;
  // About one step between palette colors: a nudge that size moves a color across to its neighbor.
  const spread = 255 / Math.max(1, Math.cbrt(palette.length) - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let r = work[o], g = work[o + 1], b = work[o + 2];
      if (!floyd) {
        const nudge = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 15 / 32) * spread * strength;
        r += nudge; g += nudge; b += nudge;
      }
      const p = palette[paletteIndex(byte(r), byte(g), byte(b), palette)];
      out[o] = p.r; out[o + 1] = p.g; out[o + 2] = p.b; out[o + 3] = data[o + 3] || 255;
      if (floyd && strength) {
        const er = (r - p.r) * strength, eg = (g - p.g) * strength, eb = (b - p.b) * strength;
        const pass = (dx, dy, f) => {
          const xx = x + dx;
          if (xx < 0 || xx >= w || y + dy >= h) return;
          const q = ((y + dy) * w + xx) * 4;
          work[q] += er * f; work[q + 1] += eg * f; work[q + 2] += eb * f;
        };
        pass(1, 0, 7 / 16); pass(-1, 1, 3 / 16); pass(0, 1, 5 / 16); pass(1, 1, 1 / 16);
      }
    }
  }
  return out;
}
