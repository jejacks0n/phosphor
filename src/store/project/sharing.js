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
// where what it covers is kept and what's heard goes beneath, but not sent) until the next edit or the
// next commitPending, which placing it is. Others see it land then rather than follow the drag.
//
// A change heard copies the map (22 ms at 500k cells) and refreshes, and several artists at ten slices a
// second would swamp a tab, so what comes in one frame is written together. An artist can just wait: what it
// hears is already late, and Pending is made for that. A host can't, since its ledger is the order: it numbers
// and sends an artist's change at once, and its paint goes on the layer then, but the cells wait in heardCells,
// where the ledger reads them (readCell) and a slice of the host's, numbered after, takes them back.
import { markRaw } from 'vue';
import { deserializeBase, serializeBase } from '@/document/baseRecords.js';
import { parseKey } from '@/document/editCells.js';
import { cellChanges, pixelRuns, splitChange, pack } from '@/document/changes.js';
import { TILE } from '@/document/History.js';
import { MAX_CELLS, MAX_COLS, MAX_LINES, charRowsOf } from '@/lib/Cells.js';
import { Pending } from '@/social/pending.js';
import { MOST_CHANGE_BYTES, packProject, readChange } from '@/social/wire.js';
import { ALONE, SAVED_KEYS, randomId, runsPatch } from '@/store/project/shared.js';

const SLICE_MS = 100;
export const ASK_AGAIN_MS = 30_000;
const LEAST_BASE_RUNS_BYTES = 4096; // of a base message, beside its pins; less and it's the project instead
const HIDDEN_TAB_MS = 100; // a hidden tab has no frames, and still has to catch up
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
function askForProject(sharing) {
  sharing.asked = true;
  if (!sharing.opening) sharing.send({ t: 'artist-hello', has: -1, epoch: sharing.epoch });
  clearTimeout(sharing.askAgain);
  sharing.askAgain = setTimeout(() => askForProject(sharing), ASK_AGAIN_MS);
}

function stopAsking(sharing) {
  clearTimeout(sharing.askAgain);
  sharing.asked = false;
}

const flushSoon = (project, sharing) => {
  sharing.cancelFlush ??= atNextFrame(() => {
    sharing.cancelFlush = null;
    project.flushHeard();
  });
};

// What an artist can make on this document (readChange).
const boundsOf = ({ cols, rows, paintLayer }) => ({ cols, rows: charRowsOf(rows), layerWidth: paintLayer.canvas.width, layerHeight: paintLayer.canvas.height });

