/**
 * The base layer's record, kept with its pixels: pinned characters (the converter keeps them
 * instead of picking one). Erasing the base is black pixels plus a pinned space. Records are frozen
 * and replaced on every change, like the edit cells, so undo can keep both sides and identity says
 * what changed.
 *
 * BaseRecords = { pins: Map<'col,row', char>, indexes: Map<'col,row', { fgIndex?, bgIndex? }> }. Indexes sit beside a
 * pin: the 256-color index its cell's color was given when a lower index shares the color (xterm's 16 and 231, as edit
 * cells' fgIndex and bgIndex), so the export writes it back. chars: the ▄ pins that are characters (Map<'col,row', true>):
 * a ▄ pin is otherwise its cell's two pixels as ANSI shows them (a merge's or Colors only's), which the ASCII styles
 * convert (Renderer.pinAt); one of these was a laid or typed ▄ and shows as ▄ in every style. docs/model.md R15.
 */
import { cellKey, moveCells, parseKey } from './editCells.js';
import { cellAt } from '../lib/Cells.js';
import { usableChar } from '../lib/CharWidth.js';

const make = (pins, indexes = new Map(), chars = new Map()) => Object.freeze({ pins, indexes, chars });

// Whether the pin at key is a ▄ that's a character (chars), not two pixels.
export const isCharPin = (records, key) => records.chars.has(key) && records.pins.get(key) === '▄';

export const EMPTY_BASE = make(new Map());

// A cell's indexes ({ fgIndex?, bgIndex? }) as kept beside its pin, or undefined when it has none.
const indexesOf = ({ fgIndex, bgIndex }) => (fgIndex === undefined && bgIndex === undefined ? undefined
  : Object.freeze({ ...(fgIndex !== undefined && { fgIndex }), ...(bgIndex !== undefined && { bgIndex }) }));
const sameIndexes = (a, b) => a?.fgIndex === b?.fgIndex && a?.bgIndex === b?.bgIndex;

// list: [{ col, row, char, fgIndex?, bgIndex?, glyph? }], each cell pinned to its char with its indexes (none when it has
// none). glyph: whether a ▄ is a character (chars); left out, a ▄ written over a ▄ keeps what it was (a recolor, a
// flip), and any other character has none.
export function withPins(records, list) {
  const charAfter = (cell, key) => cell.char === '▄' && (cell.glyph ?? isCharPin(records, key));
  if (list.every((cell) => {
    const key = cellKey(cell.col, cell.row);
    return records.pins.get(key) === cell.char && sameIndexes(records.indexes.get(key), cell) && charAfter(cell, key) === records.chars.has(key);
  })) return records;
  const pins = new Map(records.pins), indexes = new Map(records.indexes), chars = new Map(records.chars);
  for (const cell of list) {
    const key = cellKey(cell.col, cell.row), kept = indexesOf(cell), glyph = charAfter(cell, key);
    pins.set(key, cell.char);
    if (kept) indexes.set(key, kept);
    else indexes.delete(key);
    if (glyph) chars.set(key, true);
    else chars.delete(key);
  }
  return make(pins, indexes, chars);
}

export function withoutPins(records, cells) {
  const keys = cells.map(({ col, row }) => cellKey(col, row)).filter(key => records.pins.has(key));
  if (!keys.length) return records;
  const pins = new Map(records.pins), indexes = new Map(records.indexes), chars = new Map(records.chars);
  keys.forEach(key => { pins.delete(key); indexes.delete(key); chars.delete(key); });
  return make(pins, indexes, chars);
}

// The records with line and column moves made (moveCells): each pin goes with its indexes.
export function movePins(records, moves) {
  const pins = moveCells(records.pins, moves);
  return pins === records.pins ? records : make(pins, moveCells(records.indexes, moves), moveCells(records.chars, moves));
}

// The records on a resized grid (cols x rows grid pixels), following the picture the way the paint
// does (transform: resizeTransform's, in grid pixels): a pin goes to the one cell over its old
// center, and drops when that's off the grid.
export function remapBaseRecords(records, { offsetX, offsetY, scaleX, scaleY }, cols, rows) {
  if (!records.pins.size) return records;
  const pins = new Map(), indexes = new Map(), chars = new Map();
  for (const [key, char] of records.pins) {
    const { col, row } = parseKey(key);
    const to = cellAt(offsetX + (col + 0.5) * scaleX, offsetY + (2 * row + 1) * scaleY, cols, rows);
    if (!to) continue;
    const at = cellKey(to.col, to.row);
    pins.set(at, char);
    if (records.indexes.has(key)) indexes.set(at, records.indexes.get(key));
    else indexes.delete(at); // another pin landed here before
    if (records.chars.has(key)) chars.set(at, true);
    else chars.delete(at);
  }
  return make(pins, indexes, chars);
}

// For the project file: null when there's nothing to save.
export function serializeBase(records) {
  if (!records.pins.size) return null;
  return { pins: [...records.pins], ...(records.indexes.size && { indexes: [...records.indexes] }), ...(records.chars.size && { chars: [...records.chars.keys()] }) };
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
  const pinOf = new Map(pins), chars = (Array.isArray(json?.chars) ? json.chars : []).filter((key) => pinOf.get(key) === '▄'); // a ▄ pin's alone
  const erased = (Array.isArray(json?.erased) ? json.erased : [])
    .filter(key => typeof key === 'string' && KEY.test(key) && !pinned.has(key)).map(parseKey);
  return { records: pins.length ? make(new Map(pins), new Map(indexes), new Map(chars.map((key) => [key, true]))) : EMPTY_BASE, erased };
}
