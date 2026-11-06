// Animation: the document's frames (document/frames.js). The current frame's resolved state is the normal
// editCells, shapes (its 'v:' keys, a shape as a state's cell) and paintLayer, swapped when the frame changes, because everything that edits only ever touches
// those two. A frame's changes are worked out from them on leaving it (noteFrame), so no tool knows about
// frames. Owns _arrived (what the frame held on arrival), _noted (what noteFrame last saw) and _builder (what
// builds frames for playing, and what it was prepared for).
import FrameBuilder from '@/document/FrameBuilder.js';
import { BASE, EMPTY_STATE, cellState, dropStrays, foldDeleted, frameDiff, isEmptyState, newFrame, paintImage, passedOn, resolveOver, sameChanges, sameState, drawnKeys, staysAt, withEases } from '@/document/frames.js';
import { pack } from '@/document/changes.js';
import { cellKey, parseKey } from '@/document/editCells.js';
import { cellIndex, charRowsOf } from '@/lib/Cells.js';
import { isShapeKey, sameShape } from '@/document/shapes.js';
import { MOTIONS, lifeAt, setPartsAt, shapeAt, spanAt, tweenReach, tweenedAt, workedOutAt } from '@/document/tweens.js';
import { PARTS, changedParts, samePart } from '@/document/parts.js';
import { addedKey, deletedKeys, moveRange, movedKeys, partKeys } from '@/document/keys.js';
import { newLedger } from '@/store/project/shared.js';
import { markRaw } from 'vue';

const NOTHING = new Map();
const MOST_HOLD = 60;
const MOST_FPS = 60;

const clamped = (value, least, most) => Math.min(most, Math.max(least, value));

// The frame showing, as states. Browsers read soft paint back a step off what was written (changes.js), so a
// half is compared with what it read on arrival, and one that hasn't changed keeps the value it arrived with:
// compared with that value directly, a frame would take ownership of every soft cell it inherited, and later
// fixes would silently stop carrying through it.
function liveStates(project) {
  const layer = project.paintLayer, arrived = project._arrived;
  const halves = new Map();
  if (layer?.hasPaint || arrived?.paint) {
    const { data, width, height } = layer.gridPixels();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const now = pack(data, (y * width + x) * 4);
        const was = arrived?.paint && x < arrived.paint.width && y < arrived.paint.height ? pack(arrived.paint.data, (y * arrived.paint.width + x) * 4) : 0;
        if (!now && !was) continue;
        const row = y >> 1, key = cellKey(x, row);
        const held = now === was ? arrived.states.get(key) : null;
        const value = held ? (y & 1 ? held.bottom : held.top) : now;
        if (!value) continue;
        const half = halves.get(key);
        if (half) half[y & 1] = value;
        else halves.set(key, y & 1 ? [0, value] : [value, 0]);
      }
    }
  }
  const states = new Map();
  for (const [key, cell] of project.editCells) {
    const half = halves.get(key);
    states.set(key, cellState(cell, half?.[0] ?? 0, half?.[1] ?? 0));
  }
  for (const [key, [top, bottom]] of halves) if (!states.has(key)) states.set(key, cellState(null, top, bottom));
  for (const [key, shape] of project.shapes) states.set(key, cellState(shape, 0, 0));
  return states;
}

// What the frame showing draws over: what the frame before passes on (its staying cells are the ghost, which is no
// part of this frame).
function carried(project) {
  if (!project.frame || project.currentFrame.kind !== 'blank') return NOTHING;
  project.resolvedOf(project.frame - 1);
  return project.frames[project.frame - 1].passes;
}

// Frame i becomes the one showing: its state in editCells and the paint layer, its ledger in _ledger. Whatever
// was showing has been noted already, or is going away. leaving: the frame whose ledger is out, when the list
// has just changed under it.
function arrive(project, i, leaving = project.currentFrame, { draw = true } = {}) {
  project._frameSwaps++; // before editCells: autosave's told this isn't an edit
  const frame = project.frames[i], version = project.history.version;
  leaving.ledger = project._ledger;
  leaving.ledgerAt = version;
  project._ledger = frame.ledger ?? newLedger(() => project);
  frame.ledger = null;
  project.frame = i;
  project._noted = markRaw({ frame, history: version, edit: project.editVersion });
  const resolved = project.resolvedOf(i);
  const cells = new Map(), shapes = new Map();
  for (const [key, { cell }] of resolved) if (cell) (isShapeKey(key) ? shapes : cells).set(key, cell);
  project.editCells = cells;
  project._frameSwaps++; // and before shapes: autosave hears each on its own
  project.shapes = shapes;
  project._shapeLayer?.set(shapes); // drawn by the composite below
  const layer = project.paintLayer;
  layer.loadGrid(paintImage(resolved, layer.cols, layer.rows));
  project.hasPaint = layer.hasPaint;
  project._arrived = markRaw({ paint: layer.hasPaint ? layer.gridPixels() : null, states: resolved });
  if (frame.ledgerAt !== version) project._ledger.refreshBases(); // an earlier frame may have changed what's under its strokes
  if (!draw) return;
  const output = project.renderer.outputCanvas;
  if (output?.width !== project.cols || output.height !== project.rows) project.render(); // a grid change's is on its way
  else if (!project.composite()) project.rebuildCells();
}

