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
export const DISPLAY_FONTS = Object.freeze([
  { id: 'jetbrains', name: 'JetBrains Mono', family: '"JetBrains Mono", monospace', size: 17, lineHeight: 1.2 },
  { id: 'vga', name: 'IBM VGA', family: '"IBM VGA 8x16", "Phosphor Unscii", monospace', size: 16, lineHeight: 1 },
  { id: 'unscii', name: 'Unscii', family: '"Phosphor Unscii", monospace', size: 16, lineHeight: 1 },
  { id: 'unifont', name: 'Unifont', family: '"Phosphor Unifont", monospace', size: 16, lineHeight: 1 },
].map(Object.freeze));

// The sizes FontField allows, in CSS px (and a host's font is held to: wire.fontFor).
export const MIN_FONT_SIZE = 6, MAX_FONT_SIZE = 64;

// The current font: { id, name, family, size (CSS px), lineHeight }. Read it when it's used; it
// changes in place.
export const DISPLAY_FONT = { ...DISPLAY_FONTS[0] };

// The current font (or another) as a canvas/CSS font shorthand.
export const displayFontCss = (font = DISPLAY_FONT) => `${font.size}px ${font.family}`;

let scratch = null;

// A character in the current font (or another) in a width x height px box (scale: px per CSS px):
// on the baseline CSS gives a line that tall (the font's ascent below its top, less half the
// leading, to the whole pixel), squeezed into the box when wider. Its RGBA bytes: anti-aliased (canvas text
// always is) when smooth, as the canvas view draws it; otherwise a pixel over half covered is
// fully the fill's and the rest clear, as glyph coverage counts it. A color glyph (an emoji) keeps
// its own colors.
export function drawGlyph(char, width, height, scale = 1, fill = '#fff', smooth = false, font = DISPLAY_FONT) {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.font = `${font.size * scale}px ${font.family}`;
  ctx.fillStyle = fill;
  const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = ctx.measureText('M');
  ctx.fillText(char, 0, Math.round((height - ascent - descent) / 2 + ascent), width);
  const data = ctx.getImageData(0, 0, width, height).data;
  if (!smooth) for (let i = 0; i < data.length; i += 4) data[i + 3] = data[i + 3] > 127 ? 255 : 0;
  return data;
}

// Make a font the current one, and the CSS variables the views style their text with: one of
// DISPLAY_FONTS by id (the first, for an unknown one), or a font of its shape. Resolves once every
// font in its stack has loaded, so what's measured next is measured in them.
export async function setDisplayFont(font) {
  Object.assign(DISPLAY_FONT, typeof font === 'string' ? DISPLAY_FONTS.find((f) => f.id === font) ?? DISPLAY_FONTS[0] : font);
  const style = globalThis.document?.documentElement.style;
  if (!style) return;
  style.setProperty('--display-font-family', DISPLAY_FONT.family);
  style.setProperty('--display-font-size', `${DISPLAY_FONT.size}px`);
  style.setProperty('--display-line-height', String(DISPLAY_FONT.lineHeight));
  await loadFontFaces(DISPLAY_FONT);
}

// Resolves once every face of every font in a font's stack has loaded (or failed to).
export async function loadFontFaces(font) {
  const families = font.family.split(',').map((name) => name.trim().replace(/^"|"$/g, ''));
  await Promise.all([...document.fonts].filter((face) => families.includes(face.family.replace(/^"|"$/g, ''))).map((face) => face.load().catch(() => {})));
}
