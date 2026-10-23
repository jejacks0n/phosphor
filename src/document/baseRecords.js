/**
 * The base layer's own records, kept with the image: erased cells (shown blank) and pinned
 * characters (the converter keeps them instead of picking one). Records are frozen and replaced on
 * every change, like the edit cells, so undo can keep both sides and identity says what changed.
 *
 * BaseRecords = { erased: Set<'col,row'>, pins: Map<'col,row', char> }. A cell is in at most one:
 * erasing a cell drops its pin, pinning one un-erases it.
 */
import { cellKey, parseKey } from './editCells.js';
import { cellAt, charRowsOf } from '../lib/Cells.js';

const make = (erased, pins) => Object.freeze({ erased, pins });

export const EMPTY_BASE = make(new Set(), new Map());

export function withErased(records, cells) {
  const keys = cells.map(({ col, row }) => cellKey(col, row));
  if (keys.every(key => records.erased.has(key))) return records;
  const pins = new Map(records.pins);
  keys.forEach(key => pins.delete(key));
  return make(new Set([...records.erased, ...keys]), pins);
}

export function withPins(records, list) {
  if (list.every(({ col, row, char }) => records.pins.get(cellKey(col, row)) === char)) return records;
  const erased = new Set(records.erased), pins = new Map(records.pins);
  for (const { col, row, char } of list) {
    const key = cellKey(col, row);
    erased.delete(key);
    pins.set(key, char);
  }
  return make(erased, pins);
}

export function withoutPins(records, cells) {
  const keys = cells.map(({ col, row }) => cellKey(col, row)).filter(key => records.pins.has(key));
  if (!keys.length) return records;
  const pins = new Map(records.pins);
  keys.forEach(key => pins.delete(key));
  return make(records.erased, pins);
}

// The records on a resized grid (cols x rows grid pixels), following the picture the way the paint
// does (transform: resizeTransform's, in grid pixels). An erased cell covers every new cell whose
// centre lies in its old area, so it stretches and shrinks with the paint; a pin goes to the one
// cell over its old centre. Cells that land off the grid drop; a pin beats an erase.
export function remapBaseRecords(records, { offsetX, offsetY, scaleX, scaleY }, cols, rows) {
  if (!records.erased.size && !records.pins.size) return records;
  const pins = new Map();
  for (const [key, char] of records.pins) {
    const { col, row } = parseKey(key);
    const to = cellAt(offsetX + (col + 0.5) * scaleX, offsetY + (2 * row + 1) * scaleY, cols, rows);
    if (to) pins.set(cellKey(to.col, to.row), char);
  }
  const erased = new Set();
  const cellRows = charRowsOf(rows);
  for (const key of records.erased) {
    const { col, row } = parseKey(key);
    // New cells with centre (c + 0.5, 2r + 1) inside the old cell's area, in new grid pixels.
    const x0 = offsetX + col * scaleX, x1 = offsetX + (col + 1) * scaleX;
    const y0 = offsetY + 2 * row * scaleY, y1 = offsetY + 2 * (row + 1) * scaleY;
    const c0 = Math.max(0, Math.ceil(x0 - 0.5)), c1 = Math.min(cols, Math.ceil(x1 - 0.5));
    const r0 = Math.max(0, Math.ceil((y0 - 1) / 2)), r1 = Math.min(cellRows, Math.ceil((y1 - 1) / 2));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) if (!pins.has(cellKey(c, r))) erased.add(cellKey(c, r));
    }
  }
  return make(erased, pins);
}

// For the project file: null when there's nothing to save.
export function serializeBase(records) {
  if (!records.erased.size && !records.pins.size) return null;
  return { erased: [...records.erased], pins: [...records.pins] };
}

// Project files are untrusted: anything that isn't a 'col,row' key (or a one-character pin) is skipped.
const KEY = /^\d+,\d+$/;
export function deserializeBase(json) {
  const erased = (Array.isArray(json?.erased) ? json.erased : []).filter(key => typeof key === 'string' && KEY.test(key));
  const pins = (Array.isArray(json?.pins) ? json.pins : []).filter(pair =>
    Array.isArray(pair) && typeof pair[0] === 'string' && KEY.test(pair[0]) && typeof pair[1] === 'string' && [...pair[1]].length === 1);
  if (!erased.length && !pins.length) return EMPTY_BASE;
  return make(new Set(erased.filter(key => !pins.some(([pin]) => pin === key))), new Map(pins));
}
