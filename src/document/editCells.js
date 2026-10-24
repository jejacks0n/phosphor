/**
 * The edit layer's cells: a sparse Map<'col,row', Entry> over the generated cells. Entries are
 * frozen and the Map is replaced on every change (copy-on-write), so undo can keep both sides and
 * callers can compare identity to see whether anything changed.
 *
 * Entry = { char?, fg?, bg? }: fg/bg are underlying colours ('#rrggbb'); a missing attribute shows
 * what's underneath. Keys are grid positions, so entries outside a shrunken grid are kept.
 */
import { usableChar } from '../lib/CharWidth.js';
import { getEffectiveColor } from '../lib/PixelTransforms.js';

const ATTRS = ['char', 'fg', 'bg'];

export const cellKey = (col, row) => `${col},${row}`;

export function parseKey(key) {
  const [col, row] = key.split(',').map(Number);
  return { col, row };
}

// The merged entry for one cell: attrs' strings set, null removes, undefined leaves as is.
// Returns `old` itself when nothing changes and null when no attributes remain. Bulk operations
// apply this per cell on a single Map copy.
export function mergeEntry(old, attrs) {
  const next = { ...old };
  for (const attr of ATTRS) {
    if (attrs[attr] === null) delete next[attr];
    else if (attrs[attr] !== undefined) next[attr] = attrs[attr];
  }
  if (!ATTRS.some(attr => attr in next)) return null;
  if (old && ATTRS.every(attr => old[attr] === next[attr])) return old;
  return Object.freeze(next);
}

export function withCellEdit(map, col, row, attrs) {
  const key = cellKey(col, row);
  const old = map.get(key);
  const next = mergeEntry(old, attrs);
  if (next === (old ?? null)) return map;
  const result = new Map(map);
  if (next) result.set(key, next);
  else result.delete(key);
  return result;
}

export function withoutCells(map, cells) {
  const keys = cells.map(({ col, row }) => cellKey(col, row)).filter(key => map.has(key));
  if (!keys.length) return map;
  const result = new Map(map);
  keys.forEach(key => result.delete(key));
  return result;
}

export const serializeEditCells = (map) => [...map];

// Project files are untrusted: keep only col,row keys, chars a cell can hold and #rrggbb colours.
const VALID = {
  char: usableChar,
  fg: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
  bg: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
};
export function deserializeEditCells(pairs) {
  const map = new Map();
  for (const [key, entry] of Array.isArray(pairs) ? pairs : []) {
    if (typeof key !== 'string' || !/^\d+,\d+$/.test(key) || !entry) continue;
    const clean = Object.fromEntries(ATTRS.filter(attr => VALID[attr](entry[attr])).map(attr => [attr, entry[attr]]));
    if (Object.keys(clean).length) map.set(key, Object.freeze(clean));
  }
  return map;
}

// Older projects stored char edits keyed by cell index at the file's column count.
export function migrateCharEdits(pairs, cols) {
  if (!cols) return new Map();
  return new Map(pairs.map(([index, char]) => [cellKey(index % cols, Math.floor(index / cols)), Object.freeze({ char })]));
}

// Insert/delete within one row. delta +1: entries at col >= fromCol move right, and any pushed to
// col >= cols drop off. delta -1: the entry at fromCol - 1 is removed and entries at col >= fromCol
// move left. Other rows, and entries kept beyond the grid (col >= cols), are untouched; returns the
// same Map when the row has nothing to move.
export function shiftRow(map, row, fromCol, delta, cols) {
  if (delta < 0 && fromCol < 1) return map;
  const moving = [], removed = [];
  for (const [key, entry] of map) {
    const at = parseKey(key);
    if (at.row !== row || at.col >= cols) continue;
    if (at.col >= fromCol) moving.push([at.col, entry]);
    else if (delta < 0 && at.col >= fromCol + delta) removed.push(key); // the cells a left shift covers
  }
  if (!moving.length && !removed.length) return map;

  const result = new Map(map);
  removed.forEach(key => result.delete(key));
  moving.forEach(([col]) => result.delete(cellKey(col, row)));
  for (const [col, entry] of moving) {
    const to = col + delta;
    if (to >= 0 && to < cols) result.set(cellKey(to, row), entry);
  }
  return result;
}

