/**
 * The font the art is drawn in, and Phosphor's own fonts (WorkspaceStore.displayFont: one of these,
 * or one you load, userFonts.js; FontField picks it, and its size). The cells, the canvas's glyphs,
 * glyph coverage (GlyphCoverage: how drawn characters look at pixel scale), overflow widths
 * (DrawnWidth) and the glyph cells in the palettes are all measured in it, and follow it when it
 * changes.
 *
 * The 8x16 fonts share the IBM VGA font's cell, so a character one lacks falls back to the next on
 * the same grid (src/assets/fonts/README.md); wide characters and emoji come from the system's fonts.
 */
import { decodeBlocks, decodeFont, fitFont, fontKey, glyphRows, ninthSlots, ownWidthOf, slotOf } from './BitmapFont.js';
import { decodeLines } from './FontLines.js';
import { registerBitmapFont, releaseBitmapFont } from './userFonts.js';

export const DISPLAY_FONTS = Object.freeze([
  { id: 'vga', name: 'IBM VGA', family: '"IBM VGA 8x16", "Phosphor Unscii", monospace', size: 16, lineHeight: 1 },
  { id: 'jetbrains', name: 'JetBrains Mono', family: '"JetBrains Mono", monospace', size: 17, lineHeight: 1.2 },
  { id: 'unscii', name: 'Unscii', family: '"Phosphor Unscii", monospace', size: 16, lineHeight: 1 },
  { id: 'unifont', name: 'Unifont', family: '"Phosphor Unifont", monospace', size: 16, lineHeight: 1 },
].map(Object.freeze));

// The font a new drawing, a fresh browser and every fallback mean by "the default" (first in the list).
export const DEFAULT_FONT_ID = 'vga';
export const DEFAULT_FONT = DISPLAY_FONTS.find((f) => f.id === DEFAULT_FONT_ID);

// The sizes FontField allows, in CSS px (and a host's font is held to: wire.fontFor).
export const MIN_FONT_SIZE = 6, MAX_FONT_SIZE = 64;

// The current font: { id, name, family, size (CSS px), lineHeight }, and for a drawing's bitmap font
// bitmap: true and source (its base64, BitmapFont.encodeFont). Read it when it's used; it changes in place.
export const DISPLAY_FONT = { ...DEFAULT_FONT };

// The current font (or another) as a canvas/CSS font shorthand.
export const displayFontCss = (font = DISPLAY_FONT) => `${font.size}px ${font.family}`;

let scratch = null;

// A character in the current font (or another) in a width x height px box (scale: px per CSS px):
// on the baseline CSS gives a line that tall (the font's ascent below its top, less half the
// leading, to the whole pixel), squeezed into the box when wider. Its RGBA bytes: anti-aliased (canvas text
// always is) when smooth, as the canvas view draws it; otherwise a pixel over half covered is
// fully the fill's and the rest clear, as glyph coverage counts it. A color glyph (an emoji) keeps
// its own colors. A bitmap font's glyph is its own pixels (a character it lacks, its stand-in's: BitmapFont.fitFont),
// scaled to the box, sharp either way: text drawn in its TrueType font bleeds into the pixels around (Chrome on a Mac),
// which would draw it fat.
export function drawGlyph(char, width, height, scale = 1, fill = '#fff', smooth = false, font = DISPLAY_FONT) {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  const bitmap = font.bitmap && bitmapOf(font);
  if (bitmap) {
    ctx.fillStyle = fill;
    const slot = slotOf(fitFont(char, bitmap), bitmap) ?? 32, rows = glyphRows(bitmap, slot), edge = (n, of, size) => Math.ceil(n * size / of);
    const cols = bitmap.cellWidth ?? 8, ninth = cols === 9 && ninthSlots(bitmap).has(slot);   // the cell's columns: 8 bits, and a ninth that repeats the eighth
    for (let r = 0; r < bitmap.height; r++) {
      for (let b = 0; b < cols; b++) {
        if (!(b < 8 ? (rows[r] >> (7 - b)) & 1 : ninth && rows[r] & 1)) continue;
        const x0 = edge(b, cols, width), y0 = edge(r, bitmap.height, height); // the pixels whose nearest bit is this one
        ctx.fillRect(x0, y0, edge(b + 1, cols, width) - x0, edge(r + 1, bitmap.height, height) - y0);
      }
    }
    return ctx.getImageData(0, 0, width, height).data;
  }
  ctx.font = `${font.size * scale}px ${font.family}`;
  ctx.fillStyle = fill;
  const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = ctx.measureText('M');
  ctx.fillText(char, 0, Math.round((height - ascent - descent) / 2 + ascent), width);
  const data = ctx.getImageData(0, 0, width, height).data;
  if (!smooth) for (let i = 0; i < data.length; i += 4) data[i + 3] = data[i + 3] > 127 ? 255 : 0;
  return data;
}

