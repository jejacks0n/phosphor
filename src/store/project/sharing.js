// The document shared with a room: an edit goes out as it happens, a change heard is written, and undo
// asks the host. Owns _sharing ({ send(message), role, me }, what's waiting for its frame, and, for an artist,
// its Pending, what that reads and writes through, and what's held), _paused, and _floating (a float's move
// is being made).
//
// A stroke goes out in slices: what's changed since the last one, every 100 ms and at commitEdit, under
// the stroke's id. For a host, and for anyone alone, a slice goes in the ledger; a host also sends what
// it's numbered. For an artist it goes in Pending and is sent, to come back with its number. After a slice
// the open stroke's baseline (_stroke.editCells, the paint stroke's saved tiles) is what was sent, so a change
// heard mid-stroke, written after sending what's there and to the baseline as well, is never part of it.
//
// An artist's undo goes to the host and nothing moves until the number comes back. A float's moves can't
// wait for that: each takes the last back at once. So an artist holds a float's change at home (in Pending,
// where what it covers is kept and what's heard goes beneath, but not sent) until the next edit, the
// next commitPending, which placing it is, or HELD_FLOAT_MS with no further move. Others see it land then
// rather than follow the drag; a move after that is a new run, and a new undo step.
//
// A change heard copies the map (22 ms at 500k cells) and refreshes, and several artists at ten slices a
// second would swamp a tab, so what comes in one frame is written together. An artist can just wait: what it
// hears is already late, and Pending is made for that. A host can't, since its ledger is the order: it numbers
// and sends an artist's change at once, and its paint goes on the layer then, but the cells wait in heardCells,
// where the ledger reads them (readCell) and a slice of the host's, numbered after, takes them back.
import { markRaw } from 'vue';
import { deserializeBase } from '@/document/baseRecords.js';
import { cellChanges, exactly, keepBaseline, pixelRuns, splitChange, pack, Tail } from '@/document/changes.js';
import { TILE } from '@/document/History.js';
import { charRowsOf } from '@/lib/Cells.js';
import { Pending } from '@/social/pending.js';
import { MOST_CHANGE_BYTES, readChange } from '@/social/wire.js';
import { ALONE, SAVED_KEYS, anyoneInside, randomId, runsPatch } from '@/store/project/shared.js';
import { toast } from '@/composables/useToast';
import { settingsFromStranger } from '@/store/settings.js';

const SLICE_MS = 100;
export const ASK_AGAIN_MS = 30_000;
export const HELD_FLOAT_MS = 2000; // an artist's block left this long with no further move goes out
const HIDDEN_TAB_MS = 100; // a hidden tab has no frames, and still has to catch up
const EDIT_ONLY = { base: false, edit: true };

// Refused while paused: everything that changes the drawing. changeSelection isn't here: it's not a change
// to the document, and Deselect goes on working.
export const DRAWING_ACTIONS = [
  'paintEditPixels', 'paintStroke', 'eraseEditPixels', 'editCell', 'typeAt', 'writeAt', 'backspaceAt', 'deleteAt', 'typing', 'shiftCells',
  'writeEditCells', 'clearEditCells', 'flipCell', 'flipPaint', 'clearEditLayer',
  'deleteSelection', 'pasteSelection', 'stampSelection', 'floatSelection', 'turnSelection', 'deleteInWand', 'recolorSelection', 'moveSelection',
  'deleteIn', 'pasteAt', 'pasteBase', 'selectionEdit',
  'addShape', 'makeArtLayer', 'setArtContent', 'enterArt', 'updateShapes', 'deleteShapes', 'restackShapes', 'joinShapes', 'combineShapes', 'separateShape', 'addSvg', 'addShapes', 'penPoint', 'penBack',
  'undo', 'redo',
];

// Refused for artists: the picture, the settings, the grid and which document this is.
export const HOST_ONLY_ACTIONS = [
  'eraseBase', 'eraseBasePixels', 'flipBase', 'writeBase', 'writeBaseCells', 'pasteBase',
  'bake', 'mergeUp', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'mergeShapes', 'clearEditLayer',
  'setSlider', 'commitSliders', 'resetSliders', 'resetGroup', 'randomizeSeed',
  'updateCols', 'updateRows',
  'setImageFromFile', 'setBlankCanvas', 'replaceImage', 'newDocument', 'clearImage', 'loadProject', 'restoreDocument', 'openParts', 'openArtFile',
];

// Refused while someone else is drawing in an art layer, with a toast saying who: a whole-layer action or a new grid
// goes to the room as the project, which would step them out and lose what they hadn't sent. (Merge up goes as
// slices, and only takes the drawing's own cells.)
export const WHOLE_LAYER_ACTIONS = ['clearEditLayer', 'mergeDown', 'mergeIntoPicture', 'mergeShapes', 'bake', 'updateCols', 'updateRows'];
export function lockedOut(project) {
  const words = anyoneInside(project);
  if (words) toast(words);
  return !!words;
}

