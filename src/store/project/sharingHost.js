// A host's side of sharing: keeping the ledger, numbering what artists send, and what it shares of its own.
import { serializeBase } from '@/document/baseRecords.js';
import { exactly, pixelRuns, splitChange } from '@/document/changes.js';
import { keepRoomLedger } from '@/document/autosaveStore.js';
import { MOST_CHANGE_BYTES, packProject, readChange } from '@/social/wire.js';
import { SAVED_KEYS, randomId } from '@/store/project/shared.js';
import { boundsOf, flushSoon } from '@/store/project/sharing.js';
import { MOST_SHAPES, isShapeKey } from '@/document/shapes.js';

const LEAST_BASE_RUNS_BYTES = 4096; // of a base message, beside its pins; less and it's the project instead

// Whether an artist's change would leave the drawing with more shapes than it holds: the store's, with what's
// been heard and not yet written, and then the change's.
function tooManyShapes(project, cells) {
  const heard = project._sharing.heardCells, after = new Map();
  let size = project.shapes.size;
  for (const [key, value] of heard) if (isShapeKey(key) && (value !== null) !== project.shapes.has(key)) size += value !== null ? 1 : -1;
  const has = (key) => (after.has(key) ? after.get(key) : heard.has(key) ? heard.get(key) !== null : project.shapes.has(key));
  for (const [key, value] of cells) {
    if (!isShapeKey(key) || has(key) === (value !== null)) continue;
    size += value !== null ? 1 : -1;
    after.set(key, value !== null);
  }
  return size > MOST_SHAPES;
}

export const sharingHostActions = {
  // The ledger as it is, written for this host's next reload, unless it's what was written last. Autosave calls
  // this after each write of the document, so what's kept is never behind that.
  // ponytail: a whole copy per write (in the 10 s, while anything changes, and at autosave's), up to the stacks' 64 MB; write what changed if it hitches.
  async keepLedger() {
    const sharing = this._sharing, ledger = this._ledger;
    if (sharing?.role !== 'host' || !sharing.roomId || sharing.keeping || sharing.keptN === ledger.n) return;
    sharing.keeping = true;
    try {
      await keepRoomLedger(sharing.roomId, this.documentId, () => {
        sharing.keptN = ledger.n;
        return ledger.kept();
      });
    } catch (error) {
      console.warn('The room\'s undo couldn\'t be kept for a reload.', error);
    } finally {
      sharing.keeping = false;
    }
  },

  // The number the document stands at, for autosave to write with it: what a host has numbered is on it first.
  documentNumber() {
    if (this._sharing?.role === 'host') {
      this.sendSlice();
      this.flushHeard();
    }
    return this._ledger.n;
  },

  // A host's number goes to the room, a piece at a time if it's too big for a message.
  sendNumbered(numbered) {
    if (!numbered || this._sharing?.role !== 'host') return;
    for (const { n, by, stroke, cells, runs } of numbered.parts ?? [numbered]) this._sharing.send({ t: 'numbered', n, by, stroke, cells, runs });
  },

  // An artist's change, undo or redo reaching the host, in the order they're heard. Null when it can't be
  // taken, for the room to answer (hosting.js). Otherwise it's numbered and
  // sent, and it's what was numbered that comes back. My open stroke's slice goes first, or the ledger would
  // read my unsent paint as what's beneath theirs.
  takeFromArtist(by, message) {
    const sharing = this._sharing;
    if (sharing?.role !== 'host' || !this.paintLayer) return null;
    const change = message.t === 'change' ? readChange(message, boundsOf(this)) : message;
    if (!change || (change.cells && tooManyShapes(this, change.cells))) return null;
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
  // gets the project too. It doesn't replace the document, so the host's undo and the epoch stay. Compared exactly:
  // no other browser writes to the base, so any difference is a change.
  sendBase(patch, side) {
    if (this._sharing?.role !== 'host') return;
    const runs = (patch?.tiles ?? []).flatMap(({ x, y, before, after }) => (side === 'after'
      ? pixelRuns(before.data, after.data, after.width, after.height, x, y, exactly)
      : pixelRuns(after.data, before.data, after.width, after.height, x, y, exactly)));
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
};
