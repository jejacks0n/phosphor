/**
 * Animation frames, as data. A frame records only what changed on it: changes maps a cell ('col,row') to its
 * whole state on that frame, its edit cell entry and both halves' paint (packed as changes.js packs them,
 * 0 is none). A change owns the whole cell, so a later fix on an earlier frame stops there, all of it. An
 * empty state is an explicit erase, which carries forward like any change. A cell's change that stays (stays: true,
 * drawn with New cells set to Stay) shows on its frame only: the frame after gets what was there before it. Nothing
 * here touches a canvas.
 *
 * Frame = { id, kind, hold, changes, tweens, motions, parts, ledger, drawn, modes, resolved, passes, built }: hold is in
 * seconds (0 is one tick). The rest belong to the store: the frame's undo while it's not showing, the cells drawn over
 * on it (for the ghost: by stroke while undo can take one back, then KEPT), the mode each edit drew in (modes), and
 * what's cached of it (passes: what it hands the frame after). tweens maps a shape key to a Map of the parts it sets
 * there to the easing of each one's tween from there, or is null (tweens.js); motions, a shape key to how its
 * Transform's tween from there moves, or is null. parts maps a shape key to the Set of its parts
 * (parts.js) the frame sets, when that's not all of them, or is null; a frame's changes still hold the whole shape, as
 * the frame shows it.
 */
import { markRaw } from 'vue';
import { deserializeEditCells, parseKey, sameEntry } from './editCells.js';
import { isShape, isShapeKey, sameShape, shapeFromStranger, isGoodShapeKey, MOST_SHAPES } from './shapes.js';
import { keyLayer, layerKey } from './layerInfo.js';
import { EASINGS, MOTIONS, lifeAt, setPartsAt, shapeAt, strayEasings } from './tweens.js';
import { PARTS, partsOf, samePart, withParts } from './parts.js';
import { MAX_ANIMATION_CELLS, MAX_CELLS, MAX_COLS, MAX_LINES, charRowsOf, maxFramesFor } from '../lib/Cells.js';

export const FRAME_KINDS = ['blank', 'duplicate', 'wipe'];

export const cellState = (cell, top, bottom, stays = false) => Object.freeze({ cell: cell ?? null, top, bottom, ...(stays && { stays: true }) });
export const EMPTY_STATE = cellState(null, 0, 0);
export const isEmptyState = (state) => !state.cell && !state.top && !state.bottom;

let nextId = 1;
export const newFrame = (kind, changes = new Map()) => markRaw({ id: nextId++, kind, hold: 0, changes, tweens: null, motions: null, parts: null, ledger: null, drawn: null, modes: null, resolved: null, passes: null, built: null });

// The mode each edit on a frame drew its cells in: modes maps a stroke's id to { stays, keys }, in the order drawn,
// after BASE, the cells that stay from before any of them (a file's, a Duplicate's, and strokes past undo). A cell
// stays as the last edit to change it drew it.
export const BASE = 'base';
export const withModes = (frame) => (frame.modes ??= new Map([[BASE, { stays: true, keys: new Set() }]]));
export function staysAt(frame, key) {
  const modes = [...(frame.modes?.values() ?? [])];
  for (let i = modes.length - 1; i >= 0; i--) if (modes[i].keys.has(key)) return modes[i].stays;
  return false;
}
// A stroke's mode, past undo now: into BASE.
export function keepMode(frame, id) {
  const mode = frame.modes?.get(id);
  if (!mode) return;
  frame.modes.delete(id);
  const { keys } = frame.modes.get(BASE);
  for (const key of mode.keys) keys[mode.stays ? 'add' : 'delete'](key);
}

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

// What a frame shows, given what the frame before it passes on (passedOn). Frame 0 goes over an empty map, so it acts as
// a wipe.
export function resolveOver(previous, { kind, changes }) {
  const resolved = kind !== 'blank' ? new Map() : new Map(previous);
  for (const [key, state] of changes) {
    if (!isEmptyState(state)) resolved.set(key, state);
    else resolved.delete(key);
  }
  return resolved;
}