// What the frame showing would show of each shape if it didn't change that shape itself, worked out from the frames
// rather than the frame before's cache (which can hold a tween to this frame as it was): shapeOf(key), the shape or
// null. inherits(key, shape): showing shape there isn't the frame's own: it's what's inherited, though just where a
// tween puts it is the frame's own if the frame made it a key itself, other than by splitting that tween (splits). So
// visiting a frame between key frames doesn't make it a key frame, and undoing the edit that split a tween gives the
// shape back to it. tweened: the tweens across the frame, key to { shape, parts } (tweenedAt). unsetOf(key, shape): what
// the frame would show of the shape as a key frame for it (holding shape) that sets none of its parts, so none of its
// own easings count.
// motions (a frame's, shape key to motion, or null) with key's set to motion; smooth isn't kept.
function withMotion(motions, key, motion) {
  const next = new Map(motions ?? []);
  if (motion && motion !== 'smooth') next.set(key, motion);
  else next.delete(key);
  return next.size ? next : null;
}

function inheritance(project) {
  const at = project.frame, frame = project.currentFrame, bare = project.frames.slice();
  bare[at] = { ...frame, changes: new Map([...frame.changes].filter(([key]) => !isShapeKey(key))) };
  const tweened = tweenedAt(bare, at);
  const shapeOf = (key) => shapeAt(bare, key, at);
  const inherits = (key, shape) => sameShape(shape ?? undefined, shapeOf(key) ?? undefined)
    && (!tweened.has(key) || !frame.changes.has(key) || !!frame.splits?.has(key));
  const unsetOf = (key, shape) => {
    const none = project.frames.slice();
    none[at] = { ...frame, changes: new Map(frame.changes).set(key, cellState(shape, 0, 0)), parts: new Map([...(frame.parts ?? []), [key, new Set()]]) };
    return shapeAt(none, key, at);
  };
  return { shapeOf, unsetOf, inherits, tweened };
}

// The parts the frame showing sets of a shape it owns, live as shape, or null for all of them: what it set before and
// this hasn't changed, and what's changed that isn't what the frame would have without setting it.
function setParts(project, key, shape, { shapeOf, unsetOf }) {
  const frame = project.currentFrame, inherited = shapeOf(key), had = frame.changes.get(key)?.cell;
  if (!inherited) { // the shape starts here: all of it, though what it set is kept for when what was before comes back
    const own = had && frame.parts?.get(key);
    return own ? new Set([...own, ...changedParts(had, shape)]) : null;
  }
  const before = had ? (frame.parts?.get(key) ?? new Set(PARTS)) : new Set(), edited = changedParts(had ?? inherited, shape);
  const unset = unsetOf(key, shape), set = new Set([...before].filter((name) => !edited.has(name)));
  for (const name of edited) if (!samePart(shape, unset, name)) set.add(name);
  return set;
}

// What the frame showing changed over previous (what the frame before shows): its cells, and its shapes by inheritance,
// with the parts it sets of those it doesn't set all of. A shape it would set no part of isn't its own; one it set
// parts of that are as they were stays its own, though the frames before have come to match it.
// ponytail: each shape walks the frames back to its key frame; per-shape spans worked out once if huge movies lag.
function ownChanges(project, previous) {
  const live = liveStates(project), own = frameDiff(previous, live), inherited = inheritance(project), parts = new Map();
  const frame = project.currentFrame; // a cell stays as the edit that last changed it was drawn (staysAt)
  if (frame.modes) for (const [key, state] of own) if (!isShapeKey(key) && staysAt(frame, key)) own.set(key, cellState(state.cell, state.top, state.bottom, true));
  const keys = new Set([...previous.keys(), ...project.shapes.keys(), ...project.currentFrame.changes.keys()].filter(isShapeKey));
  for (const key of keys) {
    const shape = project.shapes.get(key), had = project.currentFrame.changes.get(key)?.cell;
    const kept = had && shape && [...(project.currentFrame.parts?.get(key) ?? PARTS)].every((name) => samePart(had, shape, name));
    const inherits = !kept && inherited.inherits(key, shape);
    const set = shape && !inherits ? setParts(project, key, shape, inherited) : null;
    if (inherits || set?.size === 0) own.delete(key);
    else own.set(key, shape ? cellState(shape, 0, 0) : EMPTY_STATE);
    if (set?.size && set.size < PARTS.length) parts.set(key, set);
  }
  return { own, tweened: inherited.tweened, parts: parts.size ? parts : null };
}

const sameParts = (a, b) => (a?.size ?? 0) === (b?.size ?? 0) && [...(a ?? [])].every(([key, set]) => {
  const other = b.get(key);
  return other?.size === set.size && [...set].every((name) => other.has(name));
});

