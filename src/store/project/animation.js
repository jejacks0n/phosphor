// Animation: the document's frames (document/frames.js). The current frame's resolved state is the normal
// editCells and paintLayer, swapped when the frame changes, because everything that edits only ever touches
// those two. A frame's changes are worked out from them on leaving it (noteFrame), so no tool knows about
// frames. Owns _arrived (what the frame held on arrival) and _noted (what noteFrame last saw).
import { cellState, foldDeleted, frameDiff, newFrame, resolveOver, sameChanges } from '@/document/frames.js';
import { pack } from '@/document/changes.js';
import { cellKey, parseKey } from '@/document/editCells.js';
import { newLedger } from '@/store/project/shared.js';

const NOTHING = new Map();
const MOST_HOLD = 60;
const MOST_FPS = 60;

const clamped = (value, least, most) => Math.min(most, Math.max(least, value));

// A resolved frame's paint, as PaintLayer.loadGrid takes it.
function paintImage(resolved, cols, rows) {
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
function arrive(project, i, leaving = project.currentFrame) {
  const frame = project.frames[i], version = project.history.version;
  leaving.ledger = project._ledger;
  leaving.ledgerAt = version;
  project._ledger = frame.ledger ?? newLedger(() => project);
  frame.ledger = null;
  project.frame = i;
  project._noted = { frame: project.frames[i], history: project.history.version, edit: project.editVersion };
  const resolved = project.resolvedOf(i);
  const cells = new Map();
  for (const [key, { cell }] of resolved) if (cell) cells.set(key, cell);
  project.editCells = cells;
  const layer = project.paintLayer;
  layer.loadGrid(paintImage(resolved, layer.cols, layer.rows));
  project.hasPaint = layer.hasPaint;
  project._arrived = { paint: layer.hasPaint ? layer.gridPixels() : null, states: resolved };
  if (frame.ledgerAt !== version) project._ledger.refreshBases(); // an earlier frame may have changed what's under its strokes
  if (!project.composite()) project.rebuildCells();
}

// The frame showing's changes, from what it shows now. Skipped when nothing's happened since the last time.
function note(project) {
  const frame = project.currentFrame, noted = project._noted;
  if (!project._stroke && noted?.frame === frame && noted.history === project.history.version && noted.edit === project.editVersion) return;
  project._noted = { frame, history: project.history.version, edit: project.editVersion };
  const previous = project.frame > 0 && frame.kind === 'blank' ? project.resolvedOf(project.frame - 1) : NOTHING;
  const changes = frameDiff(previous, liveStates(project));
  if (sameChanges(changes, frame.changes)) return;
  frame.changes = changes;
  project.staleFrames(project.frame);
  project.frames = [...project.frames]; // the bar's marks, and hasEdits
}

// Before anything that changes which frames there are: what's open is set down on the frame it was done on.
function settleFrame(project) {
  project.commitPending();
  project._float = null;
  note(project);
}

const framesNow = (project) => ({ list: project.frames, states: project.frames.map(({ kind, changes }) => ({ kind, changes })), showing: project.currentFrame });

// The frames as a step of history left them. Frame objects are kept, so a deleted frame's ledger comes back with
// it. Holds aren't part of a step, and they live on the frame, so they stay.
function putFrames(project, { list, states, showing }) {
  const was = project.frames, leaving = project.currentFrame;
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
}

export const animationActions = {
  // Moving the scrubber: what's open is set down on the frame it was done on. The selection and the text
  // cursor stay.
  showFrame(i) {
    if (i === this.frame || !this.frames[i]) return;
    this.ensureLayer();
    if (!this.paintLayer) return;
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
    this.ensureLayer();
    if (!this.paintLayer) return;
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
    this.animate = !!on;
  },
};
