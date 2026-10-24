/**
 * The base layer's record, kept with its pixels: pinned characters (the converter keeps them
 * instead of picking one). Erasing the base is black pixels plus a pinned space. Records are frozen
 * and replaced on every change, like the edit cells, so undo can keep both sides and identity says
 * what changed.
 *
 * BaseRecords = { pins: Map<'col,row', char> }.
 */
import { cellKey, parseKey } from './editCells.js';
import { cellAt } from '../lib/Cells.js';
import { usableChar } from '../lib/CharWidth.js';

const make = (pins) => Object.freeze({ pins });

export const EMPTY_BASE = make(new Map());

export function withPins(records, list) {
  if (list.every(({ col, row, char }) => records.pins.get(cellKey(col, row)) === char)) return records;
  const pins = new Map(records.pins);
  for (const { col, row, char } of list) pins.set(cellKey(col, row), char);
  return make(pins);
}

export function withoutPins(records, cells) {
  const keys = cells.map(({ col, row }) => cellKey(col, row)).filter(key => records.pins.has(key));
  if (!keys.length) return records;
  const pins = new Map(records.pins);
  keys.forEach(key => pins.delete(key));
  return make(pins);
}

// The records on a resized grid (cols x rows grid pixels), following the picture the way the paint
// does (transform: resizeTransform's, in grid pixels): a pin goes to the one cell over its old
// centre, and drops when that's off the grid.
export function remapBaseRecords(records, { offsetX, offsetY, scaleX, scaleY }, cols, rows) {
  if (!records.pins.size) return records;
  const pins = new Map();
  for (const [key, char] of records.pins) {
    const { col, row } = parseKey(key);
    const to = cellAt(offsetX + (col + 0.5) * scaleX, offsetY + (2 * row + 1) * scaleY, cols, rows);
    if (to) pins.set(cellKey(to.col, to.row), char);
  }
  return make(pins);
}

// For the project file: null when there's nothing to save.
export function serializeBase(records) {
  if (!records.pins.size) return null;
  return { pins: [...records.pins] };
}

// Project files are untrusted: anything that isn't a 'col,row' key (or a pin a cell can hold) is
// skipped. Files from before the base had its own pixels kept erased cells as a record too; they come
// back as cells (erased: [{ col, row }]) for the store to erase, unless a pin is on the same cell.
const KEY = /^\d+,\d+$/;
export function deserializeBase(json) {
  const pins = (Array.isArray(json?.pins) ? json.pins : []).filter(pair =>
    Array.isArray(pair) && typeof pair[0] === 'string' && KEY.test(pair[0]) && usableChar(pair[1]));
  const pinned = new Set(pins.map(([key]) => key));
  const erased = (Array.isArray(json?.erased) ? json.erased : [])
    .filter(key => typeof key === 'string' && KEY.test(key) && !pinned.has(key)).map(parseKey);
  return { records: pins.length ? make(new Map(pins)) : EMPTY_BASE, erased };
}
