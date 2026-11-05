/**
 * Animation frames, as data. A frame records only what changed on it: changes maps a cell ('col,row') to its
 * whole state on that frame, its edit cell entry and both halves' paint (packed as changes.js packs them,
 * 0 is none). A change owns the whole cell, so a later fix on an earlier frame stops there, all of it. An
 * empty state is an explicit erase, which carries forward like any change. Nothing here touches a canvas.
 *
 * Frame = { id, kind, hold, changes, tweens, parts, ledger, drawn, resolved, built }: hold is in seconds (0 is one tick). The last
 * four belong to the store: the frame's undo while it's not showing, the cells drawn over on it (for the ghost: by
 * stroke while undo can take one back, then KEPT), and what's cached of it. tweens maps a shape key to the easing of
 * the tween that shape starts on this frame, or is null (tweens.js). parts maps a shape key to the Set of its parts
 * (parts.js) the frame sets, when that's not all of them, or is null; a frame's changes still hold the whole shape, as
 * the frame shows it.
 */
import { markRaw } from 'vue';
import { deserializeEditCells, parseKey, sameEntry } from './editCells.js';
import { isShape, isShapeKey, sameShape, shapeFromStranger, isGoodShapeKey, MOST_SHAPES } from './shapes.js';
import { EASINGS, lifeAt, shapeAt } from './tweens.js';
import { ALL_PARTS, PARTS, samePart, withParts } from './parts.js';
import { MAX_ANIMATION_CELLS, MAX_CELLS, MAX_COLS, MAX_LINES, charRowsOf, maxFramesFor } from '../lib/Cells.js';

export const FRAME_KINDS = ['blank', 'duplicate', 'wipe'];

export const cellState = (cell, top, bottom) => Object.freeze({ cell: cell ?? null, top, bottom });
export const EMPTY_STATE = cellState(null, 0, 0);
export const isEmptyState = (state) => !state.cell && !state.top && !state.bottom;

let nextId = 1;
export const newFrame = (kind, changes = new Map()) => markRaw({ id: nextId++, kind, hold: 0, changes, tweens: null, parts: null, ledger: null, drawn: null, resolved: null, built: null });

// Cells drawn over on a frame, whether or not that changed them: drawn maps a stroke's id to its cells, and KEPT to
// those no undo can take back any more. A cell drawn in exactly what it inherited isn't owned, but it isn't a ghost.
export const KEPT = 'kept';
export function drawnKeys(frame) {
  const keys = new Set();
  for (const cells of frame.drawn?.values() ?? []) for (const key of cells) keys.add(key);
  return keys;
}
// A stroke's cells, or with no id every stroke's, past undo now: kept.
export function keepDrawn(frame, id) {
  if (!frame.drawn?.size || (id !== undefined && !frame.drawn.has(id))) return;
  const cells = id === undefined ? drawnKeys(frame) : frame.drawn.get(id);
  if (id === undefined) frame.drawn = new Map();
  else frame.drawn.delete(id);
  const kept = frame.drawn.get(KEPT) ?? new Set();
  for (const key of cells) kept.add(key);
  frame.drawn.set(KEPT, kept);
}

// How long a frame stays, in ms: its hold, or one tick at the movie's fps.
export const frameDuration = ({ hold }, fps) => (hold > 0 ? hold * 1000 : 1000 / fps);

// What a frame shows, given what the frame before it shows. Frame 0 goes over an empty map, so it acts as a wipe.
export function resolveOver(previous, { kind, changes }) {
  const resolved = kind === 'blank' ? new Map(previous) : new Map();
  for (const [key, state] of changes) {
    if (!isEmptyState(state)) resolved.set(key, state);
    else resolved.delete(key);
  }
  return resolved;
}

const sameCell = (a, b) => a === b || (!a && !b) || (isShape(a) || isShape(b) ? sameShape(a, b) : sameEntry(a, b));
const sameState = (a, b) => a === b || (a.top === b.top && a.bottom === b.bottom && sameCell(a.cell, b.cell));

// What a frame changed: every cell live shows differently from previous, with its whole live state.
export function frameDiff(previous, live) {
  const diff = new Map();
  for (const [key, state] of live) {
    if (!sameState(previous.get(key) ?? EMPTY_STATE, state)) diff.set(key, state);
  }
  for (const key of previous.keys()) if (!live.has(key)) diff.set(key, EMPTY_STATE);
  return diff;
}

export function sameChanges(a, b) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, state] of a) {
    const other = b.get(key);
    if (!other || !sameState(state, other)) return false;
  }
  return true;
}