// What a project's settings may set: only what a document saves. A host is a stranger, and these are patched
// onto the store.
function settingsFromHost(settings) {
  const taken = Object.fromEntries([...SAVED_KEYS, 'fit', 'paintScale', 'baseScale', 'imageIsWorkingCopy'].filter((key) => key in settings).map((key) => [key, settings[key]]));
  if (!(Number.isInteger(taken.baseScale) && taken.baseScale > 0)) delete taken.baseScale;
  return taken;
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
  startSharing({ send, role, me, sendDocument }) {
    this.stopSharing();
    this.commitPending();
    this.ensureLayer();
    const sum = this.editLayerSum();
    const sharing = {
      send, sendDocument, role, me, held: null, takenBack: null, timer: setInterval(() => this.sendSlice(), SLICE_MS),
      heard: [], heardCells: new Map(), heardRuns: [], cancelFlush: null,
      // An artist's: the project's epoch; a project being opened; one asked for that hasn't landed, and when to
      // ask again.
      epoch: null, opening: false, asked: false, askAgain: null,
    };
    if (role === 'host') {
      this._ledger.epoch ??= randomId();
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
    if (!cells.length && !runs.length) { // only base pixels or pins, or a float landing on what's already there
      if (stroke.hold && this._sharing?.pending && this._sharing.held?.stroke !== stroke.id) {
        this.sendHeld();
        this._sharing.held = { stroke: stroke.id, parts: [] }; // nothing's gone out, so its run goes on
      }
      return;
    }
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
        for (const [key] of cells) this._sharing?.heardCells.delete(key); // numbered after what was waiting there
      }
    } finally {
      this._baseline = null;
    }
  },

  sendParts(stroke, parts) {
    for (const part of parts) this._sharing.send({ t: 'change', stroke, ...part });
  },

  // A float left where it is goes out. One with nothing to send stays: its run can still go on.
  sendHeld() {
    const held = this._sharing?.held;
    if (!held?.parts.length) return;
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
      ? this.throughPending((p) => numbered.map((one) => p.heard(one).applied))
      : numbered;
    if (!pending) this.applyChange({ cells: written.flatMap(({ cells }) => cells), runs: written.flatMap(({ runs }) => runs) });
    if (written.some(({ cells, runs }) => cells.length || runs.length)) this.editVersion++;
  },

  // An artist's message from the host, for the next frame. Off this document (a host is a stranger) it's
  // ignored; the check notices what that costs.
  hearDrawing(message) {
    const sharing = this._sharing;
    if (!sharing?.pending || !this.paintLayer) return;
    const fits = message.t === 'check' ? true
      : message.t === 'settings' ? message.values && typeof message.values === 'object'
        : readChange(message.t === 'base' ? { stroke: 'base', cells: [], runs: message.runs } : message, boundsOf(message.t === 'base' ? { cols: 0, rows: 0, paintLayer: this.baseLayer } : this));
    if (!fits) return;
    sharing.heard.push(message);
    flushSoon(this, sharing);
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
    let numbered = [];
    for (const message of heard) {
      if (message.t === 'numbered') {
        numbered.push(message);
        continue;
      }
      this.applyNumbered(...numbered);
      numbered = [];
      if (message.t === 'check') {
        this.compareCheck(message);
        continue;
      }
      sharing.pending.n = message.n;
      sharing.pending.tail.add(message);
      if (message.t === 'settings') this.applySettings(message.values);
      else this.applyBase(message.runs, deserializeBase(message.records).records);
    }
    this.applyNumbered(...numbered);
  },

  // A check heard in its place among the numbers, so what came before it has landed and Pending's sum is the
  // agreed one as of what's been heard. Only at the same number does that say anything, whatever's waiting
  // behind it. A mismatch asks for the project once, until one lands (or the connection's new, or a long wait
  // passes). The sum follows numbers, so it only sees drift at a position a number has since touched, or a
  // number that never landed once another follows: anything else stays unseen, by design, as nothing rescans.
  compareCheck({ n, sum }) {
    const sharing = this._sharing, { pending } = sharing;
    if (sharing.asked || sharing.opening || this._paused || pending.n !== n || pending.sum === sum) return;
    askForProject(sharing);
  },

  // A host is back and has said all it numbered of mine (what it had, in a project or a tail). What's still
  // unechoed never reached it, so it goes now, oldest first, on this connection. A float still held is in
  // Pending but never left: it goes when it's placed (sendHeld), as it would have.
  resendPending() {
    const sharing = this._sharing;
    if (!sharing?.pending) return;
    stopAsking(sharing);
    const changes = sharing.pending.resend(), held = sharing.held?.parts.length ?? 0;
    for (const { stroke, cells, runs } of held ? changes.slice(0, -held) : changes) sharing.send({ t: 'change', stroke, cells, runs });
  },

  // A hello on a new connection, with drawing paused until it's answered: a host whose project is bad, or who says
  // nothing, doesn't leave it paused for good. No check will come to prompt this, as none is looked at while paused.
  waitForAnswer() {
    const sharing = this._sharing;
    if (!sharing?.pending) return;
    clearTimeout(sharing.askAgain);
    sharing.askAgain = setTimeout(() => askForProject(sharing), ASK_AGAIN_MS);
  },

  // Out of the room with what's agreed (commitPending lands what's been heard): what never got a number goes, and
  // the document's left as the host had it.
  dropWaiting() {
    this.commitPending();
    if (this._sharing?.pending?.size) this.throughPending((pending) => pending.dropAll());
  },

  // What's waiting for a number, a box in grid pixels for each stroke, for the screen to mark while paused.
  waitingBoxes() {
    const { pending } = this._sharing ?? {};
    if (!pending) return [];
    const boxes = new Map(), scale = this.paintLayer?.scale ?? 1;
    const grow = (stroke, x0, y0, x1, y1) => {
      const box = boxes.get(stroke);
      boxes.set(stroke, box ? { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) } : { x0, y0, x1, y1 });
    };
    for (const { stroke, cells, runs } of pending.waiting) {
      for (const [key] of cells) {
        const { col, row } = parseKey(key);
        grow(stroke, col, row * 2, col + 1, row * 2 + 2);
      }
      for (const [x, y, length] of runs) grow(stroke, x / scale, y / scale, (x + length) / scale, (y + 1) / scale);
    }
    return [...boxes.values()];
  },

  // A new connection to the host: an ask on the last one went with it, and the host counts `took` afresh.
  newConnection() {
    const sharing = this._sharing;
    if (!sharing?.pending) return;
    stopAsking(sharing);
    sharing.pending.newConnection();
  },

  // Another document: nothing that was waiting belongs on it. A project holds an artist's that it's numbered past.
  dropHeard() {
    const sharing = this._sharing;
    if (!sharing) return;
    sharing.cancelFlush?.();
    Object.assign(sharing, { cancelFlush: null, heard: [], heardCells: new Map(), heardRuns: [] });
  },

  // An artist's change, undo or redo reaching the host, in the order they're heard. Null when it can't be
  // taken: a change for the room to answer, an undo or redo for it to say nothing about. Otherwise it's numbered and
  // sent, and it's what was numbered that comes back. My open stroke's slice goes first, or the ledger would
  // read my unsent paint as what's beneath theirs.
  takeFromArtist(by, message) {
    const sharing = this._sharing;
    if (sharing?.role !== 'host' || !this.paintLayer) return null;
    const change = message.t === 'change' ? readChange(message, boundsOf(this)) : message;
    if (!change) return null;
    this.sendSlice();
    const numbered = change.t === 'undo' ? this._ledger.undo(by, change.stroke)
      : change.t === 'redo' ? this._ledger.redo(by, change.stroke)
        : this._ledger.submit(by, change.stroke, change);
    if (!numbered) return null;
    this.paintLayer.writeRuns(numbered.runs);
    this.hasPaint = this.paintLayer.hasPaint;
    for (const [key, entry] of numbered.cells) sharing.heardCells.set(key, entry ?? null);
    for (const run of numbered.runs) sharing.heardRuns.push(run);
    if (numbered.cells.length || numbered.runs.length) this.editVersion++;
    flushSoon(this, sharing);
    this.sendNumbered(numbered);
    return numbered;
  },

  // The document for a project message (wire.js), with everything numbered up to n in it and nothing after.
  projectNow() {
    this.sendSlice();
    this.flushHeard();
    const { n, epoch } = this._ledger, { imageBuffer } = this;
    const parts = this.projectParts(); // read now, whatever it waits for
    return { n, epoch, chunks: parts.then((rest) => packProject({ imageBuffer, ...rest })) };
  },

  // A host's change to the base, numbered and kept like any change: what a stroke's patch did, or undoing it
  // what it undid, and the pins as they are now. It's split as a change is, each part with the pins and
  // fitting a message. Pins too many to fit one go as the project; its number isn't in the tail, so a reconnect
  // gets the project too. It doesn't replace the document, so the host's undo and the epoch stay.
  sendBase(patch, side) {
    if (this._sharing?.role !== 'host') return;
    const runs = (patch?.tiles ?? []).flatMap(({ x, y, before, after }) => (side === 'after'
      ? pixelRuns(before.data, after.data, after.width, after.height, x, y)
      : pixelRuns(after.data, before.data, after.width, after.height, x, y)));
    const records = serializeBase(this.baseRecords) ?? { pins: [] };
    const room = MOST_CHANGE_BYTES - JSON.stringify(records).length;
    if (room < LEAST_BASE_RUNS_BYTES) {
      this._ledger.note();
      this._sharing.sendDocument?.();
      return;
    }
    for (const part of runs.length ? splitChange({ cells: [], runs }, room) : [{ runs }]) {
      const message = { t: 'base', n: this._ledger.note(), runs: part.runs, records };
      this._ledger.tail.add(message);
      this._sharing.send(message);
    }
  },

  // The picture's been replaced for good (a merge, Bake, Into the image, the grid resized): positions don't
  // mean what they did, so no one's undo reaches past this, and everyone gets the document in a new epoch.
  shareWholeDocument() {
    const { sendDocument } = this._sharing;
    this.ensureLayer();
    this.sendSlice(); // an open stroke numbered now: its next slice starts from what the scan below counted
    this.flushHeard();
    this.clearHistory();
    this._ledger.reset({ epoch: randomId(), sum: this.editLayerSum() });
    this._ledger.note();
    sendDocument?.();
  },

  // A host's settings to the room, numbered and kept like any change.
  sendSettings() {
    const message = { t: 'settings', n: this._ledger.note(), values: Object.fromEntries(SAVED_KEYS.map((key) => [key, this[key]])) };
    this._ledger.tail.add(message);
    this._sharing.send(message);
  },

  // The project an artist was sent, from a stranger: only what could be a document's, kept past the grid as
  // a host's may be, and false with nothing changed for what isn't. The first is under a new documentId, so
  // what was open stays in the autosave list, and starts the sharing; one after that is the same document.
  // Its sum is what the scan says and what was mine and unnumbered goes back on top (in that order, as reapply
  // reads what's beneath), less what the host had handled by then (took), which it holds or refused. An open
  // stroke has gone out by then: openFromHost commits it, so no baseline moves past what's unsent. Numbers it
  // holds are gone with what was waiting; the room's Watch sees to any later. In the epoch I have, it's the same
  // document brought up to date: History only asks the host by stroke id, and the host still has those strokes,
  // so undo and the selection stay. A new epoch means the positions don't mean what they did, so both go.
  // documentId: what a reload had open as this art, so it's the one document in the autosave list.
  async takeProject(parts, { n, epoch = null, took = 0, filename, send, me, documentId }) {
    const cells = [...parts.editCells];
    if (cells.length > MAX_CELLS || !readChange({ stroke: 'project', cells, runs: [] }, { cols: MAX_COLS, rows: MAX_LINES })) return false;
    const opening = this._sharing;
    if (opening) opening.opening = true; // no check says anything while this opens
    try {
      await this.openFromHost(
        { ...parts, settings: settingsFromHost(parts.settings), erasedCells: [], migrated: false },
        { filename, documentId: opening ? this.documentId : documentId, sameDocument: !!opening && epoch !== null && opening.epoch === epoch },
      );
    } catch (error) {
      console.warn('The room\'s art couldn\'t be opened.', error);
      if (!this.image) this.stopSharing();
      return false;
    } finally {
      if (opening) opening.opening = false;
    }
    const sharing = this._sharing;
    if (sharing) {
      this.ensureLayer();
      sharing.screen.take();
      const sum = this.editLayerSum();
      this.throughPending((pending) => {
        pending.seedSum(sum);
        pending.dropTaken(took);
        pending.reapply();
      });
    } else {
      this.startSharing({ send, role: 'artist', me });
    }
    stopAsking(this._sharing);
    this._sharing.epoch = epoch;
    this._sharing.pending.n = n;
    return true;
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
