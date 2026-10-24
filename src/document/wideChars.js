/**
 * Editing around wide characters the way a terminal does (spec rule 4), on the laid-out cells
 * (layoutWide: a wide character's cell is its lead, the cell it covers its trail). Writing over
 * either half of a wide character turns the other half into a space; the text cursor never rests on
 * a trail; erasing a trail erases its lead. Layers don't matter: a wide character pinned in the base
 * is broken the same way, by an edit cell's space.
 */
import { cellIndex } from '../lib/Cells.js';

const wideAt = (cells, cols, col, row) => (col >= 0 && col < cols ? cells[cellIndex(col, row, cols)]?.wide : undefined);

// The columns on row to turn into spaces when a character `width` columns wide is written at col.
export function overwrites(cells, cols, col, row, width) {
  const blanks = new Set();
  const here = wideAt(cells, cols, col, row);
  if (here === 'trail') blanks.add(col - 1);
  if (here === 'lead' || width === 2) blanks.add(col + 1);
  if (width === 2 && wideAt(cells, cols, col + 1, row) === 'lead') blanks.add(col + 2);
  blanks.delete(col);
  return [...blanks].filter(c => c >= 0 && c < cols);
}

// Where the cursor goes instead of a trail: past it moving right (dc > 0), else onto its lead.
export function snapCursor(cells, cols, cursor, dc) {
  const { col, row } = cursor;
  if (wideAt(cells, cols, col, row) !== 'trail') return cursor;
  if (dc > 0 && col + 1 < cols && wideAt(cells, cols, col + 1, row) !== 'trail') return { col: col + 1, row };
  return { col: col - 1, row };
}

// The cells with the lead of every trail among them added.
export function withLeads(cells, cols, list) {
  const out = new Map(list.map(c => [`${c.col},${c.row}`, c]));
  for (const { col, row } of list) {
    if (wideAt(cells, cols, col, row) === 'trail') out.set(`${col - 1},${row}`, { col: col - 1, row });
  }
  return [...out.values()];
}
