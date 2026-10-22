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