// After the frame showing's changes were set down: a shape it shows other than it now works out to (a part it doesn't
// set, fading differently now it's a key frame) is shown as worked out, so what shows is what the frame is.
function reshow(project) {
  if (project._stroke) return;
  const resolved = project.resolvedOf(project.frame), next = new Map(project.shapes);
  let changed = false;
  for (const [key, shape] of project.shapes) {
    const now = resolved.get(key)?.cell;
    if (now && !sameShape(now, shape)) {
      next.set(key, now);
      changed = true;
    }
  }
  if (!changed) return;
  project._frameSwaps++; // autosave: not an edit
  project.shapes = next;
  project._shapeLayer?.set(next);
  project.refreshShapes();
  project._ledger.refreshBases();
}

// Every key frame setting only some of a shape, but the one showing (whose own note keeps), has its whole shape as it
// shows now, for when what it carries from goes.
function keepShown(project) {
  if (!project.frames.some((frame) => frame.parts?.size)) return;
  project.frames.forEach((frame, at) => {
    if (at === project.frame || !frame.parts?.size) return;
    const shown = project.resolvedOf(at); // a frame after one that isn't Blank can be worked out while one before isn't
    const kept = [...frame.parts.keys()].map((key) => [key, shown.get(key)?.cell, frame.changes.get(key)?.cell])
      .filter(([, now, held]) => now && held && !sameShape(now, held));
    if (kept.length) frame.changes = new Map([...frame.changes, ...kept.map(([key, now]) => [key, cellState(now, 0, 0)])]);
  });
}

// The frame showing's changes, from what it shows now. Skipped when nothing's happened since the last time.
function note(project) {
  const frame = project.currentFrame, noted = project._noted;
  if (!project._stroke && noted?.frame === frame && noted.history === project.history.version && noted.edit === project.editVersion) return;
  project._noted = markRaw({ frame, history: project.history.version, edit: project.editVersion });
  const { own: changes, tweened, parts } = ownChanges(project, carried(project));
  if (sameChanges(changes, frame.changes) && sameParts(parts, frame.parts)) return reshow(project);
  // A shape the frame stops having can leave later key frames with nothing to carry from: they keep how they look.
  if ([...frame.changes].some(([key, { cell }]) => isShapeKey(key) && cell && !changes.get(key)?.cell)) keepShown(project);
  const setBefore = (key) => (frame.changes.get(key)?.cell ? setPartsAt(project.frames, key, project.frame) : new Set());
  const before = new Map([...changes].filter(([key, { cell }]) => isShapeKey(key) && cell).map(([key]) => [key, setBefore(key)]));
  const reach = tweenReach(project.frames, project.frame); // the frames between that ended here, before and after
  frame.changes = changes;
  frame.parts = parts;
  // A part changed on a frame inside its tween makes this frame its key: the tween splits, both halves eased and moving
  // alike (splits: the shapes this made the frame a key for, not those it already was one for, which undo leaves as
  // keys). A part this frame starts setting anywhere else starts with no tween here.
  for (const [key, was] of before) {
    const now = setPartsAt(project.frames, key, project.frame), across = tweened.get(key)?.parts;
    const eases = new Map([...(frame.tweens?.get(key) ?? [])].filter(([name]) => now.has(name)));
    let motion = frame.motions?.get(key), split = false;
    for (const name of now) {
      if (was.has(name)) continue;
      const tween = across?.get(name);
      if (tween) eases.set(name, tween.easing);
      else eases.delete(name);
      if (name === 'transform') motion = tween?.motion;
      split ||= !!tween;
    }
    frame.tweens = withEases(frame.tweens, key, eases);
    frame.motions = withMotion(frame.motions, key, eases.has('transform') && motion);
    if (was.size) continue;
    frame.splits = new Set(frame.splits ?? []);
    frame.splits[split ? 'add' : 'delete'](key);
  }
  project.staleFrames(Math.min(reach, tweenReach(project.frames, project.frame)));
  project.staleFrames(project.frame);
  project.frames = [...project.frames]; // the bar's marks, and hasEdits
  reshow(project);
}

// Before anything that changes which frames there are: what's open is set down on the frame it was done on.
function settleFrame(project) {
  project.ensureLayer();
  project.commitPending();
  project._float = null;
  note(project);
  keepShown(project); // what's about to change which frames there are can cut a shape's key frames off
}

// After the frame before frame at went: what frame at's staying cells were over (handed, what the frame that went
// passed on) is what the frames after them showed there, so where that's changed it goes on to the first of them that
// doesn't draw over it too, as its own.
function handOn(project, at, handed) {
  const frame = project.frames[at], under = at && frame.kind === 'blank' ? (project.resolvedOf(at - 1), project.frames[at - 1].passes) : NOTHING;
  for (const [key, state] of frame.changes) {
    if (!state.stays) continue;
    const was = handed.get(key) ?? EMPTY_STATE;
    if (sameState(was, under.get(key) ?? EMPTY_STATE)) continue;
    for (let i = at + 1; i < project.frames.length && project.frames[i].kind === 'blank'; i++) {
      const later = project.frames[i], held = later.changes.get(key);
      if (held?.stays) continue;
      if (!held) later.changes = new Map(later.changes).set(key, cellState(was.cell, was.top, was.bottom));
      break;
    }
  }
}

const framesNow = (project) => ({ list: project.frames, states: project.frames.map(({ kind, changes, tweens, motions, parts, splits }) => ({ kind, changes, tweens, motions, parts, splits })), showing: project.currentFrame });
const sameFrames = (a, b) => a.list === b.list && a.states.every((state, at) => Object.keys(state).every((name) => state[name] === b.states[at][name]));

