/**
 * The base layer's record, kept with its pixels: pinned characters (the converter keeps them
 * instead of picking one). Erasing the base is black pixels plus a pinned space. Records are frozen
 * and replaced on every change, like the edit cells, so undo can keep both sides and identity says
 * what changed.
 *
 * BaseRecords = { pins: Map<'col,row', char>, indexes: Map<'col,row', { fgIndex?, bgIndex? }> }. Indexes sit beside a
 * pin: the 256-color index its cell's color was given when a lower index shares the color (xterm's 16 and 231, as edit
 * cells' fgIndex and bgIndex), so the export writes it back.
 */
import { cellKey, parseKey } from './editCells.js';
import { cellAt } from '../lib/Cells.js';
import { usableChar } from '../lib/CharWidth.js';

const make = (pins, indexes = new Map()) => Object.freeze({ pins, indexes });

export const EMPTY_BASE = make(new Map());

// A cell's indexes ({ fgIndex?, bgIndex? }) as kept beside its pin, or undefined when it has none.
const indexesOf = ({ fgIndex, bgIndex }) => (fgIndex === undefined && bgIndex === undefined ? undefined
  : Object.freeze({ ...(fgIndex !== undefined && { fgIndex }), ...(bgIndex !== undefined && { bgIndex }) }));
const sameIndexes = (a, b) => a?.fgIndex === b?.fgIndex && a?.bgIndex === b?.bgIndex;

// list: [{ col, row, char, fgIndex?, bgIndex? }], each cell pinned to its char with its indexes (none when it has none).
export function withPins(records, list) {
  if (list.every((cell) => {
    const key = cellKey(cell.col, cell.row);
    return records.pins.get(key) === cell.char && sameIndexes(records.indexes.get(key), cell);
  })) return records;
  const pins = new Map(records.pins), indexes = new Map(records.indexes);
  for (const cell of list) {
    const key = cellKey(cell.col, cell.row), kept = indexesOf(cell);
    pins.set(key, cell.char);
    if (kept) indexes.set(key, kept);
    else indexes.delete(key);
  }
  return make(pins, indexes);
}

export function withoutPins(records, cells) {
  const keys = cells.map(({ col, row }) => cellKey(col, row)).filter(key => records.pins.has(key));
  if (!keys.length) return records;
  const pins = new Map(records.pins), indexes = new Map(records.indexes);
  keys.forEach(key => { pins.delete(key); indexes.delete(key); });
  return make(pins, indexes);
}

// The records on a resized grid (cols x rows grid pixels), following the picture the way the paint
// does (transform: resizeTransform's, in grid pixels): a pin goes to the one cell over its old
// center, and drops when that's off the grid.
export function remapBaseRecords(records, { offsetX, offsetY, scaleX, scaleY }, cols, rows) {
  if (!records.pins.size) return records;
  const pins = new Map(), indexes = new Map();
  for (const [key, char] of records.pins) {
    const { col, row } = parseKey(key);
    const to = cellAt(offsetX + (col + 0.5) * scaleX, offsetY + (2 * row + 1) * scaleY, cols, rows);
    if (!to) continue;
    pins.set(cellKey(to.col, to.row), char);
    if (records.indexes.has(key)) indexes.set(cellKey(to.col, to.row), records.indexes.get(key));
    else indexes.delete(cellKey(to.col, to.row)); // another pin landed here before
  }
  return make(pins, indexes);
}

// For the project file: null when there's nothing to save.
export function serializeBase(records) {
  if (!records.pins.size) return null;
  return { pins: [...records.pins], ...(records.indexes.size && { indexes: [...records.indexes] }) };
}

// Project files (and a room's base) are untrusted: anything that isn't a 'col,row' key (or a pin a cell can hold, or an
// index that's a whole number under 256 beside a pin) is skipped; files from before indexes have none. Files from before
// the base had its own pixels kept erased cells as a record too; they come back as cells (erased: [{ col, row }]) for the
// store to erase, unless a pin is on the same cell.
const KEY = /^\d+,\d+$/;
const isIndex = (v) => Number.isInteger(v) && v >= 0 && v < 256;
export function deserializeBase(json) {
  const pins = (Array.isArray(json?.pins) ? json.pins : []).filter(pair =>
    Array.isArray(pair) && typeof pair[0] === 'string' && KEY.test(pair[0]) && usableChar(pair[1]));
  const pinned = new Set(pins.map(([key]) => key));
  const indexes = (Array.isArray(json?.indexes) ? json.indexes : [])
    .filter(pair => Array.isArray(pair) && pinned.has(pair[0]) && pair[1] && typeof pair[1] === 'object')
    .map(([key, { fgIndex, bgIndex }]) => [key, indexesOf({ fgIndex: isIndex(fgIndex) ? fgIndex : undefined, bgIndex: isIndex(bgIndex) ? bgIndex : undefined })])
    .filter(([, kept]) => kept);
  const erased = (Array.isArray(json?.erased) ? json.erased : [])
    .filter(key => typeof key === 'string' && KEY.test(key) && !pinned.has(key)).map(parseKey);
  return { records: pins.length ? make(new Map(pins), new Map(indexes)) : EMPTY_BASE, erased };
}
