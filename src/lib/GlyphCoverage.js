/**
 * How much of a glyph's top and bottom half is inked, as [top, bottom] fractions (0..1) of its
 * character cell. A cell's two half-colours are bg × (1 − ink) + fg × ink, which is how authored cells
 * look at pixel scale and what paint blends over.
 *
 * Block elements are exact. Other glyphs are rasterized in the ANSI view's font once a rasterizer is
 * installed (the app does that once that font has loaded); until then they count as half-inked.
 */

// The ANSI view's font (AnsiEditor.vue's <pre> styles must match).
export const DISPLAY_FONT = { family: '"JetBrains Mono", monospace', size: 17, lineHeight: 1.2 };
export const DISPLAY_FONT_CSS = `${DISPLAY_FONT.size}px ${DISPLAY_FONT.family}`;

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

// Browser only: draw the glyph in the display font in one cell (advance width x line height, text
// centred in the line like CSS does) and count inked pixels per half.
let scratch = null;
export function rasterizeCoverage(char) {
  if (!scratch) scratch = document.createElement('canvas');
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.font = DISPLAY_FONT_CSS;
  const width = Math.max(1, Math.round(ctx.measureText('M').width));
  const height = Math.round(DISPLAY_FONT.size * DISPLAY_FONT.lineHeight / 2) * 2; // even, so the halves match
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.font = DISPLAY_FONT_CSS;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(char, 0, height / 2);
  const { data } = ctx.getImageData(0, 0, width, height);
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
