/**
 * How much of a glyph's top and bottom half is inked, as [top, bottom] fractions (0..1) of its
 * character cell. A cell's two half-colors are bg × (1 − ink) + fg × ink, which is how edit cells
 * look at pixel scale and what paint blends over.
 *
 * Block elements are exact. Other glyphs are rasterized in the ANSI view's font once a rasterizer is
 * installed (the app does that once that font has loaded); until then they count as half-inked.
 */

import { DISPLAY_FONT, displayFontCss, drawGlyph } from './displayFonts.js';

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
  const data = drawGlyph(char, width, height);
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