// A bake burns the colour transforms (params) into an entry's colours, so it looks as it did once
// the sliders are back at neutral; its character is kept. The palette isn't burnt in: it still
// applies at display.
export function bakeEntry(entry, params) {
  const baked = { ...entry };
  if (entry.fg) baked.fg = getEffectiveColor(entry.fg, params);
  if (entry.bg) baked.bg = getEffectiveColor(entry.bg, params);
  return Object.freeze(baked);
}

export function bakeEditCells(map, params) {
  if (!map.size) return map;
  return new Map([...map].map(([key, entry]) => [key, bakeEntry(entry, params)]));
}

// Rect = { c0, r0, c1, r1 }: inclusive, normalized. Block = { w, h, entries: (Entry | null)[] }, row-major.
export function normalizeRect(a, b) {
  return { c0: Math.min(a.col, b.col), r0: Math.min(a.row, b.row), c1: Math.max(a.col, b.col), r1: Math.max(a.row, b.row) };
}

export function rectCells({ c0, r0, c1, r1 }) {
  const cells = [];
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) cells.push({ col, row });
  return cells;
}

// A block's entries at (col, row): null entries release that cell; anything off the grid is dropped.
// Returns the same Map when nothing changed.
export function pasteBlock(map, block, col, row, cols, rows) {
  let result = null;
  block.entries.forEach((entry, i) => {
    const c = col + (i % block.w), r = row + Math.floor(i / block.w);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const key = cellKey(c, r);
    if (entry ? map.get(key) === entry || sameEntry(map.get(key), entry) : !(result ?? map).has(key)) return;
    result ??= new Map(map);
    if (entry) result.set(key, entry);
    else result.delete(key);
  });
  return result ?? map;
}

const sameEntry = (a, b) => !!a && !!b && ATTRS.every(attr => a[attr] === b[attr]);

// Every cell of a rect merged with attrsFor(col, row, entry), on one Map copy (merge up).
// Returns the same Map when nothing changed.
export function updateRect(map, rect, attrsFor) {
  let result = null;
  for (const { col, row } of rectCells(rect)) {
    const key = cellKey(col, row);
    const old = map.get(key);
    const next = mergeEntry(old, attrsFor(col, row, old));
    if (next === (old ?? null)) continue;
    result ??= new Map(map);
    if (next) result.set(key, next);
    else result.delete(key);
  }
  return result ?? map;
}

// What an erased base cell shows: a space in the classic terminal grey on black.
export const BLANK = Object.freeze({ char: ' ', fg: '#aaaaaa', bg: '#000000' });

// Where a pointer is relative to a selection: on its border (a band ½ column / ¼ row outside the
// edge and ¼ column / ⅛ row inside it; cells are twice as tall as wide), inside, or outside.
// pos is fractional, in cells.
export function selectionHit({ c0, r0, c1, r1 }, { col, row }) {
  const within = (dc, dr) => col >= c0 - dc && col <= c1 + 1 + dc && row >= r0 - dr && row <= r1 + 1 + dr;
  if (!within(0.5, 0.25)) return 'outside';
  return within(-0.25, -0.125) ? 'inside' : 'border';
}

// An offset for a rect, cut short so the rect stays on a cols x rows grid (rows in cells).
export function clampOffset({ c0, r0, c1, r1 }, dc, dr, cols, rows) {
  return { dc: Math.max(0 - c0, Math.min(cols - 1 - c1, dc)), dr: Math.max(0 - r0, Math.min(rows - 1 - r1, dr)) };
}