// What a frame hands the one after: what it shows (shown), but where a cell of its stays, what was there before it.
export function passedOn(previous, { kind, changes }, shown) {
  let passes = null;
  for (const [key, state] of changes) {
    if (!state.stays) continue;
    passes ??= new Map(shown);
    const under = kind === 'blank' ? previous.get(key) : undefined;
    if (under) passes.set(key, under);
    else passes.delete(key);
  }
  return passes ?? shown;
}

const sameCell = (a, b) => a === b || (!a && !b) || (isShape(a) || isShape(b) ? sameShape(a, b) : sameEntry(a, b));
export const sameState = (a, b) => a === b || (a.top === b.top && a.bottom === b.bottom && !a.stays === !b.stays && sameCell(a.cell, b.cell));

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
// frame set that it didn't, with their easings (and the Transform's motion, if that's one of them).
export function foldDeleted(deleted, next) {
  if (next.kind !== 'blank') return { kind: next.kind, changes: next.changes, tweens: next.tweens, motions: next.motions, parts: next.parts };
  const takeIn = (name) => {
    const map = new Map([...(deleted[name] ?? [])].filter(([key]) => !next.changes.has(key)));
    for (const [key, value] of next[name] ?? []) map.set(key, value);
    return map.size ? map : null;
  };
  const tweens = takeIn('tweens') ?? new Map(), motions = takeIn('motions') ?? new Map();
  // The next frame never showed the deleted one's staying cells: what was under them, which comes to it as before.
  const changes = new Map([...[...deleted.changes].filter(([, state]) => !state.stays), ...next.changes]);
  const parts = new Map([...(deleted.parts ?? [])].filter(([key]) => !next.changes.has(key)));
  for (const [key, { cell }] of next.changes) {
    const own = next.parts?.get(key), was = deleted.changes.get(key)?.cell;
    if (!own || !cell) continue; // all of it, or an erase
    if (!was) {
      parts.set(key, own);
      continue;
    }
    const theirs = [...(deleted.parts?.get(key) ?? partsOf(cell))].filter((name) => !own.has(name)), both = new Set([...own, ...theirs]);
    changes.set(key, cellState(withParts(cell, was, theirs), 0, 0));
    if (both.size < partsOf(cell).length) parts.set(key, both);
    const eases = new Map(PARTS.flatMap((name) => {
      const easing = (own.has(name) ? next : theirs.includes(name) ? deleted : null)?.tweens?.get(key)?.get(name);
      return easing ? [[name, easing]] : [];
    }));
    if (eases.size) tweens.set(key, eases);
    else tweens.delete(key);
    const motion = (own.has('transform') ? next : deleted).motions?.get(key);
    if (motion && eases.has('transform')) motions.set(key, motion);
    else motions.delete(key);
  }
  return { kind: deleted.kind, changes, tweens: tweens.size ? tweens : null, motions: motions.size ? motions : null, parts: parts.size ? parts : null };
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
// eases: [key, [[part, easing], …]] for the parts' tweens starting on the frame, of shapes it has; a copy from before
// tweens shows the key frames only, and one from before each part had its own (which wrote tweens, [key, easing] for
// the whole shape) reads none. motions: [key, motion] for the Transform tweens of them that don't move smoothly
// (MOTIONS). A shape is saved as the frame shows it, so a copy from before parts shows each key frame right; parts:
// [key, [part, …]] for the shapes the frame sets only some of, on every frame with shapes (a frame with shapes and no
// parts was saved before them).
export const serializeFrames = (frames) => frames.map((frame, i) => {
  const { kind, hold, changes } = frame, drawn = [...drawnKeys(frame)].filter((key) => !changes.has(key));
  const all = [...changes], shapes = all.filter(([key]) => isShapeKey(key));
  const eases = [...(frame.tweens ?? [])].filter(([key]) => changes.get(key)?.cell)
    .map(([key, map]) => [key, PARTS.filter((name) => map.has(name)).map((name) => [name, map.get(name)])]);
  const motions = [...(frame.motions ?? [])].filter(([key, motion]) => frame.tweens?.get(key)?.has('transform') && changes.get(key)?.cell && motion !== 'smooth');
  const parts = [...(frame.parts ?? [])].filter(([key, set]) => changes.get(key)?.cell && set.size < partsOf(changes.get(key).cell).length)
    .map(([key, set]) => [key, PARTS.filter((name) => set.has(name))]);
  const stays = all.filter(([, state]) => state.stays).map(([key]) => key);
  return {
    kind,
    hold,
    changes: all.filter(([key]) => !isShapeKey(key)).map(([key, { cell, top, bottom }]) => [key, cell, top, bottom]),
    ...(drawn.length && { drawn }),
    ...(stays.length && { stays }),
    ...(shapes.length && { shapes: shapes.map(([key, { cell }]) => [key, cell && shapeAt(frames, key, i)]), parts }),
    ...(eases.length && { eases }),
    ...(motions.length && { motions }),
  };
});

const goodPaint = (rgba) => Number.isInteger(rgba) && rgba >= 0 && rgba <= 0xffffffff;
// What a project file that isn't one throws (projectIO.js): a frame naming a layer its stack doesn't have is one.
export const invalidProject = () => Object.assign(new Error('Not a valid Phosphor project file'), { code: 'INVALID_PROJECT' });

// A cell's key on the grid as a frame has it, named by its layer as layerKey writes it. layers: a stack file's ({ cells,
// vector }, Sets of ids), and a key on a layer that isn't one of its cells layers throws; without them only the edit
// layer's bare keys are frames' keys, as in the files from before the stack.
const goodKey = (key, layers = null) => {
  if (typeof key !== 'string') return false;
  const { id, key: at } = keyLayer(key);
  if (!/^\d+,\d+$/.test(at) || layerKey(id, at) !== key) return false;
  const { col, row } = parseKey(at);
  if (!(col < MAX_COLS && row < MAX_LINES)) return false;
  if (!layers) return id === 'edit';
  if (!layers.cells.has(id)) throw invalidProject();
  return true;
};
function readChanges(entries, layers) {
  if (!Array.isArray(entries) || entries.length > MAX_CELLS) return null;
  const changes = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry)) return null;
    const [key, cell, top, bottom] = entry;
    if (!goodKey(key, layers) || !goodPaint(top) || !goodPaint(bottom)) return null;
    const at = keyLayer(key).key, clean = deserializeEditCells([[at, cell]]).get(at) ?? null;
    if (cell != null && !clean) return null; // a cell with nothing a cell can hold
    if (clean && Object.keys(clean).length !== Object.keys(cell).length) return null;
    changes.set(key, cellState(clean, top, bottom));
  }
  return changes;
}

