// The document shared with a room: an edit goes out as it happens, a change heard is written, and undo
// asks the host. Owns _sharing ({ send(message), role, me } and, for an artist, its Pending, what that reads
// and writes through, and what's held), _paused, and _floating (a float's move is being made).
//
// A stroke goes out in slices: what's changed since the last one, every 100 ms and at commitEdit, under
// the stroke's id. For a host, and for anyone alone, a slice goes in the ledger; a host also sends what
// it's numbered. For an artist it goes in Pending and is sent, to come back with its number. After a slice
// the open stroke's baseline (_stroke.editCells, the paint stroke's saved tiles) is what was sent, so a change
// heard mid-stroke, written after sending what's there and to the baseline as well, is never part of it.
//
// An artist's undo goes to the host and nothing moves until the number comes back. A float's moves can't
// wait for that: each takes the last back at once. So an artist holds a float's change at home (in Pending,
// where what it covers is kept and what's heard goes beneath, but not sent) until the next edit or the
// next commitPending, which placing it is. Others see it land then rather than follow the drag.
import { markRaw } from 'vue';
import { cellChanges, pixelRuns, splitChange, pack } from '@/document/changes.js';
import { TILE } from '@/document/History.js';
import { Pending } from '@/social/pending.js';
import { MOST_CHANGE_BYTES } from '@/social/wire.js';
import { ALONE, SAVED_KEYS, runsPatch } from '@/store/project/shared.js';

const SLICE_MS = 100;
const EDIT_ONLY = { base: false, edit: true };

// Refused while paused: everything that changes the drawing. changeSelection isn't here: it's not a change
// to the document, and Deselect goes on working.
export const DRAWING_ACTIONS = [
  'paintEditPixels', 'paintStroke', 'eraseEditPixels', 'editCell', 'typeAt', 'writeAt', 'backspaceAt', 'deleteAt', 'typing', 'shiftCells',
  'writeEditCells', 'clearEditCells', 'flipCell', 'flipPaint', 'clearEditLayer',
  'deleteSelection', 'pasteSelection', 'stampSelection', 'floatSelection', 'turnSelection', 'deleteInWand', 'recolorSelection', 'moveSelection',
  'deleteIn', 'pasteAt', 'pasteBase', 'selectionEdit',
  'undo', 'redo',
];

