/**
 * The authored cell layer: a sparse Map<'col,row', Entry> over the generated cells. Entries are
 * frozen and the Map is replaced on every change (copy-on-write), so undo can keep both sides and
 * callers can compare identity to see whether anything changed.
 *
 * Entry = { char?, fg?, bg? }: fg/bg are underlying colours ('#rrggbb'); a missing attribute shows
 * what's underneath. Keys are grid positions, so entries outside a shrunken grid are kept.
 */
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

export const serializeCellEdits = (map) => [...map];

export const deserializeCellEdits = (pairs) => new Map((pairs || [])
  .filter(([, entry]) => entry && ATTRS.some(attr => attr in entry))
  .map(([key, entry]) => [key, Object.freeze({ ...entry })]));

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
    else if (delta < 0 && at.col === fromCol - 1) removed.push(key);
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

// Rect = { c0, r0, c1, r1 }: inclusive, normalized. Block = { w, h, entries: (Entry | null)[] }, row-major.
export function normalizeRect(a, b) {
  return { c0: Math.min(a.col, b.col), r0: Math.min(a.row, b.row), c1: Math.max(a.col, b.col), r1: Math.max(a.row, b.row) };
}

export function rectCells({ c0, r0, c1, r1 }) {
  const cells = [];
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) cells.push({ col, row });
  return cells;
}

// complete(col, row, entry) fills in a whole entry for every cell (copying what's visible, not
// just what's authored); without it, cells with no entry copy as null.
export function copyBlock(map, rect, complete) {
  const entries = rectCells(rect).map(({ col, row }) => {
    const entry = map.get(cellKey(col, row)) ?? null;
    return complete ? Object.freeze({ ...complete(col, row, entry) }) : entry;
  });
  return { w: rect.c1 - rect.c0 + 1, h: rect.r1 - rect.r0 + 1, entries };
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

// Lift a rect's entries (complete: as in copyBlock), release it, and paste them dc/dr away
// (overlap-safe). Dropped where it started, nothing changes.
export function moveRect(map, rect, dc, dr, cols, rows, complete) {
  if (!dc && !dr) return map;
  const block = copyBlock(map, rect, complete);
  return pasteBlock(withoutCells(map, rectCells(rect)), block, rect.c0 + dc, rect.r0 + dr, cols, rows);
}

// Every cell of a rect merged with attrsFor(col, row, entry), on one Map copy (fill, bake).
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