// After the list changed at index at (before: the list as it was): the frames between of a tween across there, before
// or after, go stale too, and with tweens anywhere, those after at as far as staleFrames reaches.
function staleTweens(project, before, at) {
  if (!project.frames.some((frame) => frame.tweens?.size) && !before.some((frame) => frame.tweens?.size)) return;
  project.staleFrames(Math.min(at, tweenReach(before, Math.min(at, before.length)), tweenReach(project.frames, Math.min(at, project.frames.length))));
  project.staleFrames(at); // a reach from before at stops at a frame that isn't Blank, which at can be
}

// The frames as a step of history left them. Frame objects are kept, so a deleted frame's ledger comes back with
// it. Holds aren't part of a step, and they live on the frame, so they stay.
function putFrames(project, { list, states, showing }, { draw = true } = {}) {
  const was = project.frames, leaving = project.currentFrame;
  for (const frame of was) if (!list.includes(frame)) frame.resolved = frame.built = null; // history holds it, and these are only worked out
  const differs = (frame, at) => frame !== was[at] || frame.kind !== states[at].kind || frame.changes !== states[at].changes || frame.tweens !== states[at].tweens || frame.motions !== states[at].motions || frame.parts !== states[at].parts;
  let first = list.findIndex(differs);
  if (first < 0 && list.length < was.length) first = list.length; // only frames off the end gone: a tween may have run to one
  const reach = first > 0 ? tweenReach(was, first) : first; // a tween across first, as it was
  list.forEach((frame, at) => Object.assign(frame, states[at]));
  const from = first > 0 ? Math.min(reach, tweenReach(list, first)) : first; // and as it is now
  if (first >= 0) for (let at = from; at < list.length; at++) list[at].resolved = list[at].built = null;
  project.frames = list;
  project._float = null;
  arrive(project, list.indexOf(showing), leaving, { draw });
}

// The tween each shape (by key) is in, or starts, on the frame showing, changed (change(frame it starts from, key, its
// index)) where differs(key, span) says it isn't as asked: one undo step. The first shape's tween, and every other's
// between the same key frames.
function changeTweens(project, keys, differs, change) {
  if (!project.image) return;
  settleFrame(project);
  const first = keys.length ? spanAt(project.frames, keys[0], project.frame) : null;
  if (!first) return;
  const spans = keys.map((key) => [key, spanAt(project.frames, key, project.frame)])
    .filter(([key, span]) => span && span.from === first.from && span.to === first.to && differs(key, span));
  if (!spans.length) return;
  frameStep(project, () => {
    for (const [key, { from }] of spans) {
      const reach = tweenReach(project.frames, from + 1); // a part fading across this span, before and after
      change(project.frames[from], key, from);
      project.staleFrames(Math.min(from, reach, tweenReach(project.frames, from + 1)));
      project.staleFrames(from);
    }
    project.frames = [...project.frames];
    return project.currentFrame;
  });
}

// A patch of a shape's keys (keys.js) set on the frames: what it reaches redrawn, and each key frame setting only some
// of a shape keeping how it shows. A frame a key action changes is the shape's key there on purpose, so it's no split.
function putKeys(project, key, patch) {
  if (!patch?.size) return;
  const reach = new Map([...patch.keys()].map((at) => [at, tweenReach(project.frames, at)])); // a tween across, before
  for (const [at, state] of patch) {
    const frame = project.frames[at];
    Object.assign(frame, state);
    if (frame.splits?.has(key)) frame.splits = new Set([...frame.splits].filter((each) => each !== key));
  }
  dropStrays(project.frames);
  for (const [at, was] of reach) {
    project.staleFrames(Math.min(at, was, tweenReach(project.frames, at))); // and after
    project.staleFrames(at);
  }
  keepShown(project);
  project.frames = [...project.frames];
}

// One undo step setting patchOf(frames)'s keys of a shape (null or empty: nothing to do, and no step).
function keyStep(project, key, patchOf) {
  if (!project.image) return;
  settleFrame(project);
  const patch = patchOf(project.frames);
  if (!patch?.size) return;
  frameStep(project, () => {
    putKeys(project, key, patch);
    return project.currentFrame;
  });
}

// The patch changing each of a shape's keys refs name that has a next key of its part (row's key { at, easing, motion })
// and differs(part, key) says isn't as asked: change(entry, part) sets the frame's { eases, motion } for the shape.
function keyEntries(frames, key, refs, differs, change) {
  const keys = refs.length ? partKeys(frames, key, Math.min(...refs.map(({ at }) => at))) : null, patch = new Map();
  for (const { part, at } of refs) {
    const row = keys?.rows.get(part) ?? [], j = row.findIndex((k) => k.at === at);
    if (j < 0 || j === row.length - 1 || !differs(part, row[j])) continue;
    const frame = { ...frames[at], ...patch.get(at) }, entry = { eases: new Map(frame.tweens?.get(key) ?? []), motion: frame.motions?.get(key) };
    change(entry, part);
    const tweens = withEases(frame.tweens, key, entry.eases);
    patch.set(at, { changes: frame.changes, tweens, motions: withMotion(frame.motions, key, entry.eases.has('transform') && entry.motion), parts: frame.parts });
  }
  return patch;
}

