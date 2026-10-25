/**
 * How wide a character draws, which can be more than the columns it's given (CharWidth.cellWidth):
 * ﷽ gets one column and draws about eleven, ⟿ about two. A terminal keeps every cell in its column
 * and draws such a character's full shape over the cells after it; the views do the same
 * (CellCanvas, the DOM view), so the art looks there as it will in a terminal.
 *
 * Widths are measured in the display font (with the browser's fallbacks for characters it lacks),
 * so they approximate a terminal's own fonts rather than match them exactly.
 */
import { cellWidth } from './CharWidth.js';
import { displayFontCss } from './displayFonts.js';

// The columns a width (in cells) draws over: its own, unless it's noticeably wider (more than a fifth
// of a column over: a hair's overhang, like ŀ's, doesn't count).
export function spanOf(width, columns) {
  return width > columns + 0.2 ? Math.ceil(width - 0.05) : columns;
}

let ctx = null, cellPx = 0, measuredIn = '';
const widths = new Map();
// Measured again once fonts finish loading (a fallback font, or the display font itself).
globalThis.document?.fonts?.addEventListener('loadingdone', () => {
  widths.clear();
  cellPx = 0;
});

// A character's drawn width, in cells of the display font.
export function drawnWidth(char) {
  if (measuredIn !== displayFontCss()) { // the display font changed
    widths.clear();
    cellPx = 0;
    measuredIn = displayFontCss();
  }
  let width = widths.get(char);
  if (width === undefined) {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = measuredIn;
    cellPx ||= ctx.measureText('M').width;
    width = ctx.measureText(char).width / cellPx;
    widths.set(char, width);
  }
  return width;
}

// The columns a character draws over (at least its own).
export const drawnColumns = (char) => spanOf(drawnWidth(char), cellWidth(char));

// For the DOM view, where text flows: the columns a character must be held to (its own), when it
// doesn't draw exactly that wide (a fallback font's ★, 漢 at 1.7 columns, ﷽ at 11); 0 when it does.
export function fitColumns(char) {
  const columns = cellWidth(char);
  return Math.abs(drawnWidth(char) - columns) > 0.05 ? columns : 0;
}

// For each cell of a laid-out grid (layoutWide: wide characters as lead and trail), the overflowing
// character drawing over it, if any: { from: its cell's index, slice: which of its columns this is }.
// span(cell): the columns that cell's character draws over. Spills stay in their row; a later one
// draws over an earlier one, as a terminal draws left to right.
export function layoutSpills(cells, cols, span) {
  const spills = new Array(cells.length).fill(null);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell || cell.wide === 'trail') continue;
    const own = cell.wide === 'lead' ? 2 : 1, rowEnd = i - (i % cols) + cols;
    const reach = Math.min(span(cell), rowEnd - i);
    for (let k = own; k < reach; k++) spills[i + k] = { from: i, slice: k };
  }
  return spills;
}