// Enough for the drawing's font, a room's and a change or two of either; past it the oldest is let go (decoded again,
// or its face registered again, if it comes back). The Fonts page's faces stay (userFonts.registerBitmapFont).
const MOST_BITMAPS = 4;

// A bitmap font spec's font, with the blocks it names (none: they're found), the drawn width (8, 9, or the font's own
// narrow width; anything else is 8) and the line styles that 9 repeats a column for, decoded once for each source,
// blocks, width and lines (null when it doesn't decode), for the MOST_BITMAPS last used.
const bitmaps = new Map();
export function bitmapOf({ source, name, blocks, width, lines }) {
  const key = `${source}|${blocks ?? ''}|${width}|${lines ?? ''}`;
  let font = bitmaps.get(key);
  if (font === undefined) {
    const decoded = decodeFont(source, name), set = decodeBlocks(blocks), l = decodeLines(lines);
    font = decoded && { ...decoded, ...(set && { blocks: set }), ...(l && { lines: l }) };
    if (font) font.cellWidth = width === 9 || width === ownWidthOf(font) ? width : 8;   // ownWidthOf 4-7 are the offered narrow widths, 8 is 8
  }
  bitmaps.delete(key);
  bitmaps.set(key, font);   // the newest last
  if (bitmaps.size > MOST_BITMAPS) bitmaps.delete(bitmaps.keys().next().value);
  return font;
}

// The bitmap faces loadFontFaces registered, oldest first. Past MOST_BITMAPS the oldest that isn't the display font's
// is taken off the page.
let faces = [];
function usedFace(key) {
  faces = [...faces.filter((k) => k !== key), key];
  const shown = DISPLAY_FONT.bitmap && bitmapOf(DISPLAY_FONT);
  const keep = shown && fontKey(shown);
  while (faces.length > MOST_BITMAPS) {
    const old = faces.find((k) => k !== keep);
    faces = faces.filter((k) => k !== old);
    releaseBitmapFont(old);
  }
}

// Make a font the current one, and the CSS variables the views style their text with: one of
// DISPLAY_FONTS by id (the first, for an unknown one), or a font of its shape. Resolves once every
// font in its stack has loaded, so what's measured next is measured in them. A bitmap font (bitmap:
// true) is registered first, from its source (loadFontFaces).
export async function setDisplayFont(font) {
  const next = typeof font === 'string' ? DISPLAY_FONTS.find((f) => f.id === font) ?? DEFAULT_FONT : font;
  for (const key of Object.keys(DISPLAY_FONT)) if (!(key in next)) delete DISPLAY_FONT[key]; // a bitmap font's bitmap and source go with it
  Object.assign(DISPLAY_FONT, next);
  const style = globalThis.document?.documentElement.style;
  if (!style) return;
  style.setProperty('--display-font-family', DISPLAY_FONT.family);
  style.setProperty('--display-font-size', `${DISPLAY_FONT.size}px`);
  style.setProperty('--display-line-height', String(DISPLAY_FONT.lineHeight));
  await loadFontFaces(DISPLAY_FONT);
}

// Resolves once every face of every font in a font's stack has loaded (or failed to). A bitmap font is registered
// first, from its source: a room's, which a watcher never sets, draws in its own face too.
export async function loadFontFaces(font) {
  const bitmap = font.bitmap && bitmapOf(font);
  if (bitmap) await registerBitmapFont(bitmap, { keep: false }).then(() => usedFace(fontKey(bitmap)), () => {});
  const families = font.family.split(',').map((name) => name.trim().replace(/^"|"$/g, ''));
  await Promise.all([...document.fonts].filter((face) => families.includes(face.family.replace(/^"|"$/g, ''))).map((face) => face.load().catch(() => {})));
}