// Refused for artists: the picture, the settings, the grid and which document this is.
export const HOST_ONLY_ACTIONS = [
  'eraseBase', 'eraseBasePixels', 'flipBase', 'writeBase', 'pasteBase',
  'bake', 'mergeUp', 'mergeCellOf', 'mergeDown', 'mergeIntoPicture', 'clearEditLayer',
  'setSlider', 'commitSliders', 'resetSliders', 'resetGroup', 'randomizeSeed',
  'updateCols', 'updateRows',
  'setImageFromFile', 'setBlankCanvas', 'replaceImage', 'newDocument', 'clearImage', 'loadProject', 'restoreDocument', 'openParts',
];

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
  startSharing({ send, role, me }) {
    this.commitPending();
    this.ensureLayer();
    const sum = this.editLayerSum();
    const sharing = { send, role, me, held: null, takenBack: null, timer: setInterval(() => this.sendSlice(), SLICE_MS) };
    if (role === 'host') {
      this._ledger.rename(this._by, me);
      this._ledger.startNumbering({ sum });
    } else {
      this.clearHistory();
      sharing.screen = screenOf(this);
      sharing.pending = new Pending({ me, read: sharing.screen.read, write: sharing.screen.write });
      sharing.pending.seedSum(sum);
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
  sendSlice() {
    const stroke = this._stroke;
    if (!stroke) return;
    const tiles = this.paintLayer?.strokeSlice() ?? [];
    const cells = changedCells(stroke, this.editCells);
    const baseline = markRaw({ cells: stroke.editCells, tiles: new Map(tiles.map(({ x, y, before }) => [`${x},${y}`, before])) });
    stroke.wroteCells ||= stroke.editCells !== this.editCells;
    stroke.editCells = this.editCells;
    stroke.noted = null;
    const runs = tiles.flatMap(({ x, y, before, after }) => pixelRuns(before.data, after.data, after.width, after.height, x, y));
    if (!cells.length && !runs.length) return; // only base pixels or pins: nothing for the ledger
    for (const [key] of cells) stroke.keys.push(key);
    stroke.sent = true;

    const change = { cells, runs }, { pending, screen } = this._sharing ?? {};
    this._baseline = baseline;
    try {
      if (pending) {
        this.sendHeld();
        const parts = splitChange(change, MOST_CHANGE_BYTES);
        for (const part of parts) pending.add(stroke.id, part);
        screen.take(); // only read: what it kept was as of the baseline
        if (stroke.hold) this._sharing.held = { stroke: stroke.id, parts };
        else this.sendParts(stroke.id, parts);
      } else {
        this.sendNumbered(this._ledger.submit(this._by, stroke.id, change));
      }
    } finally {
      this._baseline = null;
    }
  },

  sendParts(stroke, parts) {
    for (const part of parts) this._sharing.send({ t: 'change', stroke, ...part });
  },

  // A float left where it is goes out.
  sendHeld() {
    const held = this._sharing?.held;
    if (!held) return;
    this._sharing.held = null;
    this.sendParts(held.stroke, held.parts);
  },

  // A host's number goes to the room, a piece at a time if it's too big for a message.
  sendNumbered(numbered) {
    if (!numbered || this._sharing?.role !== 'host') return;
    for (const { n, by, stroke, cells, runs } of numbered.parts ?? [numbered]) this._sharing.send({ t: 'numbered', n, by, stroke, cells, runs });
  },

  // An artist's undo or redo goes to the host, except of a float's change that never left: that's between
  // this browser and Pending, for undo and for a redo of it.
  askForStroke(kind, stroke) {
    const sharing = this._sharing, { held, takenBack } = sharing;
    if (kind === 'undo' && held?.stroke === stroke) {
      sharing.held = null;
      sharing.takenBack = held;
      this.throughPending((pending) => held.parts.forEach(() => pending.retract()));
    } else if (kind === 'redo' && takenBack?.stroke === stroke) {
      sharing.takenBack = null;
      this.sendHeld();
      for (const part of takenBack.parts) {
        sharing.pending.add(stroke, part);
        sharing.screen.take();
        this.applyChange(part);
      }
      this.sendParts(stroke, takenBack.parts);
    } else {
      sharing.send({ t: kind, stroke });
    }
  },

  // fn(pending), then one write and one refresh for what it wrote, however many positions that was. For
  // what's in Pending that writes: heard, retract, and in time reapply and dropAll.
  throughPending(fn) {
    const { pending, screen } = this._sharing;
    const result = fn(pending);
    this.applyChange(screen.take());
    return result;
  },

  // A change heard. What I've drawn so far goes out first, so an artist's is held in Pending and the open
  // stroke's baseline is what's been sent. A host's room must call sendSlice before it submits someone's
  // change, or the ledger reads my unsent paint as what was beneath theirs. Written directly: it isn't an
  // edit of mine, so it can't end a typing run or a float, or be undone by me. It does count as unsaved.
  applyNumbered(numbered) {
    this.ensureLayer();
    if (!this.paintLayer) return;
    this.sendSlice();
    const { pending } = this._sharing ?? {};
    const written = pending ? this.throughPending((p) => p.heard(numbered)).applied : numbered;
    if (!pending) this.applyChange(written);
    if (written.cells.length || written.runs.length) this.editVersion++;
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

  // The Base and Edit toggles an action may go by: an artist's are always the drawing.
  layersFor(layers) {
    return this._sharing?.role === 'artist' ? EDIT_ONLY : layers;
  },
};