// A frame's shape changes into its changes, or false when any is bad. With a stack's layers (goodKey), a shape on a
// layer that isn't one of its vector layers throws; without them, one that names a layer is bad.
function readShapes(entries, changes, layers) {
  if (entries === undefined) return true;
  if (!Array.isArray(entries) || entries.length > 2 * MOST_SHAPES) return false;
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || !isGoodShapeKey(entry[0])) return false;
    const shape = entry[1] === null ? null : shapeFromStranger(entry[1]);
    if (entry[1] !== null && !shape) return false;
    if (shape && !layers && shape.layer) return false;
    if (shape && layers && !layers.vector.has(shape.layer ?? 'vector')) throw invalidProject();
    changes.set(entry[0], shape ? cellState(shape, 0, 0) : EMPTY_STATE);
  }
  return true;
}

// A frame's tweens from a file before each part had its own, of the shapes it has, key to easing, or null: one that
// can't be read (another copy's easing, say) is left out.
function readTweens(entries, changes) {
  if (!Array.isArray(entries)) return null;
  const good = ([key, easing]) => isGoodShapeKey(key) && !!changes.get(key)?.cell && EASINGS.includes(easing);
  const tweens = new Map(entries.slice(0, MOST_SHAPES).filter((entry) => Array.isArray(entry) && good(entry)));
  return tweens.size ? tweens : null;
}

