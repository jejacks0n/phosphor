/**
 * The output model: one cell per character, built from a pair of vertically adjacent pixels
 * (top -> background, bottom -> foreground) of the cols x rows pipeline canvas.
 *
 * Color = { r, g, b, hex, c }   c: palette index (number) when quantized, else [r, g, b]
 * Cell  = { char, fg: Color, bg: Color }
 */
import { rgb2hex, hex2rgb, rgb2gray, nearestColor } from './ColorUtils.js';
import { coverageOf } from './GlyphCoverage.js';
import { graphemes, cellWidth } from './CharWidth.js';

const ASCII_BG = { r: 0, g: 0, b: 0, hex: '#000000', c: 0 };

// An odd final pixel row has no partner and is dropped from display and export.
export const charRowsOf = (rows) => Math.floor(rows / 2);
export const cellIndex = (col, row, cols) => row * cols + col;
export const cellOfPixel = (x, y) => ({ col: x, row: Math.floor(y / 2) });

// The character cell under a (fractional) grid pixel position, or null when it's off the grid.
export function cellAt(x, y, cols, rows) {
  const col = Math.floor(x), row = Math.floor(y / 2);
  return col >= 0 && row >= 0 && col < cols && row < charRowsOf(rows) ? { col, row } : null;
}

const colorOf = (p) => ({ r: p.r, g: p.g, b: p.b, hex: rgb2hex(p), c: p.c !== undefined ? p.c : [p.r, p.g, p.b] });

// The characters a charset generates from: whole characters (an astral one isn't two UTF-16
// halves), one column wide only so generated cells never overlap, ▄ when nothing's left. Cached for
// the last charset: it's asked once per cell.
let lastCharset = null, lastGlyphs = null;
function glyphsOf(charset) {
  if (charset !== lastCharset) {
    const glyphs = graphemes(charset || '').filter(c => cellWidth(c) === 1);
    lastCharset = charset;
    lastGlyphs = glyphs.length ? glyphs : ['▄'];
  }
  return lastGlyphs;
}

export function brightnessChar(top, bottom, charset) {
  const glyphs = glyphsOf(charset);
  const avgGray = (rgb2gray(top) + rgb2gray(bottom)) / 2;
  return glyphs[Math.max(0, Math.min(glyphs.length - 1, Math.round(avgGray * (glyphs.length - 1))))];
}

export function buildCell(top, bottom, char, renderStyle) {
  if (renderStyle !== 'colorAscii' && renderStyle !== 'ascii') {
    return { char, bg: colorOf(top), fg: colorOf(bottom) };
  }

  // ASCII styles: characters on black; the foreground is the pair's average (or white when monochrome)
  const mono = renderStyle === 'ascii';
  const r = mono ? 255 : (top.r + bottom.r) / 2;
  const g = mono ? 255 : (top.g + bottom.g) / 2;
  const b = mono ? 255 : (top.b + bottom.b) / 2;
  const fg = { r, g, b, hex: mono ? '#FFFFFF' : rgb2hex({ r, g, b }), c: typeof bottom.c === 'number' ? bottom.c : [r, g, b] };
  return { char, bg: { ...ASCII_BG }, fg };
}

// A cell's random character comes from the seed and the cell's own position (not its place in
// reading order), so every cell keeps its character whatever the grid's width or height.
const fmix = (h) => {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};
const seedHash = (seed) => {
  let h = 2166136261;
  for (const ch of String(seed ?? '')) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
};
const cellRandom = (h, col, row) => fmix(h ^ Math.imul(col + 1, 0x9e3779b1) ^ Math.imul(row + 1, 0x85ebca77));

export function buildCells(pixels, cols, rows, { charset, charMode, renderStyle, seed }) {
  const chars = glyphsOf(charset);
  const h = seedHash(seed);
  const cells = new Array(cols * charRowsOf(rows));

  for (let row = 0; row < charRowsOf(rows); row++) {
    for (let col = 0; col < cols; col++) {
      const top = pixels[2 * row * cols + col];
      const bottom = pixels[(2 * row + 1) * cols + col] || top;
      const char = charMode === 'brightness' ? brightnessChar(top, bottom, charset) : chars[cellRandom(h, col, row) % chars.length];
      cells[cellIndex(col, row, cols)] = buildCell(top, bottom, char, renderStyle);
    }
  }
  return cells;
}

// The composed cells laid out the way a terminal shows them: along each row, left to right, a
// two-column character marks its cell the lead and covers the next as its trail (the lead's
// character and colors: a terminal paints both columns with them), so a covered cell never starts
// one of its own; in the last column it has no room (a terminal would wrap it) and shows as a
// space. The same array when nothing is wide.
export function layoutWide(cells, cols) {
  let out = null;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell || cellWidth(cell.char) !== 2) continue;
    out ??= cells.slice();
    if (i % cols === cols - 1) {
      out[i] = { ...cell, char: ' ' };
      continue;
    }
    out[i] = { ...cell, wide: 'lead' };
    out[i + 1] = { ...cell, wide: 'trail' };
    i++; // covered
  }
  return out ?? cells;
}

