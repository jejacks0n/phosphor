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

// The largest grid: MAX_COLS wide, MAX_LINES lines tall (two pixel rows a line), MAX_CELLS in all, so
// a narrow piece can run long. The budget keeps whole-grid work (a render, a slider step) to tens of
// milliseconds, and a document well within a browser tab's memory (docs/investigations/viewport-rendering.md).
export const MAX_COLS = 300, MAX_LINES = 5000, MAX_CELLS = 500_000;
export const gridFits = (cols, rows) => cols <= MAX_COLS && rows <= 2 * MAX_LINES && cols * charRowsOf(rows) <= MAX_CELLS;
// The most columns there's room for beside rows, and the most rows beside cols.
export const maxColsBeside = (rows) => Math.min(MAX_COLS, Math.floor(MAX_CELLS / Math.max(1, charRowsOf(rows))));
export const maxRowsBeside = (cols) => Math.min(2 * MAX_LINES, 2 * Math.floor(MAX_CELLS / Math.max(1, cols)));

// The widest grid, at most cols wide, that keeps a picture's ratio (width / height) and fits.
export function lockedGrid(cols, ratio) {
  for (let c = Math.min(cols, MAX_COLS); c > 1; c--) {
    const rows = Math.max(1, Math.ceil(c / ratio));
    if (gridFits(c, rows)) return { cols: c, rows };
  }
  return { cols: 1, rows: Math.min(2 * MAX_LINES, Math.max(1, Math.ceil(1 / ratio))) };
}

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

// How heavy a pixel's character is, 0 to 1, in the ASCII styles: by brightness in Monochrome (white
// heaviest, pure red fairly light), and in Color ASCII by intensity, its strongest channel, so any
// pure color is as heavy as white.
const weightOf = (p, charMode) => (charMode === 'intensity' ? Math.max(p.r, p.g, p.b) / 255 : rgb2gray(p));

// The character for a cell's two pixels by their weight (charMode 'brightness' or 'intensity'),
// lightest first in the set.
export function weightedChar(top, bottom, charset, charMode) {
  const glyphs = glyphsOf(charset);
  const weight = (weightOf(top, charMode) + weightOf(bottom, charMode)) / 2;
  return glyphs[Math.max(0, Math.min(glyphs.length - 1, Math.round(weight * (glyphs.length - 1))))];
}

// color: makes a Color from a pixel (buildCells passes one that shares a Color between the cells of
// that color).
export function buildCell(top, bottom, char, renderStyle, color = colorOf) {
  if (renderStyle !== 'colorAscii' && renderStyle !== 'ascii') {
    return { char, bg: color(top), fg: color(bottom) };
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

export function buildCells(pixels, cols, rows, opts) {
  return buildCellsWith((i) => pixels[i], cols, rows, opts);
}

// The same from a cols x rows canvas's RGBA bytes, without an object per pixel. quantized:
// { indexes, palette } when the bytes are snapped to a palette (indexes: each pixel's entry).
export function buildCellsFromBytes(data, cols, rows, opts, quantized = null) {
  const scratch = [{}, {}]; // the top and bottom pixels being read (Colors copy them)
  return buildCellsWith((i, slot) => {
    const o = i * 4;
    if (o >= data.length) return undefined;
    const p = scratch[slot];
    p.r = data[o]; p.g = data[o + 1]; p.b = data[o + 2];
    p.c = quantized ? quantized.palette[quantized.indexes[i]].c : undefined;
    return p;
  }, cols, rows, opts);
}

// pixelAt(index, slot): the pixel at index (slot 0 for a cell's top, 1 its bottom), or undefined.
// One Color per color, shared by every cell showing it: a grid has far fewer colors than cells,
// and a Color is never changed in place.
function buildCellsWith(pixelAt, cols, rows, { charset, charMode, renderStyle, seed }) {
  const chars = glyphsOf(charset);
  const h = seedHash(seed);
  const cells = new Array(cols * charRowsOf(rows));
  const colors = new Map();
  let lastKey = -1, last = null; // a pixel the color of the one before it (most are) skips the lookup
  const color = (p) => {
    const key = (p.r << 16 | p.g << 8 | p.b) + (typeof p.c === 'number' ? (p.c + 1) * 16777216 : 0);
    if (key === lastKey) return last;
    let found = colors.get(key);
    if (!found) colors.set(key, found = colorOf(p));
    lastKey = key;
    return last = found;
  };

  for (let row = 0; row < charRowsOf(rows); row++) {
    for (let col = 0; col < cols; col++) {
      const top = pixelAt(2 * row * cols + col, 0);
      const bottom = pixelAt((2 * row + 1) * cols + col, 1) || top;
      const char = charMode === 'random' ? chars[cellRandom(h, col, row) % chars.length] : weightedChar(top, bottom, charset, charMode);
      cells[cellIndex(col, row, cols)] = buildCell(top, bottom, char, renderStyle, color);
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
  if (!cells.some(isWide)) return cells;
  return layoutWideRows(cells, cols, cells, Array.from({ length: Math.ceil(cells.length / cols) }, (_, row) => row));
}

// The same for some rows only (an edit's): laid is the layout from before only those rows changed,
// so every other row keeps its own.
export function layoutWideRows(cells, cols, laid, rows) {
  const out = laid.slice();
  for (const row of rows) {
    const end = Math.min((row + 1) * cols, cells.length);
    for (let i = row * cols; i < end; i++) out[i] = cells[i];
    for (let i = row * cols; i < end; i++) {
      const cell = cells[i];
      if (!isWide(cell)) continue;
      if (i === end - 1) {
        out[i] = { ...cell, char: ' ' };
        continue;
      }
      out[i] = { ...cell, wide: 'lead' };
      out[i + 1] = { ...cell, wide: 'trail' };
      i++; // covered
    }
  }
  return out;
}

// Nothing in one UTF-16 unit below U+1100 (where the wide scripts start) is two columns wide, so
// most cells skip the width lookup: this runs over every cell of the grid.
const isWide = (cell) => !!cell && !(cell.char.length === 1 && cell.char.charCodeAt(0) < 0x1100) && cellWidth(cell.char) === 2;

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

// Whether a cell's character shows at all: one drawn in its own background color (a line under
// paint of one color) shows nothing, so Connect doesn't join to it and the Paint Bucket doesn't stop
// at it.
export const showsChar = (cell) => cell.fg.hex !== cell.bg.hex;

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
  for (let i = 0; i < cols * charRowsOf(rows); i++) {
    if (cells[i] && include(i)) putCellPixels(data, cols, i, cells[i]);
  }
  return data;
}

// One cell's two half-colors into such a buffer (cols wide), or nothing there (cell null).
export function putCellPixels(data, cols, i, cell) {
  const col = i % cols, row = (i - col) / cols;
  const halves = cell && halfColors(cell);
  for (const half of [0, 1]) {
    const o = ((2 * row + half) * cols + col) * 4;
    if (!halves) {
      data.fill(0, o, o + 4);
      continue;
    }
    const { r, g, b } = halves[half];
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
}

// The entry that freezes a base cell as an edit cell (merge up, copy, move), from its underlying colors
// ({ char, bg: top half, fg: bottom half }), so it looks as the render style builds it: ANSI keeps
// both halves; Color ASCII shows their average on no background; ASCII shows only the character.
export function bakedEntry(renderStyle, { char, fg, bg }) {
  if (renderStyle === 'ascii') return { char };
  if (renderStyle === 'colorAscii') return { char, fg: rgb2hex(mix(hex2rgb(bg), hex2rgb(fg), 0.5)) };
  return { char, fg, bg };
}