// The frame after a deleted one, so the rest of the movie looks the same: a Blank takes in what it inherited
// from the deleted frame, and the deleted frame's kind when that was what cut it off from the frames before; the
// tweens of the shapes it takes in, which start there now; and of a shape both set parts of, the parts the deleted
// frame set that it didn't.
export function foldDeleted(deleted, next) {
  if (next.kind !== 'blank') return { kind: next.kind, changes: next.changes, tweens: next.tweens, parts: next.parts };
  const tweens = new Map([...(deleted.tweens ?? [])].filter(([key]) => !next.changes.has(key)));
  for (const [key, easing] of next.tweens ?? []) tweens.set(key, easing);
  const changes = new Map([...deleted.changes, ...next.changes]);
  const parts = new Map([...(deleted.parts ?? [])].filter(([key]) => !next.changes.has(key)));
  for (const [key, { cell }] of next.changes) {
    const own = next.parts?.get(key), was = deleted.changes.get(key)?.cell;
    if (!own || !cell) continue; // all of it, or an erase
    if (!was) {
      parts.set(key, own);
      continue;
    }
    const theirs = [...(deleted.parts?.get(key) ?? ALL_PARTS)].filter((name) => !own.has(name)), both = new Set([...own, ...theirs]);
    changes.set(key, cellState(withParts(cell, was, theirs), 0, 0));
    if (both.size < PARTS.length) parts.set(key, both);
  }
  return { kind: deleted.kind, changes, tweens: tweens.size ? tweens : null, parts: parts.size ? parts : null };
}

// A resolved frame's paint as an image cols x rows, a pixel a grid pixel (PaintLayer.loadGrid takes it).
export function paintImage(resolved, cols, rows) {
  const image = new ImageData(cols, rows), { data } = image;
  const put = (x, y, rgba) => {
    if (!rgba || x >= cols || y >= rows) return;
    const i = (y * cols + x) * 4;
    data[i] = rgba >>> 24;
    data[i + 1] = (rgba >>> 16) & 0xff;
    data[i + 2] = (rgba >>> 8) & 0xff;
    data[i + 3] = rgba & 0xff;
  };
  for (const [key, { top, bottom }] of resolved) {
    if (!top && !bottom) continue;
    const { col, row } = parseKey(key);
    put(col, 2 * row, top);
    put(col, 2 * row + 1, bottom);
  }
  return image;
}

// Frames as a file holds them: an entry is [key, cell, top, bottom]. drawn: the cells drawn over that changes doesn't
// hold, if any (what changes holds was drawn, or the frame wouldn't own it). shapes: the frame's shape changes,
// [key, shape | null], in a field of their own so that a copy of Phosphor from before shapes still reads changes.
// tweens: [key, easing] for the tweens starting on the frame, of shapes it has; a copy from before tweens shows the key
// frames only. A shape is saved as the frame shows it, so a copy from before parts shows each key frame right; parts:
// [key, [part, …]] for the shapes the frame sets only some of, on every frame with shapes (a frame with shapes and no
// parts was saved before them).
export const serializeFrames = (frames) => frames.map((frame, i) => {
  const { kind, hold, changes } = frame, drawn = [...drawnKeys(frame)].filter((key) => !changes.has(key));
  const all = [...changes], shapes = all.filter(([key]) => isShapeKey(key));
  const tweens = [...(frame.tweens ?? [])].filter(([key]) => changes.get(key)?.cell);
  const parts = [...(frame.parts ?? [])].filter(([key, set]) => changes.get(key)?.cell && set.size < PARTS.length)
    .map(([key, set]) => [key, PARTS.filter((name) => set.has(name))]);
  return {
    kind,
    hold,
    changes: all.filter(([key]) => !isShapeKey(key)).map(([key, { cell, top, bottom }]) => [key, cell, top, bottom]),
    ...(drawn.length && { drawn }),
    ...(shapes.length && { shapes: shapes.map(([key, { cell }]) => [key, cell && shapeAt(frames, key, i)]), parts }),
    ...(tweens.length && { tweens }),
  };
});

const goodPaint = (rgba) => Number.isInteger(rgba) && rgba >= 0 && rgba <= 0xffffffff;
const goodKey = (key) => {
  if (typeof key !== 'string' || !/^\d+,\d+$/.test(key)) return false;
  const { col, row } = parseKey(key);
  return col < MAX_COLS && row < MAX_LINES;
};
function readChanges(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_CELLS) return null;
  const changes = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry)) return null;
    const [key, cell, top, bottom] = entry;
    if (!goodKey(key) || !goodPaint(top) || !goodPaint(bottom)) return null;
    const clean = deserializeEditCells([[key, cell]]).get(key) ?? null;
    if (cell != null && !clean) return null; // a cell with nothing a cell can hold
    if (clean && Object.keys(clean).length !== Object.keys(cell).length) return null;
    changes.set(key, cellState(clean, top, bottom));
  }
  return changes;
}