// The parts a shape's key frame `from` sets that have a key after it to tween to (the Tween menu's, as one for them all).
function leaving(frames, key, from) {
  const life = lifeAt(frames, key, from), sets = life.map((k) => setPartsAt(frames, key, k, life)), j = life.indexOf(from);
  return PARTS.filter((name) => sets[j].has(name) && sets.slice(j + 1).some((set) => set.has(name)));
}

// One undo step around a change to the frames: change makes the new list and says which frame shows. Easings it leaves
// no tween for go (dropStrays).
function frameStep(project, change) {
  const before = framesNow(project);
  const showing = change();
  dropStrays(project.frames);
  const after = { ...framesNow(project), showing };
  project.pushEdit({ frameOp: true, undo: () => putFrames(project, before), redo: () => putFrames(project, after), bytes: 0 });
  arrive(project, project.frames.indexOf(showing), before.showing);
  project.pickPalette();
}

// What every built frame depends on besides its own state: anything here changing means building them all again.
function buildKey(project) {
  const { image, ...params } = project.processParams;
  return { image, settings: JSON.stringify(params), baseLayer: project.baseLayer, baseVersion: project.baseLayer?.version, baseRecords: project.baseRecords };
}
const sameKey = (a, b) => !!a && !!b && Object.keys(a).every((name) => a[name] === b[name]);

// A builder prepared for the document as it is now. Everything built before that goes.
async function readyBuilder(project) {
  for (;;) {
    const key = buildKey(project), held = project._builder;
    if (sameKey(held?.key, key) && !held.preparing) return held.builder;
    if (sameKey(held?.key, key)) {
      await held.preparing;
      continue;
    }
    const builder = new FrameBuilder();
    const preparing = builder.prepare(key.image, project.processParams, project);
    project._builder = markRaw({ key, builder, preparing });
    for (const frame of project.frames) frame.built = null;
    await preparing;
    if (project._builder?.builder === builder) {
      project._builder.preparing = null;
      builder.usePalette(project._moviePalette ?? null);
    }
  }
}

const samePalette = (a, b) => a?.length === b?.length && a?.every((color, i) => color.hex === b[i].hex);

// The movie's Number palette, for whatever's showing now. Between frames only with frames and Color count.
async function pick(project) {
  const wanted = project.hasFrames && project.quantize === 'count';
  if (!wanted) {
    if (!project._moviePalette) return;
    project._moviePalette = null;
    project.renderer.usePalette(null);
    project._builder?.builder.usePalette(null);
    if (project.renderer.outputCanvas && project.image && !project.composite()) project.rebuildCells();
    return;
  }
  if (project._stroke) return; // it comes when the stroke ends
  const builder = await readyBuilder(project);
  if (!project.hasFrames || project.quantize !== 'count' || project._stroke || !project.renderer.outputCanvas) return;
  const params = project.processParams;
  project.noteFrame(); // the frame showing's edits, which tweens can carry back to frames before it
  const next = builder.moviePalette(project.frames.map((_, i) => project.resolvedOf(i)), params);
  builder.usePalette(next);
  if (samePalette(next, project._moviePalette)) return;
  project._moviePalette = markRaw(next);
  project.renderer.usePalette(next);
  for (const frame of project.frames) frame.built = null;
  project.composite();
  project.rebuildCells();
}

