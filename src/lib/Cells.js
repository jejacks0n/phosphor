/**
 * The output model: one cell per character, built from a pair of vertically adjacent pixels
 * (top -> background, bottom -> foreground) of the cols x rows pipeline canvas.
 *
 * Color = { r, g, b, hex, c }   c: palette index (number) when quantized, else [r, g, b]
 * Cell  = { char, fg: Color, bg: Color }
 */
import Random from 'random-seed';
import { rgb2hex, rgb2gray } from './ColorUtils.js';

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

export function brightnessChar(top, bottom, charset) {
  const avgGray = (rgb2gray(top) + rgb2gray(bottom)) / 2;
  return charset[Math.max(0, Math.min(charset.length - 1, Math.round(avgGray * (charset.length - 1))))];
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

export function buildCells(pixels, cols, rows, { charset, charMode, renderStyle, seed }) {
  const chars = charset || '▄';
  const rand = new Random(seed);
  const cells = new Array(cols * charRowsOf(rows));

  for (let row = 0; row < charRowsOf(rows); row++) {
    for (let col = 0; col < cols; col++) {
      const top = pixels[2 * row * cols + col];
      const bottom = pixels[(2 * row + 1) * cols + col] || top;
      const char = charMode === 'brightness' ? brightnessChar(top, bottom, chars) : chars[rand(chars.length)];
      cells[cellIndex(col, row, cols)] = buildCell(top, bottom, char, renderStyle);
    }
  }
  return cells;
}