// A cell rect as text (for the system clipboard): the characters as they show, a line per row. A
// wide character is written once (its trail adds nothing), so the text lines up in a terminal; a
// cell that isn't there (cells from before a grid change) is a space.
export function selectionText(cells, cols, { c0, r0, c1, r1 }) {
  const lines = [];
  for (let row = r0; row <= r1; row++) {
    let line = '';
    for (let col = c0; col <= c1; col++) {
      const cell = cells[cellIndex(col, row, cols)];
      if (cell?.wide !== 'trail') line += cell?.char ?? ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// The unique character cells under grid pixels, in order of first touch (off-grid pixels skipped).
export function cellsOfPixels(pixels, cols, rows) {
  const seen = new Set();
  const cells = [];
  for (const { x, y } of pixels) {
    const cell = cellAt(x, y, cols, rows);
    if (!cell || seen.has(cellIndex(cell.col, cell.row, cols))) continue;
    seen.add(cellIndex(cell.col, cell.row, cols));
    cells.push(cell);
  }
  return cells;
}

const mix = (a, b, t) => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
});

// What a cell looks like at pixel scale: per half, the background blended toward the foreground by
// how much of that half the glyph inks.
export function halfColors(cell, coverage = coverageOf) {
  const [top, bottom] = coverage(cell.char);
  return [mix(cell.bg, cell.fg, top), mix(cell.bg, cell.fg, bottom)];
}

// An edit cell's entry over the generated cell under it. effective(hex) turns a stored color into the
// Color it displays as. ASCII saves white on black, so edit-cell colors are kept but not shown.
export function composeCell(under, entry, renderStyle, effective) {
  const char = entry.char ?? under.char;
  if (renderStyle === 'ascii') return { char, fg: under.fg, bg: under.bg };
  return {
    char,
    fg: entry.fg ? effective(entry.fg) : under.fg,
    bg: entry.bg ? effective(entry.bg) : under.bg,
  };
}

// Characters that are solid or empty in each half (space, █, ▀, ▄) have no texture to show paint
// through: under paint they become a real half-block instead.
export const isSolidGlyph = (char) => coverageOf(char).every(c => c === 0 || c === 1);

// Paint over a cell: a textured character stays, the paint tinting the background (top half) and
// foreground (bottom half), the way image cells are built (buildCell); a solid or empty one becomes
// ▄, each half the glyph's own color under the paint. Unpainted cells are returned as is.
export function coverCell(cell, paintTop, paintBottom, { renderStyle, palette }) {
  const aTop = paintTop?.a ?? 0, aBottom = paintBottom?.a ?? 0;
  if (!aTop && !aBottom) return cell;
  const solid = isSolidGlyph(cell.char);
  const [ht, hb] = solid ? halfColors(cell) : [cell.bg, cell.fg];
  const snap = (p) => (palette && palette.length ? nearestColor(p, palette) : p);
  const top = snap(aTop ? mix(ht, paintTop, aTop) : ht);
  const bottom = snap(aBottom ? mix(hb, paintBottom, aBottom) : hb);
  return buildCell(top, bottom, solid && renderStyle === 'ansi' ? '▄' : cell.char, renderStyle);
}

// Cells as pixels: each included cell's two half-colors (top, bottom) at grid resolution, as an
// RGBA buffer cols x rows (alpha 255 for included cells, 0 elsewhere and on an odd last pixel row).
export function cellsToPixels(cells, cols, rows, include) {
  const data = new Uint8ClampedArray(cols * rows * 4);
  const cellRows = charRowsOf(rows);
  for (let row = 0; row < cellRows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = cellIndex(col, row, cols);
      if (!cells[i] || !include(i)) continue;
      const [top, bottom] = halfColors(cells[i]);
      for (const [half, { r, g, b }] of [[0, top], [1, bottom]]) {
        const o = ((2 * row + half) * cols + col) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
  }
  return data;
}

// The entry that freezes a base cell as an edit cell (merge up, copy, move), from its underlying colors
// ({ char, bg: top half, fg: bottom half }), so it looks as the render style builds it: ANSI keeps
// both halves; Color ASCII shows their average on no background; ASCII shows only the character.
export function bakedEntry(renderStyle, { char, fg, bg }) {
  if (renderStyle === 'ascii') return { char };
  if (renderStyle === 'colorAscii') return { char, fg: rgb2hex(mix(hex2rgb(bg), hex2rgb(fg), 0.5)) };
  return { char, fg, bg };
}