// A frame's shape changes into its changes, or false when any is bad.
function readShapes(entries, changes) {
  if (entries === undefined) return true;
  if (!Array.isArray(entries) || entries.length > 2 * MOST_SHAPES) return false;
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || !isGoodShapeKey(entry[0])) return false;
    const shape = entry[1] === null ? null : shapeFromStranger(entry[1]);
    if (entry[1] !== null && !shape) return false;
    changes.set(entry[0], shape ? cellState(shape, 0, 0) : EMPTY_STATE);
  }
  return true;
}

// A frame's tweens, of the shapes it has, or null: one that can't be read (another copy's easing, say) is left out.
function readTweens(entries, changes) {
  if (!Array.isArray(entries)) return null;
  const good = ([key, easing]) => isGoodShapeKey(key) && !!changes.get(key)?.cell && EASINGS.includes(easing);
  const tweens = new Map(entries.slice(0, MOST_SHAPES).filter((entry) => Array.isArray(entry) && good(entry)));
  return tweens.size ? tweens : null;
}

// A frame's parts, of the shapes it has, or null: an entry that can't be read is left out.
function readParts(entries, changes) {
  if (!Array.isArray(entries)) return null;
  const parts = new Map();
  for (const entry of entries.slice(0, MOST_SHAPES)) {
    if (!Array.isArray(entry) || entry.length !== 2 || !isGoodShapeKey(entry[0]) || !changes.get(entry[0])?.cell) continue;
    const [key, names] = entry;
    if (!Array.isArray(names) || names.length >= PARTS.length || !names.every((name) => PARTS.includes(name))) continue;
    parts.set(key, new Set(names));
  }
  return parts.size ? parts : null;
}

// The parts frames saved before parts set (frames at indices, of frames): on a Blank key frame that isn't its shape's
// first, a part is set unless it's the same as on the key frames either side (or the one before, on the last), so
// nothing can fade differently from how the file had it.
export function inferParts(frames, indices) {
  for (const i of indices) {
    const frame = frames[i];
    if (frame.kind !== 'blank') continue;
    for (const [key, { cell }] of frame.changes) {
      if (!isShapeKey(key) || !cell) continue;
      const life = lifeAt(frames, key, i), j = life.indexOf(i);
      if (j <= 0) continue;
      const before = frames[life[j - 1]].changes.get(key).cell, after = frames[life[j + 1]]?.changes.get(key).cell;
      const set = PARTS.filter((name) => !samePart(cell, before, name) || (after && !samePart(cell, after, name)));
      if (set.length < PARTS.length) (frame.parts ??= new Map()).set(key, new Set(set));
    }
  }
}

// { frames, frame, fps } from a file, or null when anything's wrong with them, or the grid (cols, rows) is too
// large to animate: the file's still holds what it needs to open as one. Files are untrusted.
export function deserializeFrames(json, cols, rows) {
  const { frames, frame, fps } = json ?? {};
  if (!Array.isArray(frames) || !frames.length) return null;
  if (!Number.isInteger(frame) || frame < 0 || frame >= frames.length) return null;
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) return null;
  if (!(cols * charRowsOf(rows) <= MAX_ANIMATION_CELLS) || frames.length > maxFramesFor(cols * charRowsOf(rows))) return null;
  const read = [], old = [];
  let shown = new Set(); // the shapes a frame shows: Blank frames carry them on, so each frame is counted whole
  for (const entry of frames) {
    const { kind, hold, changes, drawn, shapes, tweens, parts } = entry ?? {};
    if (!FRAME_KINDS.includes(kind) || !Number.isFinite(hold) || hold < 0 || hold > 60) return null;
    const map = readChanges(changes);
    if (!map || !readShapes(shapes, map)) return null;
    if (kind !== 'blank') shown = new Set();
    for (const [key, state] of map) if (isShapeKey(key)) shown[isEmptyState(state) ? 'delete' : 'add'](key);
    if (shown.size > MOST_SHAPES) return null;
    if (drawn !== undefined && !(Array.isArray(drawn) && drawn.length <= MAX_CELLS && drawn.every(goodKey))) return null;
    const next = newFrame(kind, map);
    next.hold = hold;
    next.tweens = readTweens(tweens, map);
    next.parts = readParts(parts, map);
    if (parts === undefined && shapes?.length) old.push(read.length);
    if (drawn?.length) next.drawn = new Map([[KEPT, new Set(drawn)]]);
    read.push(next);
  }
  inferParts(read, old);
  return { frames: read, frame, fps };
}
