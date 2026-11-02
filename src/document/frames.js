/**
 * Animation frames, as data. A frame records only what changed on it: changes maps a cell ('col,row') to its
 * whole state on that frame, its edit cell entry and both halves' paint (packed as changes.js packs them,
 * 0 is none). A change owns the whole cell, so a later fix on an earlier frame stops there, all of it. An
 * empty state is an explicit erase, which carries forward like any change. Nothing here touches a canvas.
 *
 * Frame = { id, kind, hold, changes, ledger, resolved, built }: hold is in seconds (0 is one tick). The last
 * three belong to the store: the frame's undo while it's not showing, and what's cached of it.
 */
import { markRaw } from 'vue';
import { deserializeEditCells, parseKey, sameEntry } from './editCells.js';
import { MAX_ANIMATION_CELLS, MAX_CELLS, MAX_COLS, MAX_FRAMES, MAX_LINES, charRowsOf } from '../lib/Cells.js';

export const FRAME_KINDS = ['blank', 'duplicate', 'wipe'];

export const cellState = (cell, top, bottom) => Object.freeze({ cell: cell ?? null, top, bottom });
export const EMPTY_STATE = cellState(null, 0, 0);
export const isEmptyState = (state) => !state.cell && !state.top && !state.bottom;

let nextId = 1;
export const newFrame = (kind, changes = new Map()) => markRaw({ id: nextId++, kind, hold: 0, changes, ledger: null, resolved: null, built: null });

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

const sameCell = (a, b) => a === b || (!a && !b) || sameEntry(a, b);
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
// from the deleted frame, and the deleted frame's kind when that was what cut it off from the frames before.
export function foldDeleted(deleted, next) {
  if (next.kind !== 'blank') return { kind: next.kind, changes: next.changes };
  return { kind: deleted.kind, changes: new Map([...deleted.changes, ...next.changes]) };
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

// Frames as a file holds them: an entry is [key, cell, top, bottom].
export const serializeFrames = (frames) => frames.map(({ kind, hold, changes }) => ({
  kind,
  hold,
  changes: Array.from(changes, ([key, { cell, top, bottom }]) => [key, cell, top, bottom]),
}));

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

// { frames, frame, fps } from a file, or null when anything's wrong with them, or the grid (cols, rows) is too
// large to animate: the file's still holds what it needs to open as one. Files are untrusted.
export function deserializeFrames(json, cols, rows) {
  const { frames, frame, fps } = json ?? {};
  if (!Array.isArray(frames) || !frames.length || frames.length > MAX_FRAMES) return null;
  if (!Number.isInteger(frame) || frame < 0 || frame >= frames.length) return null;
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) return null;
  if (!(cols * charRowsOf(rows) <= MAX_ANIMATION_CELLS)) return null;
  const read = [];
  for (const entry of frames) {
    const { kind, hold, changes } = entry ?? {};
    if (!FRAME_KINDS.includes(kind) || !Number.isFinite(hold) || hold < 0 || hold > 60) return null;
    const map = readChanges(changes);
    if (!map) return null;
    const next = newFrame(kind, map);
    next.hold = hold;
    read.push(next);
  }
  return { frames: read, frame, fps };
}
