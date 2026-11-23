// The numbering moving between people: a host's reload, a handover, a new host, and asking an artist who's ahead.
import { markRaw } from 'vue';
import { deserializeBase } from '@/document/baseRecords.js';
import { Tail } from '@/document/changes.js';
import { keyLayer } from '@/document/layerInfo.js';
import { Ledger, keptForWire, keptFromWire } from '@/document/ledger.js';
import { MOST_CHANGE_BYTES, MOST_PROJECT_BYTES, cellsFitAnyGrid, packProject, packValue, readLayers, unpackValue } from '@/social/wire.js';
import { settingsFromStranger } from '@/store/settings.js';
import { cellsFit, stackKinds } from '@/store/project/shared.js';
import { artistSharing, boundsOf, readsAsHeard, stopAsking } from '@/store/project/sharing.js';

export const handoverActions = {
  // Back from a reload as host, before sharing starts, with what keepLedger last wrote (or null): the stacks as
  // they were, and the document brought up to them by the tail. True then. If the tail can't reach back to what
  // the document holds, the numbers go back to what the document is known to hold, with stacks empty: an artist
  // ahead of that is who to ask (DrawingStore). False then.
  restoreLedger(row, me) {
    const documentN = this._documentN;
    const fits = row?.documentId === this.documentId;
    const ledger = fits ? Ledger.restore(row.kept, { readCell: (key) => this.readCell(key), reader: () => this.cellReader(), readTile: (x, y, id) => this.readTile(x, y, id), mostBytes: MOST_CHANGE_BYTES }) : this._ledger;
    const items = fits && documentN !== null ? ledger.tail.since(documentN) : null;
    if (items && (documentN === ledger.n || items.at(-1)?.n === ledger.n)) {
      this._ledger = markRaw(ledger);
      this.replayOnPicture(items);
      for (const id of ledger.strokesBy(me)) this.pushKeptStroke(id);
      return true;
    }
    ledger.reset();
    ledger.n = documentN ?? -1;
    this._ledger = markRaw(ledger);
    return false;
  },

  // Numbered changes as they land on the picture, and nowhere else.
  replayOnPicture(items) {
    this.ensureLayer();
    let batch = { cells: [], runs: [] };
    const land = () => {
      if (batch.cells.length || batch.runs.length) this.applyChange(batch);
      batch = { cells: [], runs: [] };
    };
    for (const item of items) {
      if (item.t === 'settings') {
        land();
        this.applySettings(item.values);
      } else if (item.t === 'layers') {
        land();
        this.applyLayers(item);
      } else if (item.t === 'base') {
        land();
        this.applyBase(item.runs, deserializeBase(item.records).records);
      } else {
        batch.cells.push(...item.cells);
        batch.runs.push(...item.runs);
      }
    }
    land();
    if (items.length) this.editVersion++;
  },

  // A host's hand-over: the ledger, packed. Everything it's numbered is in it.
  keptForHandOver() {
    this.flushHeard();
    return packValue(keptForWire(this._ledger.kept()));
  },

  // The same on the other side, or null for anything that isn't one: an old host is a stranger, and what's in
  // these stacks can reach the picture. Its cells and tiles are on layers above the bottom of my stack as what I've heard
  // leaves it, as a change's are.
  async readHandOver(chunks) {
    try {
      const plain = await unpackValue(chunks, { mostBytes: MOST_PROJECT_BYTES });
      this.ensureLayer();
      const { layerWidth: width, layerHeight: height } = boundsOf(this), layers = stackKinds(this._sharing?.heardStack ?? this.layers);
      const kept = keptFromWire(plain, { width, height });
      const paints = (id) => layers.get(id) === 'cells';
      for (const { cells, paint } of kept.stacks.strokes.values()) {
        if (!cellsFitAnyGrid([...cells], layers) || ![...paint.keys()].every((name) => paints(keyLayer(name).id))) return null;
      }
      for (const [key, { base }] of kept.stacks.cells) if (!cellsFitAnyGrid([[key, base]], layers)) return null;
      for (const { id } of kept.stacks.tiles.values()) if (!paints(id)) return null;
      return kept;
    } catch {
      return null;
    }
  },

  // An artist's sharing ends, as this person is to be the host: what's open goes in, what was never numbered comes
  // off the screen and back (for numberWaiting), and what it knew of the numbers comes back too. Null if not an artist.
  leavePending() {
    const sharing = this._sharing;
    if (!sharing?.pending) return null;
    this.commitPending();
    const waiting = sharing.pending.waiting;
    this.throughPending((pending) => pending.dropAll());
    clearInterval(sharing.timer);
    clearTimeout(sharing.heldTimer);
    stopAsking(sharing);
    sharing.cancelFlush?.();
    this._sharing = null;
    this._paused = false;
    return { n: sharing.pending.n, epoch: sharing.epoch, tail: sharing.pending.tail, waiting };
  },

  // The ledger of a new host, before it starts sharing: the old host's (kept), with my own tail, if it's for the number
  // I've heard to, and undo stays with it: true. Otherwise the numbering carries on from left (leavePending) and undo
  // starts over: false. With no left, this person knows no number at all, and an artist who does is asked (DrawingStore).
  takeLedger(kept, left) {
    if (kept && left && kept.n === left.n && kept.epoch === left.epoch) {
      try {
        const ledger = Ledger.restore({ ...kept, tail: [] }, { readCell: (key) => this.readCell(key), reader: () => this.cellReader(), readTile: (x, y, id) => this.readTile(x, y, id), mostBytes: MOST_CHANGE_BYTES });
        ledger.tail = left.tail;
        this._ledger = markRaw(ledger);
        return true;
      } catch (error) {
        console.warn('The old host\'s undo couldn\'t be taken.', error);
      }
    }
    this.clearHistory();
    Object.assign(this._ledger, { n: left?.n ?? -1, epoch: left?.epoch ?? null, tail: left?.tail ?? new Tail() });
    return false;
  },

  // A new host's own strokes that never got a number are its first changes.
  numberWaiting(waiting) {
    for (const { stroke, cells, runs } of waiting) {
      const numbered = this._ledger.submit(this._by, stroke, { cells, runs });
      if (!numbered) continue;
      this.applyChange({ cells, runs });
      this.sendNumbered(numbered);
      this.editVersion++;
    }
  },

  // The former host, on as an artist with the document as it is: its undo stays, and now asks. A slider step can't
  // come along, as a slider is the host's to send.
  continueAsArtist({ send, me }) {
    const sharing = this._sharing;
    this.flushHeard();
    clearInterval(sharing?.timer);
    const { n, tail, epoch } = this._ledger;
    this._sharing = markRaw(artistSharing(this, { send, me, sum: this.editLayerSum(), n, tail, epoch }));
    this._ledger.reset();
    this._ledger.stopNumbering();
    this._ledger.tail = new Tail();
    this.history.retain((entry) => !entry.settingsOnly);
    this.historyVersion = this.history.version;
  },

  // What a returning host asks an artist ahead of it for: the tail after has if it reaches that far and it's the
  // same epoch, or else the agreed document, without what's mine and unnumbered.
  async catchUpFor({ has, epoch }) {
    const sharing = this._sharing;
    if (!sharing?.pending) return null;
    this.commitPending();
    const { n } = sharing.pending;
    const tail = epoch === sharing.epoch && Number.isInteger(has) ? sharing.pending.tail.since(has) : null;
    if (tail && (tail.at(-1)?.n === n || has === n)) return { n, epoch: sharing.epoch, kind: 'tail', chunks: await packValue(tail) };
    this.throughPending((pending) => pending.lift());
    const parts = this.projectParts(); // read now, whatever it waits for
    this.throughPending((pending) => pending.reapply());
    return { n, epoch: sharing.epoch, kind: 'project', chunks: await parts.then((rest) => packProject({ imageBuffer: this.imageBuffer, ...rest })) };
  },

  // A host gathering takes that answer, from whoever claimed to have numbers up to has: false, with nothing taken,
  // unless it holds that claim and it's past my last number. A tail goes in the ledger and on the picture, and has to
  // be every number from my next to the one it says, each change read against the stack the layers messages before it
  // leave. A project is the agreed document, so the stacks start over.
  async takeCatchUp({ n, epoch, kind, tail, parts }, has) {
    const ledger = this._ledger;
    if (!Number.isSafeInteger(has) || !Number.isSafeInteger(n) || has <= ledger.n || n < has) return false;
    if (kind === 'tail') {
      this.ensureLayer();
      const reaches = epoch === ledger.epoch && Array.isArray(tail) && tail.length === n - ledger.n && tail.every((item, i) => item?.n === ledger.n + 1 + i);
      if (!reaches) return false;
      let stack = this.layers;
      const items = tail.map((item) => {
        if (item?.t === 'layers') {
          const read = readLayers(item);
          if (read) stack = read.stack;
          return read && { t: 'layers', ...read };
        }
        return readsAsHeard(this, item, stack) && (item.t === 'settings' || item.t === 'base' || typeof item.by === 'string') ? item : null;
      });
      if (items.includes(null)) return false;
      this.flushHeard();
      // A layers item lands before what's after it is taken, so a layer it lets go of (applyLayers) is the one held then,
      // not a later one of the same id.
      let landed = 0;
      items.forEach((item, i) => {
        if (item.t === 'settings' || item.t === 'base' || item.t === 'layers') {
          this._ledger.n = item.n;
          this._ledger.tail.add(item);
        } else {
          this._ledger.takeNumbered(item);
        }
        if (item.t !== 'layers') return;
        this.replayOnPicture(items.slice(landed, i + 1));
        landed = i + 1;
      });
      this.replayOnPicture(items.slice(landed));
      return true;
    }
    const settings = settingsFromStranger(parts.settings);
    if (!settings || !cellsFit(parts)) return false;
    await this.openFromHost(
      { ...parts, settings, erasedCells: [], migrated: false },
      { filename: this.filename, fileExt: this.fileExt, documentId: this.documentId, fileId: this.fileId, sameDocument: true },
    );
    this.ensureLayer();
    this.clearHistory();
    this._ledger.reset({ epoch, sum: this.editLayerSum() });
    this._ledger.n = n;
    this._ledger.tail = new Tail();
    return true;
  },
};
