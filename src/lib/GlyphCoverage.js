/**
 * How much of a glyph's top and bottom half is inked, as [top, bottom] fractions (0..1) of its
 * character cell. A cell's two half-colors are bg × (1 − ink) + fg × ink, which is how edit cells
 * look at pixel scale and what paint blends over.
 *
 * Block elements are exact. Other glyphs are rasterized in the ANSI view's font once a rasterizer is
 * installed (the app does that once that font has loaded); until then they count as half-inked.
 */

import { DISPLAY_FONT, DISPLAY_FONTS, displayFontCss, drawGlyph, loadFontFaces } from './displayFonts.js';

const EXACT = new Map([
  [' ', [0, 0]], ['\u00a0', [0, 0]],
  ['▀', [1, 0]], ['▄', [0, 1]], ['█', [1, 1]], ['▌', [0.5, 0.5]], ['▐', [0.5, 0.5]],
  ['░', [0.25, 0.25]], ['▒', [0.5, 0.5]], ['▓', [0.75, 0.75]],
  ['▖', [0, 0.5]], ['▗', [0, 0.5]], ['▘', [0.5, 0]], ['▝', [0.5, 0]], ['▚', [0.5, 0.5]], ['▞', [0.5, 0.5]],
  ['▙', [0.5, 1]], ['▟', [0.5, 1]], ['▛', [1, 0.5]], ['▜', [1, 0.5]],
]);
const UNKNOWN = [0.5, 0.5];

let rasterizer = null;
const cache = new Map();

export function setGlyphRasterizer(fn) {
  rasterizer = fn;
  cache.clear();
}

export function coverageOf(char) {
  const exact = EXACT.get(char);
  if (exact) return exact;
  if (!rasterizer) return UNKNOWN;
  if (!cache.has(char)) cache.set(char, rasterizer(char) ?? UNKNOWN);
  return cache.get(char);
}

// Browser only: draw the glyph in the display font in one cell (advance width x line height), as
// the canvas view does (displayFonts.drawGlyph), and count inked pixels per half.
let measure = null;
export function rasterizeCoverage(char) {
  measure ??= document.createElement('canvas').getContext('2d');
  measure.font = displayFontCss();
  const width = Math.max(1, Math.round(measure.measureText('M').width));
  const height = Math.round(DISPLAY_FONT.size * DISPLAY_FONT.lineHeight / 2) * 2; // even, so the halves match
  return inkOfHalves(drawGlyph(char, width, height), width, height);
}

// The inked pixels (over half covered) of the top and bottom half of drawn RGBA bytes, as fractions.
function inkOfHalves(data, width, height) {
  const half = width * height / 2;
  let top = 0, bottom = 0;
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] > 127) {
      if (i < half) top++;
      else bottom++;
    }
  }
  return [top / half, bottom / half];
}

// The reference font: Best match and By shape measure glyphs in IBM VGA (8 x 16, the font's own cell),
// never the display font, so the same document picks the same characters in every browser. A glyph it
// lacks is measured in its fallback on the same grid.
const REFERENCE = DISPLAY_FONTS.find((font) => font.id === 'vga');
const REF_W = 8, REF_H = 16;

// Until the font has loaded a glyph is drawn in a placeholder, so nothing is cached before then.
let referenceLoaded = null, referenceReady = false;
export function loadReferenceFont() {
  return referenceLoaded ??= loadFontFaces(REFERENCE).then(() => { referenceReady = true; });
}

const referenceInks = new Map();
export function referenceInk(char) {
  const exact = EXACT.get(char);
  if (exact) return exact;
  let ink = referenceInks.get(char);
  if (!ink) {
    ink = inkOfHalves(drawGlyph(char, REF_W, REF_H, 1, '#fff', false, REFERENCE), REF_W, REF_H);
    if (referenceReady) referenceInks.set(char, ink);
  }
  return ink;
}

// Block elements as rectangles [x0, y0, x1, y1] of the cell (0..1); ░ ▒ ▓ as a flat level.
const UL = [0, 0, 0.5, 0.5], UR = [0.5, 0, 1, 0.5], LL = [0, 0.5, 0.5, 1], LR = [0.5, 0.5, 1, 1];
const BLOCK_RECTS = new Map([
  ['▀', [[0, 0, 1, 0.5]]], ['▄', [[0, 0.5, 1, 1]]], ['█', [[0, 0, 1, 1]]],
  ['▌', [[0, 0, 0.5, 1]]], ['▐', [[0.5, 0, 1, 1]]],
  ['▖', [LL]], ['▗', [LR]], ['▘', [UL]], ['▝', [UR]], ['▚', [UL, LR]], ['▞', [UR, LL]],
  ['▙', [UL, LL, LR]], ['▟', [UR, LL, LR]], ['▛', [UL, UR, LL]], ['▜', [UL, UR, LR]],
]);
const FLAT = new Map([['░', 0.25], ['▒', 0.5], ['▓', 0.75]]);

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

const referenceMasks = new Map();
// The ink in each of sw x sh samples of the glyph's cell, row-major from the top, 0..1 each.
export function referenceMask(char, sw = 4, sh = 8) {
  const key = `${sw}x${sh}${char}`;
  let mask = referenceMasks.get(key);
  if (mask) return mask;
  mask = new Float32Array(sw * sh);
  const rects = BLOCK_RECTS.get(char);
  if (FLAT.has(char)) mask.fill(FLAT.get(char));
  else if (rects) {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let covered = 0;
        for (const [x0, y0, x1, y1] of rects) {
          covered += overlap(x / sw, (x + 1) / sw, x0, x1) * overlap(y / sh, (y + 1) / sh, y0, y1);
        }
        mask[y * sw + x] = covered * sw * sh;
      }
    }
  } else if (!EXACT.has(char)) {
    const data = drawGlyph(char, REF_W, REF_H, 1, '#fff', true, REFERENCE);
    const counts = new Float32Array(sw * sh);
    for (let y = 0; y < REF_H; y++) {
      for (let x = 0; x < REF_W; x++) {
        const at = Math.floor(y * sh / REF_H) * sw + Math.floor(x * sw / REF_W);
        mask[at] += data[(y * REF_W + x) * 4 + 3] / 255;
        counts[at]++;
      }
    }
    for (let i = 0; i < mask.length; i++) mask[i] /= counts[i] || 1;
  }
  if (referenceReady) referenceMasks.set(key, mask);
  return mask;
}