// A frame's easings, of the shapes it has, key to a Map of part to easing, or null: what can't be read (a part its
// shape doesn't have, or an easing of another copy's, say) is left out.
function readEases(entries, changes) {
  if (!Array.isArray(entries)) return null;
  const tweens = new Map();
  for (const entry of entries.slice(0, MOST_SHAPES)) {
    if (!Array.isArray(entry) || entry.length !== 2 || !isGoodShapeKey(entry[0]) || !changes.get(entry[0])?.cell || !Array.isArray(entry[1])) continue;
    const has = partsOf(changes.get(entry[0]).cell);
    const eases = new Map(entry[1].slice(0, PARTS.length).filter((pair) => Array.isArray(pair) && has.includes(pair[0]) && EASINGS.includes(pair[1])));
    if (eases.size) tweens.set(entry[0], eases);
  }
  return tweens.size ? tweens : null;
}

// A frame's motions, of its tweens (a span's, from before each part had its own, or an eased Transform's), or null:
// smooth, or an entry that can't be read, is left out. A file from when the motion was the whole movie's (movie) has it
// on every tween.
function readMotions(entries, tweens, movie) {
  const eased = (key) => typeof tweens?.get(key) === 'string' || !!tweens?.get(key)?.has('transform');
  const good = ([key, motion]) => eased(key) && MOTIONS.includes(motion) && motion !== 'smooth';
  const list = Array.isArray(entries) ? entries.slice(0, MOST_SHAPES).filter((entry) => Array.isArray(entry) && good(entry))
    : MOTIONS.includes(movie) && movie !== 'smooth' ? [...(tweens?.keys() ?? [])].filter(eased).map((key) => [key, movie]) : [];
  return list.length ? new Map(list) : null;
}

// A frame's parts, of the shapes it has, or null: an entry that can't be read (one naming a part its shape doesn't
// have, partsOf) is left out.
function readParts(entries, changes) {
  if (!Array.isArray(entries)) return null;
  const parts = new Map();
  for (const entry of entries.slice(0, MOST_SHAPES)) {
    if (!Array.isArray(entry) || entry.length !== 2 || !isGoodShapeKey(entry[0]) || !changes.get(entry[0])?.cell) continue;
    const [key, names] = entry, has = partsOf(changes.get(key).cell);
    if (!Array.isArray(names) || names.length >= has.length || !names.every((name) => has.includes(name))) continue;
    parts.set(key, new Set(names));
  }
  return parts.size ? parts : null;
}

// A frame's tweens (as frame.tweens) with key's easings set to eases, part to easing (none: the key goes), or null.
export function withEases(tweens, key, eases) {
  const next = new Map(tweens ?? []);
  if (eases.size) next.set(key, eases);
  else next.delete(key);
  return next.size ? next : null;
}

// Every easing no tween uses (strayEasings) goes, and every motion whose Transform isn't eased, on every frame or those
// at the indices in only: in new Maps, so what history holds of the frames stays as it was.
export function dropStrays(frames, only = null) {
  const keys = new Set(frames.flatMap((frame) => [...(frame.tweens?.keys() ?? [])]));
  for (const key of keys) {
    for (const { at, part } of strayEasings(frames, key)) {
      if (only && !only.has(at)) continue;
      const frame = frames[at], eases = new Map(frame.tweens.get(key));
      eases.delete(part);
      frame.tweens = withEases(frame.tweens, key, eases);
    }
  }
  for (const frame of only ? [...only].map((at) => frames[at]) : frames) {
    if (![...(frame.motions ?? [])].some(([key]) => !frame.tweens?.get(key)?.has('transform'))) continue;
    const motions = new Map([...frame.motions].filter(([key]) => frame.tweens?.get(key)?.has('transform')));
    frame.motions = motions.size ? motions : null;
  }
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
      const set = partsOf(cell).filter((name) => !samePart(cell, before, name) || (after && !samePart(cell, after, name)));
      if (!set.length) set.push('transform'); // the same as both: it sets nothing new, but stays a key frame, its tweens kept
      if (set.length < partsOf(cell).length) (frame.parts ??= new Map()).set(key, new Set(set));
    }
  }
}