// What a Pending reads and writes. Its positions come one at a time, and a store write or a canvas read
// per position won't do, so reads come from a tile kept for the batch and writes gather: take() hands
// them over, and starts the next batch. Reads go through readCell and readTile, so they follow _baseline.
function screenOf(project) {
  let cells = new Map(), runs = [], tiles = new Map(), last = null;
  const tileAt = (x, y) => {
    const tx = x - x % TILE, ty = y - y % TILE;
    if (last?.x === tx && last.y === ty) return last;
    const name = `${tx},${ty}`;
    last = tiles.get(name);
    if (!last) tiles.set(name, last = { x: tx, y: ty, data: project.readTile(tx, ty) });
    return last;
  };
  const indexIn = (tile, x, y) => ((y - tile.y) * TILE + x - tile.x) * 4;
  return {
    read(at) {
      if (typeof at === 'string') return cells.has(at) ? cells.get(at) : project.readCell(at) ?? null;
      const tile = tileAt(at[0], at[1]);
      return pack(tile.data, indexIn(tile, at[0], at[1]));
    },
    write(at, value) {
      if (typeof at === 'string') {
        cells.set(at, value);
        return;
      }
      const [x, y] = at, tile = tileAt(x, y), i = indexIn(tile, x, y);
      tile.data.set([value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], i);
      const run = runs.at(-1);
      if (run && run[1] === y && run[0] + run[2] === x && run[3] === value) run[2]++;
      else runs.push([x, y, 1, value]);
    },
    take() {
      const taken = { cells: [...cells], runs };
      cells = new Map();
      runs = [];
      tiles = new Map();
      last = null;
      return taken;
    },
  };
}

// fn at the next frame or after HIDDEN_TAB_MS, whichever's first; gives back what cancels it.
function atNextFrame(fn) {
  const cancel = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
  const run = () => {
    cancel();
    fn();
  };
  const frame = requestAnimationFrame(run), timer = setTimeout(run, HIDDEN_TAB_MS);
  return cancel;
}

// A project for a check that didn't match. Asked again after a long wait, as a host whose packing failed or
// whose chunks were bad says nothing, and it sends a number one check: no later check would come to prompt it.
export function askForProject(sharing) {
  sharing.asked = true;
  if (!sharing.opening) sharing.send({ t: 'artist-hello', has: -1, epoch: sharing.epoch });
  clearTimeout(sharing.askAgain);
  sharing.askAgain = setTimeout(() => askForProject(sharing), ASK_AGAIN_MS);
}

export function stopAsking(sharing) {
  clearTimeout(sharing.askAgain);
  sharing.asked = false;
}

export const flushSoon = (project, sharing) => {
  sharing.cancelFlush ??= atNextFrame(() => {
    sharing.cancelFlush = null;
    project.flushHeard();
  });
};

// An artist's side of sharing. n, tail and epoch: where it's up to, for one already on this document.
export function artistSharing(project, { send, me, sum, n = 0, tail = new Tail(), epoch = null }) {
  const screen = screenOf(project);
  const pending = new Pending({ me, read: screen.read, write: screen.write, n, tail });
  pending.seedSum(sum);
  return {
    send, role: 'artist', me, held: null, takenBack: null, strokesAsked: [], timer: setInterval(() => project.sendSlice(), SLICE_MS),
    heard: [], heardCells: new Map(), heardRuns: [], cancelFlush: null,
    // The project's epoch; a project being opened; one asked for that hasn't landed, and when to ask again.
    epoch, opening: false, asked: false, askAgain: null,
    screen, pending,
  };
}

// What an artist can make on this document (readChange).
export const boundsOf = ({ cols, rows, paintLayer }) => ({ cols, rows: charRowsOf(rows), layerWidth: paintLayer.canvas.width, layerHeight: paintLayer.canvas.height });

// Whether a number's message can be taken as heard, from a host or an artist: a stranger, either way.
export function readsAsHeard(project, message) {
  if (message?.t === 'settings') return !!settingsFromStranger(message.values);
  if (message?.t === 'base') {
    return !!readChange({ stroke: 'base', cells: [], runs: message.runs }, boundsOf({ cols: 0, rows: 0, paintLayer: project.baseLayer }))
      && !!message.records && typeof message.records === 'object';
  }
  return !!readChange(message, boundsOf(project));
}

// What the open stroke's cells have changed since its last slice.
function changedCells(stroke, now) {
  if (stroke.noted?.map !== now) return cellChanges(stroke.editCells, now);
  const changes = [];
  for (const key of stroke.noted.keys) {
    const entry = now.get(key) ?? null;
    if ((stroke.editCells.get(key) ?? null) !== entry) changes.push([key, entry]);
  }
  return changes;
}

