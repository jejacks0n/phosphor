// Animation: the document's frames (document/frames.js). The current frame's resolved state is the normal
// editCells and paintLayer, swapped when the frame changes, because everything that edits only ever touches
// those two. A frame's changes are worked out from them on leaving it (noteFrame), so no tool knows about
// frames. Owns _arrived (what the frame held on arrival), _noted (what noteFrame last saw) and _builder (what
// builds frames for playing, and what it was prepared for).
import FrameBuilder from '@/document/FrameBuilder.js';
import { cellState, foldDeleted, frameDiff, newFrame, paintImage, resolveOver, sameChanges, drawnKeys } from '@/document/frames.js';
import { pack } from '@/document/changes.js';
import { cellKey, parseKey } from '@/document/editCells.js';
import { cellIndex, charRowsOf } from '@/lib/Cells.js';
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
  return states;
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
  const cells = new Map();
  for (const [key, { cell }] of resolved) if (cell) cells.set(key, cell);
  project.editCells = cells;
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

// The frame showing's changes, from what it shows now. Skipped when nothing's happened since the last time.
function note(project) {
  const frame = project.currentFrame, noted = project._noted;
  if (!project._stroke && noted?.frame === frame && noted.history === project.history.version && noted.edit === project.editVersion) return;
  project._noted = markRaw({ frame, history: project.history.version, edit: project.editVersion });
  const previous = project.frame > 0 && frame.kind === 'blank' ? project.resolvedOf(project.frame - 1) : NOTHING;
  const changes = frameDiff(previous, liveStates(project));
  if (sameChanges(changes, frame.changes)) return;
  frame.changes = changes;
  project.staleFrames(project.frame);
  project.frames = [...project.frames]; // the bar's marks, and hasEdits
}

// Before anything that changes which frames there are: what's open is set down on the frame it was done on.
function settleFrame(project) {
  project.ensureLayer();
  project.commitPending();
  project._float = null;
  note(project);
}

const framesNow = (project) => ({ list: project.frames, states: project.frames.map(({ kind, changes }) => ({ kind, changes })), showing: project.currentFrame });

// The frames as a step of history left them. Frame objects are kept, so a deleted frame's ledger comes back with
// it. Holds aren't part of a step, and they live on the frame, so they stay.
function putFrames(project, { list, states, showing }) {
  const was = project.frames, leaving = project.currentFrame;
  for (const frame of was) if (!list.includes(frame)) frame.resolved = frame.built = null; // history holds it, and these are only worked out
  const differs = (frame, at) => frame !== was[at] || frame.kind !== states[at].kind || frame.changes !== states[at].changes;
  const first = list.findIndex(differs);
  list.forEach((frame, at) => Object.assign(frame, states[at]));
  if (first >= 0) for (let at = first; at < list.length; at++) list[at].resolved = list[at].built = null;
  project.frames = list;
  project._float = null;
  arrive(project, list.indexOf(showing), leaving);
}

// One undo step around a change to the frames: change makes the new list and says which frame shows.
function frameStep(project, change) {
  const before = framesNow(project);
  const showing = change();
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

  // What frame i shows, cached on the frame. An earlier frame can't have changed while another shows.
  resolvedOf(i) {
    if (i >= this.frame) this.noteFrame();
    let from = i;
    while (from > 0 && !this.frames[from].resolved) from--;
    for (let at = from; at <= i; at++) {
      const frame = this.frames[at];
      frame.resolved ??= resolveOver(at ? this.frames[at - 1].resolved : NOTHING, frame);
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
    const previous = this.resolvedOf(this.frame - 1), own = frameDiff(previous, liveStates(this));
    const { cols } = this, rows = charRowsOf(this.rows);
    for (const key of previous.keys()) {
      if (own.has(key)) continue;
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
      this.frames = [...this.frames.slice(0, at), added, ...this.frames.slice(at)];
      this.staleFrames(at);
      return added;
    });
  },

  // The rest of the movie looks the same (foldDeleted). The only frame can't go.
  deleteFrame() {
    if (!this.hasFrames) return;
    settleFrame(this);
    frameStep(this, () => {
      const deleted = this.currentFrame, at = this.frame, next = this.frames[at + 1];
      if (next) Object.assign(next, foldDeleted(deleted, next));
      this.frames = this.frames.filter((frame) => frame !== deleted);
      deleted.resolved = deleted.built = null; // history holds it, and these are only worked out
      if (next) this.frames[at].resolved = this.frames[at].built = null;
      return this.frames[Math.min(at, this.frames.length - 1)];
    });
  },

  // A frame moves with its changes as they are, so its look can change with what now comes before it. The
  // frame showing stays the one showing, wherever that puts it.
  moveFrame(from, to) {
    if (from === to || !this.frames[from] || !this.frames[to]) return;
    settleFrame(this);
    frameStep(this, () => {
      const showing = this.currentFrame, frames = [...this.frames];
      frames.splice(to, 0, ...frames.splice(from, 1));
      for (let at = Math.min(from, to); at < frames.length; at++) frames[at].resolved = frames[at].built = null;
      this.frames = frames;
      return showing;
    });
  },

  // A frame's kind and changes set from outside (a Clear, and its undo), and shown as the frame now resolves.
  setFrameState({ kind, changes }) {
    const frame = this.currentFrame;
    Object.assign(frame, { kind, changes });
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