// { frames, frame, fps } from a file (every cell staying when cellsCarry says false, as the whole movie's did before
// each cell had its own; motion, the whole movie's, from files before each tween had its own), or null when anything's wrong with them, or the grid (cols, rows) is too
// large to animate: the file's still holds what it needs to open as one. Files are untrusted. layers: a stack file's,
// as goodKey has them; a key or shape on a layer it doesn't have makes the file no project (it throws).
export function deserializeFrames(json, cols, rows, layers = null) {
  const { frames, frame, fps } = json ?? {};
  if (!Array.isArray(frames) || !frames.length) return null;
  if (!Number.isInteger(frame) || frame < 0 || frame >= frames.length) return null;
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) return null;
  if (!(cols * charRowsOf(rows) <= MAX_ANIMATION_CELLS) || frames.length > maxFramesFor(cols * charRowsOf(rows))) return null;
  const read = [], old = [], spans = [];
  let shown = new Set(); // the shapes a frame shows: Blank frames carry them on, so each frame is counted whole
  for (const entry of frames) {
    const { kind, hold, changes, drawn, stays, shapes, eases, tweens, motions, parts } = entry ?? {};
    if (!FRAME_KINDS.includes(kind) || !Number.isFinite(hold) || hold < 0 || hold > 60) return null;
    const map = readChanges(changes, layers);
    if (!map || !readShapes(shapes, map, layers)) return null;
    if (kind !== 'blank') shown = new Set();
    for (const [key, state] of map) if (isShapeKey(key)) shown[isEmptyState(state) ? 'delete' : 'add'](key);
    if (shown.size > MOST_SHAPES) return null;
    if (drawn !== undefined && !(Array.isArray(drawn) && drawn.length <= MAX_CELLS && drawn.every((key) => goodKey(key)))) return null;
    if (stays !== undefined && !(Array.isArray(stays) && stays.every((key) => goodKey(key, layers) && map.has(key)))) return null;
    const staying = json.cellsCarry === false ? [...map.keys()].filter((key) => !isShapeKey(key)) : stays ?? [];
    for (const key of staying) map.set(key, cellState(map.get(key).cell, map.get(key).top, map.get(key).bottom, true));
    const next = newFrame(kind, map);
    if (staying.length) withModes(next).get(BASE).keys = new Set(staying);
    next.hold = hold;
    next.tweens = eases === undefined ? readTweens(tweens, map) : readEases(eases, map);
    next.motions = readMotions(motions, next.tweens, json.motion);
    next.parts = readParts(parts, map);
    if (parts === undefined && shapes?.length) old.push(read.length);
    if (eases === undefined && next.tweens) spans.push(read.length);
    if (drawn?.length) next.drawn = new Map([[KEPT, new Set(drawn)]]);
    read.push(next);
  }
  inferParts(read, old);
  // A span's easing, from before each part had its own, goes to every part its first frame sets, but those with no key
  // after it; its motion stays on the Transform, if that's one of them (dropStrays). Easings saved part by part are kept
  // as they were, so a project shows the same after a reload.
  for (const i of spans) {
    read[i].tweens = new Map([...read[i].tweens].map(([key, easing]) => {
      const set = setPartsAt(read, key, i);
      return [key, new Map(PARTS.filter((name) => set.has(name)).map((name) => [name, easing]))];
    }));
  }
  dropStrays(read, new Set(spans));
  return { frames: read, frame, fps };
}