export const sharingActions = {
  // me: the person's id. What's open was drawn alone, and goes in as that. A host keeps its undo, under its
  // own name now; an artist's document is the room's, and what it undid alone means nothing to the host.
  // sendDocument, a host's: send every artist the project.
  // roomId, a host's: where keepLedger keeps its ledger.
  // hold and release, a host's: artists' changes wait, and go on being numbered (Into the image reads, then encodes).
  startSharing({ send, role, me, sendDocument, roomId = null, hold, release }) {
    this.stopSharing();
    this.commitPending();
    this.ensureLayer();
    this.setAnimate(false);
    this.history.dropThrough((entry) => entry.frameOp); // frames never travel, so nothing here can bring one back
    const sum = this.editLayerSum();
    let sharing;
    if (role === 'host') {
      sharing = { send, sendDocument, hold, release, role, me, roomId, timer: setInterval(() => this.sendSlice(), SLICE_MS), heardCells: new Map(), heardRuns: [], heard: [], cancelFlush: null, held: null };
      this._ledger.epoch ??= randomId();
      this._ledger.rename(this._by, me);
      this._ledger.startNumbering({ sum });
    } else {
      this.clearHistory();
      sharing = artistSharing(this, { send, me, sum });
    }
    this._by = me;
    this._sharing = markRaw(sharing);
    this._ledger.setLimits(true);
  },

  // The document stays as it is. A host's undo carries on; an artist's document becomes an ordinary one.
  stopSharing() {
    const sharing = this._sharing;
    if (!sharing) return;
    this.commitPending();
    clearInterval(sharing.timer);
    clearTimeout(sharing.heldTimer);
    stopAsking(sharing);
    this._sharing = null;
    this._paused = false;
    this._ledger.setLimits(false);
    if (sharing.role === 'host') {
      this._ledger.stopNumbering();
    } else {
      this.clearHistory();
      this._by = ALONE;
    }
  },

  // Off while there's no host to number anything: what's open goes out first.
  setPaused(on) {
    if (on) this.commitPending();
    this._paused = on;
  },

  // What's changed since the last slice goes out. Also how anyone's stroke gets to the ledger at all, so
  // commitEdit calls it alone as well.
  // Inside an art layer, what's drawn in it goes as the layer (commitArt), never as cells or paint: those stay the
  // stroke's own until it's committed.
  sendSlice() {
    const stroke = this._stroke;
    if (!stroke) return;
    const inside = !!this._artInside;
    const tiles = inside ? [] : this.paintLayer?.strokeSlice() ?? [];
    const own = inside ? [] : changedCells(stroke, this.editCells), cells = [...own, ...cellChanges(stroke.shapes, this.shapes)];
    const baseline = markRaw({ cells: stroke.editCells, shapes: stroke.shapes, tiles: new Map(tiles.map(({ x, y, before }) => [`${x},${y}`, before])) });
    stroke.wroteCells ||= stroke.editCells !== this.editCells || stroke.shapes !== this.shapes;
    if (!inside) {
      stroke.editCells = this.editCells;
      stroke.noted = null;
    }
    stroke.shapes = this.shapes;
    const runs = tiles.flatMap(({ x, y, before, after }) => {
      if (!this._sharing) return pixelRuns(before.data, after.data, after.width, after.height, x, y, exactly);
      const changed = pixelRuns(before.data, after.data, after.width, after.height, x, y);
      keepBaseline(before.data, after.data);
      return changed;
    });
    if (!cells.length && !runs.length) { // only base pixels or pins, or a float landing on what's already there
      if (stroke.hold && this._sharing?.pending && this._sharing.held?.stroke !== stroke.id) {
        this.sendHeld();
        this._sharing.held = { stroke: stroke.id, parts: [] }; // nothing's gone out, so its run goes on
      }
      return;
    }
    for (const [key] of own) stroke.keys.push(key); // the cells it's rebuilt over (commitEdit), not its shapes'
    // Every cell it's changed, edit cell or paint: the mode it drew in goes with them (commitEdit).
    stroke.cells ??= new Set();
    for (const [key] of own) stroke.cells.add(key);
    const k = this.paintLayer.scale; // runs are the layer's pixels, k to a grid pixel
    for (const [x, y, length] of runs) for (let i = 0; i < length; i++) stroke.cells.add(`${Math.floor((x + i) / k)},${Math.floor(y / k) >> 1}`);
    stroke.sent = true;

    const change = { cells, runs }, { pending, screen } = this._sharing ?? {};
    this._baseline = baseline;
    try {
      if (pending) {
        this.sendHeld();
        const parts = splitChange(change, MOST_CHANGE_BYTES);
        for (const part of parts) pending.add(stroke.id, part);
        screen.take(); // only read: what it kept was as of the baseline
        if (stroke.hold) {
          this._sharing.held = { stroke: stroke.id, parts };
          this.sendHeldSoon();
        } else this.sendParts(stroke.id, parts);
      } else {
        this.sendNumbered(this._ledger.submit(this._by, stroke.id, change));
        for (const [key] of cells) this._sharing?.heardCells.delete(key); // numbered after what was waiting there
      }
    } finally {
      this._baseline = null;
    }
  },

  // Changes heard together, in their order, as one write and one refresh. What I've drawn so far goes out
  // first, so an artist's is held in Pending and the open stroke's baseline is what's been sent. Written
  // directly: it isn't an edit of mine, so it can't end a typing run or a float, or be undone by me. It does
  // count as unsaved.
  applyNumbered(...numbered) {
    this.ensureLayer();
    if (!this.paintLayer || !numbered.length) return;
    this.sendSlice();
    const { pending } = this._sharing ?? {};
    const written = pending
      ? this.throughPending((p) => numbered.map((one) => {
        const { applied, echo } = p.heard(one);
        if (!echo && one.by === p.me) this.forgetAsked(one.stroke); // the number of an undo or redo of mine
        return applied;
      }))
      : numbered;
    if (!pending) this.applyChange({ cells: written.flatMap(({ cells }) => cells), runs: written.flatMap(({ runs }) => runs) });
    if (written.some(({ cells, runs }) => cells.length || runs.length)) this.editVersion++;
  },

  // What's waited for its frame goes on the screen. With no layer to write on, an artist's stays waiting,
  // since a number lost is a picture wrong.
  flushHeard() {
    const sharing = this._sharing;
    if (!sharing) return;
    sharing.cancelFlush?.();
    sharing.cancelFlush = null;
    if (sharing.role === 'host') {
      if (!sharing.heardCells.size && !sharing.heardRuns.length) return;
      this.sendSlice(); // mine first: where it's written since, it stays (a slice takes those cells back)
      const cells = [...sharing.heardCells], runs = sharing.heardRuns;
      sharing.heardCells = new Map();
      sharing.heardRuns = [];
      this.applyChange({ cells, runs: [] }, { patches: [[runsPatch(runs), this.paintLayer]] });
      return;
    }
    if (!sharing.heard.length) return;
    this.ensureLayer();
    if (!this.paintLayer) return;
    const heard = sharing.heard;
    sharing.heard = [];
    // A number that won't land costs the picture, not the rest of what's here: the project puts it right.
    const landing = (fn) => {
      try {
        fn();
      } catch (error) {
        console.warn('A change heard couldn\'t be written.', error);
        askForProject(sharing);
      }
    };
    let numbered = [];
    const landNumbered = () => {
      const these = numbered;
      numbered = [];
      landing(() => this.applyNumbered(...these));
    };
    for (const message of heard) {
      if (message.t === 'numbered') {
        numbered.push(message);
        continue;
      }
      landNumbered();
      if (message.t === 'check') {
        this.compareCheck(message);
        continue;
      }
      sharing.pending.n = message.n;
      sharing.pending.tail.add(message);
      landing(() => {
        if (message.t === 'settings') this.applySettings(message.values);
        else this.applyBase(message.runs, deserializeBase(message.records).records);
      });
    }
    landNumbered();
  },

  // Another document: nothing that was waiting belongs on it. A project holds an artist's that it's numbered past.
  dropHeard() {
    const sharing = this._sharing;
    if (!sharing) return;
    sharing.cancelFlush?.();
    Object.assign(sharing, { cancelFlush: null, heard: [], heardCells: new Map(), heardRuns: [] });
  },

  // From the host, so only what a document saves.
  applySettings(values) {
    this.$patch(Object.fromEntries(SAVED_KEYS.filter((key) => key in values && key !== 'cols' && key !== 'rows').map((key) => [key, values[key]])));
  },

  // The base layer's own pixels (runs in its pixels) and its records (baseRecords.js).
  applyBase(runs, records) {
    this.ensureLayer();
    if (!this.baseLayer) return;
    const pins = this.baseRecords.pins;
    this.baseLayer.writeRuns(runs);
    this.setBaseRecords(records);
    if (this._stroke) this._stroke.baseRecords = records;
    this.refreshChanged([[runsPatch(runs), this.baseLayer]], [[pins, records.pins]]);
    this.editVersion++;
  },

  // The Base and Edit toggles an action may go by: an artist's are always the drawing, and inside an art layer, the
  // layer alone.
  layersFor(layers) {
    return this._sharing?.role === 'artist' || this._artInside ? EDIT_ONLY : layers;
  },
};