export const animationActions = {
  // Moving the scrubber: what's open is set down on the frame it was done on. The selection and the text
  // cursor stay.
  showFrame(i) {
    if (i === this.frame || !this.frames[i] || !this.image) return;
    settleFrame(this);
    arrive(this, i);
  },

  // A still has no one to carry anything to, so it never works out changes.
  noteFrame() {
    if (this.hasFrames) note(this);
  },

  // What frame i shows, cached on the frame, with the shapes tweens put there. An earlier frame can't have changed
  // while another shows, but it can look different: a frame between key frames follows the later one.
  resolvedOf(i) {
    if (i >= this.frame) this.noteFrame();
    let from = i;
    while (from > 0 && !this.frames[from].resolved) from--;
    for (let at = from; at <= i; at++) {
      const frame = this.frames[at];
      if (frame.resolved) continue;
      const previous = at ? this.frames[at - 1].passes : NOTHING;
      frame.resolved = resolveOver(previous, frame);
      const kept = [];
      for (const [key, shape] of workedOutAt(this.frames, at)) {
        frame.resolved.set(key, cellState(shape, 0, 0));
        // A key frame's whole shape is kept as it shows, for when what it carries from goes (the frame showing's is note's).
        const held = frame.changes.get(key)?.cell;
        if (at !== this.frame && held && frame.parts?.has(key) && !sameShape(held, shape)) kept.push([key, cellState(shape, 0, 0)]);
      }
      if (kept.length) frame.changes = new Map([...frame.changes, ...kept]);
      frame.passes = passedOn(previous, frame, frame.resolved);
    }
    return this.frames[i].resolved;
  },

  // One Number palette for the movie, so colors don't shift between frames: picked from every frame's output and
  // re-picked as a still's is, when an edit ends. A call while one runs waits for it, then runs again.
  pickPalette() {
    const running = this._palettePick ?? Promise.resolve();
    if (this._paletteAgain) return running;
    this._paletteAgain = true;
    const next = running.then(() => {
      this._paletteAgain = false;
      return pick(this);
    }).catch((error) => console.error('Failed to pick the palette', error)).finally(() => {
      if (this._palettePick === next) this._palettePick = null;
    });
    this._palettePick = next;
    return next;
  },

  // Frame i's cells for playing, built if they need to be (document/FrameBuilder.js). What's built stays until
  // something it depends on changes.
  async builtFrame(i) {
    this.ensureLayer();
    this.noteFrame(); // the frame showing's edits, which tweens can carry back to frames before it
    for (;;) {
      if (!this.frames[i] || !this.image) return null;
      if (this.hasFrames && this.quantize === 'count' && !this._moviePalette) await this.pickPalette();
      const builder = await readyBuilder(this);
      if (!sameKey(this._builder?.key, buildKey(this))) continue; // changed while waiting
      const frame = this.frames[i];
      if (!frame) return null;
      const resolved = this.resolvedOf(i); // the frame showing is noted by this, which can stale what's built
      frame.built ??= builder.build(resolved, this.processParams, this.frames[i - 1]?.built);
      return frame.built;
    }
  },

  // The frame before's picture, when cells of its stay, built for shownCells to show them as the ghost: ghostBefore.
  async buildGhost() {
    const at = this.frame, prior = this.frames[at - 1];
    if (!this.animate || !prior || this.currentFrame.kind !== 'blank' || ![...prior.changes.values()].some((state) => state.stays)) return;
    if (this.ghostBefore?.frame === prior && this.ghostBefore.built === prior.built) return;
    const built = await this.builtFrame(at - 1);
    if (built && this.frames[this.frame - 1] === prior) this.ghostBefore = markRaw({ frame: prior, built });
  },

  // The open stroke went over these pixels ({ x, y }), whether or not that changed them. Frame 0 has no ghost.
  noteDrawn(pixels) {
    if (!this.frame || !this._stroke) return;
    const drawn = (this._stroke.drawn ??= new Set());
    for (const { x, y } of pixels) drawn.add(cellKey(x, y >> 1));
  },

  // The cells the frame showing shows only because a frame before it did, by index on the grid: its ghost.
  inheritedCells() {
    const inherited = new Set();
    if (!this.frame || this.currentFrame.kind !== 'blank') return inherited;
    const previous = carried(this), { own } = ownChanges(this, previous);
    const { cols } = this, rows = charRowsOf(this.rows);
    for (const key of previous.keys()) {
      if (own.has(key) || isShapeKey(key)) continue;
      const { col, row } = parseKey(key);
      if (col < cols && row < rows) inherited.add(cellIndex(col, row, cols));
    }
    // Drawn here in exactly the color it inherited: the frame doesn't own it, but it's no ghost to whoever drew it.
    for (const key of drawnKeys(this.currentFrame)) {
      const { col, row } = parseKey(key);
      if (col < cols) inherited.delete(cellIndex(col, row, cols));
    }
    return inherited;
  },

  // The frame before's staying cells where the frame showing shows nothing, by index on the grid: the picture ghost.
  pictureCells() {
    const picture = new Set();
    if (!this.frame || this.currentFrame.kind !== 'blank') return picture;
    const prior = this.frames[this.frame - 1], { cols } = this, rows = charRowsOf(this.rows);
    let live = null;
    for (const [key, state] of prior.changes) {
      if (!state.stays || isEmptyState(state) || (live ??= liveStates(this)).has(key)) continue;
      const { col, row } = parseKey(key);
      if (col < cols && row < rows) picture.add(cellIndex(col, row, cols));
    }
    return picture;
  },

  // The shapes the frame showing shows only because a frame before it did (VECTOR dims their outlines).
  inheritedShapes() {
    const inherited = new Set();
    if (!this.frame || this.currentFrame.kind !== 'blank') return inherited;
    const previous = carried(this), { own } = ownChanges(this, previous);
    for (const key of previous.keys()) if (isShapeKey(key) && !own.has(key)) inherited.add(key);
    return inherited;
  },

  // What's cached of frame i onward goes, as far as a change there can reach: a frame that isn't Blank is cut
  // off from those before it.
  staleFrames(from = 0) {
    for (let at = from; at < this.frames.length; at++) {
      const frame = this.frames[at];
      if (at > from && frame.kind !== 'blank') break;
      frame.resolved = frame.built = null;
    }
  },

  // A new frame after the one showing, which it then shows. A Duplicate holds a full copy of what it
  // inherited, so later fixes on earlier frames can't reach it.
  addFrame(kind) {
    if (!this.image || !this.canAnimate || this.frames.length >= this.mostFrames) return; // a file couldn't keep them over the limit
    settleFrame(this);
    frameStep(this, () => {
      const at = this.frame + 1;
      const added = newFrame(kind, kind === 'duplicate' ? new Map(this.resolvedOf(this.frame)) : new Map());
      const staying = [...added.changes].filter(([, state]) => state.stays).map(([key]) => key); // its own copies stay too
      if (staying.length) added.modes = new Map([[BASE, { stays: true, keys: new Set(staying) }]]);
      const before = this.frames;
      this.frames = [...this.frames.slice(0, at), added, ...this.frames.slice(at)];
      this.staleFrames(at);
      staleTweens(this, before, at);
      return added;
    });
  },

  // The rest of the movie looks the same (foldDeleted). The only frame can't go.
  deleteFrame() {
    if (!this.hasFrames) return;
    settleFrame(this);
    frameStep(this, () => {
      const deleted = this.currentFrame, at = this.frame, next = this.frames[at + 1];
      const before = this.frames.map((frame) => ({ ...frame })); // as they were, next before its fold
      const handed = next?.kind === 'blank' ? (this.resolvedOf(at), deleted.passes) : null; // what next drew over
      if (next) Object.assign(next, foldDeleted(deleted, next));
      this.frames = this.frames.filter((frame) => frame !== deleted);
      deleted.resolved = deleted.built = null; // history holds it, and these are only worked out
      if (handed) handOn(this, at, handed);
      if (next) this.staleFrames(at);
      staleTweens(this, before, at);
      return this.frames[Math.min(at, this.frames.length - 1)];
    });
  },

  // A frame moves with its changes as they are, so its look can change with what now comes before it. The
  // frame showing stays the one showing, wherever that puts it.
  moveFrame(from, to) {
    if (from === to || !this.frames[from] || !this.frames[to]) return;
    settleFrame(this);
    frameStep(this, () => {
      const showing = this.currentFrame, frames = [...this.frames], first = Math.min(from, to);
      frames.splice(to, 0, ...frames.splice(from, 1));
      const reach = Math.min(first, tweenReach(this.frames, first), tweenReach(frames, first)); // a tween across, before or after
      for (let at = reach; at < frames.length; at++) frames[at].resolved = frames[at].built = null;
      this.frames = frames;
      return showing;
    });
  },

  // The tween each shape (by key) is in, or starts, on the frame showing gets an easing, or with null none, on every
  // part its first frame sets that has a key after it (leaving): one undo step. A shape with no later key frame to tween
  // to is left as it is.
  setTween(keys, easing) {
    const differs = (key, { from }) => leaving(this.frames, key, from).some((name) => (this.frames[from].tweens?.get(key)?.get(name) ?? null) !== easing);
    changeTweens(this, keys, differs, (frame, key, from) => {
      const eases = new Map(frame.tweens?.get(key) ?? []);
      for (const name of leaving(this.frames, key, from)) {
        if (easing) eases.set(name, easing);
        else eases.delete(name);
      }
      frame.tweens = withEases(frame.tweens, key, eases);
      if (!eases.has('transform')) frame.motions = withMotion(frame.motions, key, null);
    });
  },

  // How the tween each shape (by key) is in, or starts, on the frame showing moves it (MOTIONS): one undo step. Only an
  // eased Transform has a motion.
  setTweenMotion(keys, motion) {
    if (!MOTIONS.includes(motion)) return;
    changeTweens(this, keys, (key, span) => !!this.frames[span.from].tweens?.get(key)?.has('transform') && span.motion !== motion, (frame, key) => {
      frame.motions = withMotion(frame.motions, key, motion);
    });
  },

  // The tween leaving each of a shape's keys refs ({ part, at }) name gets easing, or with null none (and the Transform's
  // no motion): one undo step. A part's last key has no tween to ease.
  setKeyEasing(shapeKey, refs, easing) {
    keyStep(this, shapeKey, (frames) => keyEntries(frames, shapeKey, refs, (part, k) => k.easing !== easing, ({ eases }, part) => {
      if (easing) eases.set(part, easing);
      else eases.delete(part);
    }));
  },

  // How the tween leaving the Transform keys refs name moves (MOTIONS), where it's eased: one undo step.
  setKeyMotion(shapeKey, refs, motion) {
    if (!MOTIONS.includes(motion)) return;
    keyStep(this, shapeKey, (frames) => keyEntries(frames, shapeKey, refs, (part, k) => part === 'transform' && !!k.easing && k.motion !== motion, (entry) => {
      entry.motion = motion;
    }));
  },

  // The keys refs name go, but the shape's first and fixed ones (deletedKeys): one undo step.
  deleteKeys(shapeKey, refs) {
    keyStep(this, shapeKey, (frames) => deletedKeys(frames, shapeKey, refs));
  },

  // A key for part on the frame showing, with the value it has there (addedKey): one undo step.
  addKey(shapeKey, part) {
    keyStep(this, shapeKey, (frames) => addedKey(frames, shapeKey, part, this.frame));
  },

  // The keys refs name moved by `by` frames, as far as they can go (moveRange): one undo step, or with drag (the
  // gesture's own object) none until endKeyDrag, each move made from where the drag began. Returns the refs where they
  // landed.
  moveKeys(shapeKey, refs, by, drag = null) {
    if (!this.image) return refs;
    if (drag?.before) putFrames(this, drag.before, { draw: false });
    else settleFrame(this);
    if (drag) drag.before ??= framesNow(this);
    const { least, most } = moveRange(this.frames, shapeKey, refs);
    const moved = movedKeys(this.frames, shapeKey, refs, clamped(by, least, most));
    if (drag) {
      putKeys(this, shapeKey, moved.patch);
      arrive(this, this.frame);
    } else if (moved.patch.size) {
      frameStep(this, () => {
        putKeys(this, shapeKey, moved.patch);
        return this.currentFrame;
      });
    }
    return moved.refs;
  },

  // A drag's moves, one undo step, when it's left anything moved.
  endKeyDrag(drag) {
    const before = drag?.before, after = before && framesNow(this);
    if (!before) return;
    drag.before = null;
    if (sameFrames(before, after)) return;
    this.pushEdit({ frameOp: true, undo: () => putFrames(this, before), redo: () => putFrames(this, after), bytes: 0 });
    this.pickPalette();
  },

  // A drag given up: the frames as it found them.
  cancelKeyDrag(drag) {
    if (!drag?.before) return;
    putFrames(this, drag.before);
    drag.before = null;
  },

  // An edit's shapes on the frame showing, as they were before it: [key, shape | null] for those the frame had of its
  // own (null: none), [key] for those it only inherited, which it inherits again as they are by now (a tween, or a
  // frame folded in, can have changed them since). Nothing on a still: the ledger's values are right there.
  shapesBefore(keys, shapes) {
    if (!this.hasFrames) return [];
    const { inherits } = inheritance(this);
    return keys.map((key) => (inherits(key, shapes.get(key)) ? [key] : [key, shapes.get(key) ?? null]));
  },

  // Undoing an edit on a frame: its shapes as shapesBefore said, whatever the ledger kept from the frame's earlier
  // strokes, which a frame change since can have left behind.
  putShapesBack(before) {
    if (!this.hasFrames || !before.length) return;
    const { shapeOf } = inheritance(this), next = new Map(this.shapes);
    for (const [key, shape] of before) {
      const now = shape === undefined ? shapeOf(key) : shape;
      if (now) next.set(key, now);
      else next.delete(key);
    }
    this.shapes = next;
    this._shapeLayer?.set(next);
    this.refreshShapes();
  },

  // A frame's kind, changes and parts set from outside (a Clear, and its undo), and shown as the frame now resolves.
  // Easings this leaves no tween for go (dropStrays), or with eases ([frame, tweens, motions] for every frame, from
  // before) they come back.
  setFrameState({ kind, changes, parts = null, eases = null }) {
    keepShown(this);
    const frame = this.currentFrame, reach = tweenReach(this.frames, this.frame); // the frames between of a tween ending here
    Object.assign(frame, { kind, changes, parts });
    if (eases) for (const [each, tweens, motions] of eases) Object.assign(each, { tweens, motions });
    else dropStrays(this.frames);
    this.staleFrames(Math.min(reach, tweenReach(this.frames, this.frame)));
    this.staleFrames(this.frame);
    this.frames = [...this.frames];
    arrive(this, this.frame, frame);
  },

  // The next or previous frame, wrapping as playback does.
  stepFrame(by) {
    this.showFrame((this.frame + by + this.frames.length) % this.frames.length);
  },

  setHold(i, seconds) {
    if (!this.frames[i]) return;
    this.frames[i].hold = clamped(Number(seconds) || 0, 0, MOST_HOLD);
    this.frames = [...this.frames];
    this.editVersion++;
  },

  setFps(n) {
    this.fps = clamped(Math.round(Number(n)) || 1, 1, MOST_FPS);
    this.editVersion++;
  },

  setAnimate(on) {
    this.animate = !!on && this.canAnimate;
  },

  // The frames a file held (deserializeFrames), over the document just opened from it: the frame it was on shows,
  // from its own state, and Animate's on. The render that opens the document draws it.
  openFrames({ frames, frame, fps }) {
    const leaving = this.currentFrame;
    this.ensureLayer();
    let cols = 0, rows = 0;
    for (const { changes } of frames) {
      for (const [key, { top, bottom }] of changes) {
        if (!top && !bottom) continue;
        const at = parseKey(key);
        cols = Math.max(cols, at.col + 1);
        rows = Math.max(rows, 2 * (at.row + 1));
      }
    }
    this.paintLayer.extend(cols, rows);
    this.baseLayer.extend(this.paintLayer.cols, this.paintLayer.rows); // together, as ever
    this.frames = frames;
    this.fps = fps;
    arrive(this, frame, leaving, { draw: false });
    this.setAnimate(true);
  },

  // A fresh document's one frame. Autosave doesn't count this one, or a frame's swap, as editing.
  resetFrames() {
    this.frames = [newFrame('blank')];
    this.frame = 0;
    this.fps = 8;
    this._arrived = this._noted = this._moviePalette = null;
    this.renderer.usePalette(null);
  },

  // Bake's before and after: every frame's kind and changes, set, and the frame showing shown from them.
  setAllFrames(states) {
    this.frames.forEach((frame, at) => {
      Object.assign(frame, states[at]);
      frame.resolved = frame.built = null;
    });
    arrive(this, this.frame);
  },
};
