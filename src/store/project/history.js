// History: each edit is recorded between beginEdit and commitEdit as one undo step: its paint and edit
// cells go in the ledger (_ledger, whose positions keep who drew what), its base patch and base records
// in the entry; undo and redo replay them. Owns _stroke, the edit being recorded (a typing run keeps it
// open across keystrokes: editLayer.js; clearImage and dropEdits drop it when the document or the grid
// changes under it), and _baseline, what a stroke being submitted began with (reading.js).
import { markRaw, toRaw } from 'vue';
import { cellChanges, pixelRuns } from '@/document/changes.js';
import { parseKey } from '@/document/editCells.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { bytesHeld, randomId } from '@/store/project/shared.js';

const NO_CHANGE = { cells: [], runs: [] };

export const historyActions = {
  // An edit (stroke, fill, cell edit) records from its first change until commitEdit().
  beginEdit() {
    if (this._stroke?.typing && !this._typingNow) this.commitEdit(); // another edit ends a typing run
    if (this._stroke || !this.paintLayer) return;
    this._stroke = markRaw({ editCells: this.editCells, baseRecords: this.baseRecords }); // raw, so commitEdit's identity checks see the same objects
    this.paintLayer.beginStroke();
    this.baseLayer.beginStroke();
  },

  // End of a user edit: its paint and cells go in the ledger, and one undo entry undoes them with its
  // base pixel tiles and pin changes, and it counts as unsaved.
  commitEdit() {
    const stroke = this._stroke;
    this._stroke = null;
    const patch = this.paintLayer?.endStroke();
    const basePatch = this.baseLayer?.endStroke();
    this.hasPaint = this.paintLayer?.hasPaint ?? false; // an erase may have left none
    // The Number palette, held still through the stroke, is picked again: when that changed it, every
    // cell was rebuilt; when not, only the stroke's cells (shown in its own colors) need catching up.
    if (stroke && this.quantize === 'count' && !this.composite()) {
      const pixels = changedPixels(this.cols, this.rows, [[patch, this.paintLayer], [basePatch, this.baseLayer]], [[stroke.editCells, this.editCells], [stroke.baseRecords.pins, this.baseRecords.pins]]);
      if (pixels) this.recompose(pixels);
      else this.rebuildCells();
    }
    if (!stroke || (!patch && !basePatch && stroke.editCells === this.editCells && stroke.baseRecords === this.baseRecords)) return;

    const id = randomId();
    const change = {
      // ponytail: scans the map once a stroke that wrote cells (21 ms at 500k cells, about what each of its writes copying the map costs); record keys as they're written if that shows.
      cells: cellChanges(stroke.editCells, this.editCells),
      runs: patch?.tiles.flatMap(({ x, y, w, h, before, after }) => pixelRuns(before.data, after.data, w, h, x, y)) ?? [],
    };
    if (change.cells.length || change.runs.length) { // only base pixels or pins: nothing for the ledger
      this._baseline = markRaw({ cells: stroke.editCells, tiles: new Map(patch?.tiles.map(({ x, y, before }) => [`${x},${y}`, before])) });
      this._ledger.submit(this._by, id, change);
      this._baseline = null;
    }

    // The entry mustn't close over stroke or patch: the old map and the tiles are the ledger's to hold now.
    const { cursor } = stroke;
    const records = { before: stroke.baseRecords, after: this.baseRecords };
    const also = { patches: [[basePatch, this.baseLayer]], pins: [records.before.pins, records.after.pins] };
    const apply = (side) => {
      if (basePatch) this.baseLayer.applyPatch(basePatch, side);
      this.setBaseRecords(records[side]);
      if (side === 'before' && cursor) useWorkspaceStore().textCursor = cursor; // typing undone: the cursor goes back to where it started
      if (side === 'before') this.undoStroke(id, also);
      else this.redoStroke(id, also);
    };
    this.pushEdit({
      undo: () => apply('before'),
      redo: () => apply('after'),
      onDrop: () => this._ledger.forget(id), // or while a merge holds its stacks, not found: see pushWholeLayer
      bytes: this._ledger.bytesOf(id) + bytesHeld(basePatch),
    });
  },

  // Take a stroke back, or put it back on top, and show what that changed. also: applyChange's. Null
  // when the ledger has nothing of it, as with a stroke of base pixels alone, whose entry still has also.
  undoStroke(stroke, also) {
    const change = this._ledger.undo(this._by, stroke);
    this.applyChange(change ?? NO_CHANGE, also);
    return change;
  },

  redoStroke(stroke, also) {
    const change = this._ledger.redo(this._by, stroke);
    this.applyChange(change ?? NO_CHANGE, also);
    return change;
  },

  // Write a change's cells and runs and refresh only what changed. also: what's changed with it, for
  // one refresh to cover: patches ([patch, layer]) already applied, and pins ([before, after]).
  applyChange({ cells, runs }, { patches = [], pins = [] } = {}) {
    if (cells.length) {
      const next = new Map(this.editCells);
      for (const [key, entry] of cells) {
        if (entry) next.set(key, entry);
        else next.delete(key);
      }
      this.editCells = next;
    }
    const written = this.paintLayer.writeRuns(runs);
    this.hasPaint = this.paintLayer.hasPaint;
    this.refreshChanged([[written, this.paintLayer], ...patches], pins.length ? [pins] : [], cells.map(([key]) => key));
  },

  // Take back the open edit without recording it (a stroke a pinch interrupted): its paint, base
  // pixels, edit cells and pins go back as they were. A typing run isn't interrupted by a pinch: it stays.
  cancelEdit() {
    const stroke = this._stroke;
    if (!stroke || stroke.typing) return;
    this._stroke = null;
    const patch = this.paintLayer?.endStroke();
    const basePatch = this.baseLayer?.endStroke();
    if (patch) this.paintLayer.applyPatch(patch, 'before');
    if (basePatch) this.baseLayer.applyPatch(basePatch, 'before');
    this.hasPaint = this.paintLayer?.hasPaint ?? false;
    const pairs = [[this.editCells, stroke.editCells], [this.baseRecords.pins, stroke.baseRecords.pins]];
    this.editCells = stroke.editCells;
    this.setBaseRecords(stroke.baseRecords);
    this.refreshChanged([[patch, this.paintLayer], [basePatch, this.baseLayer]], pairs);
  },

  // After an edit was undone, redone or taken back: rebuild what it changed (under its paint and
  // base tiles, every cell whose edit cell or pin differs between a pair of maps, and the cells in
  // keys), or render it all when that's a large part of the grid (a big fill), which is as quick.
  refreshChanged(patches, mapPairs, keys = []) {
    const pixels = changedPixels(this.cols, this.rows, patches, mapPairs, keys);
    if (!pixels) this.render();
    else if (pixels.length) this.refreshCells(pixels);
  },

  // Fold an unfinished stroke into history before an edit that replaces the whole layer.
  commitPending() {
    if (this._stroke) this.commitEdit();
    this.commitSliders(); // a slider move still open
  },

  pushEdit(entry) {
    this.history.push(entry);
    this.historyVersion = this.history.version;
    this.editVersion++;
  },

  // An edit that replaced the whole edit layer, already applied: the strokes under it are out of reach
  // until it's undone, and those after it until it's redone, so the entry holds whichever side isn't
  // showing. History dropping one of those strokes meanwhile finds nothing to forget, so what it holds
  // stays until the next reset; the picture and undo stay right.
  pushWholeLayer(undo, redo, bytes) {
    let away = this._ledger.takeStacks();
    const swap = () => {
      const showing = this._ledger.takeStacks();
      this._ledger.putStacks(away);
      away = showing;
    };
    this.pushEdit({ undo: () => { swap(); undo(); }, redo: () => { swap(); redo(); }, wholeLayer: true, bytes });
  },

  // The last whole-layer step and everything older go: what's left only needs strokes since.
  dropOldUndo() {
    this.history.dropThrough((entry) => entry.wholeLayer);
    this.historyVersion = this.history.version;
  },

  clearHistory() {
    this._ledger.reset(); // first: what History drops next has nothing left to forget
    this.history.clear();
    this.historyVersion = this.history.version;
  },

  undo() {
    this.commitPending();
    const float = this._float?.recorded && this._float.version === this.history.version ? this._float : null;
    const entry = this.history.undo();
    if (!entry) return;
    this.historyVersion = this.history.version;
    // A selection step (changeSelection) isn't a change to the document. Undoing the one that ended a
    // move or paste picks that up again, so undoing it next puts its selection back too.
    if (entry.selectionOnly) {
      if (entry.float) this._float = { ...entry.float, version: this.history.version };
      return;
    }
    // Undoing a move or paste: the selection goes back with the cells (a paste's is dropped; a stamp's
    // goes back to the copy it left).
    if (float) {
      this._float = null;
      const workspace = useWorkspaceStore();
      if (toRaw(workspace.selection) === toRaw(float.landed)) workspace.selection = float.paste && !float.stamped ? null : float.from;
    }
    this.editVersion++; // undo moves away from what was saved (undoing back to it still counts as dirty)
  },

  redo() {
    this.commitPending();
    const entry = this.history.redo();
    if (!entry) return;
    this.historyVersion = this.history.version;
    if (!entry.selectionOnly) this.editVersion++;
  },
};

// The grid pixels under patches' tiles ([patch, layer]: tiles in the layer's pixels) and in the
// cells whose value differs between each pair of maps ('col,row' keys) or named in keys, or null past
// a quarter of the grid.
function changedPixels(cols, rows, patches, mapPairs, keys = []) {
  const limit = cols * rows / 4, seen = new Set(), pixels = [];
  const add = (x, y) => {
    const i = y * cols + x;
    if (x < 0 || y < 0 || x >= cols || y >= rows || seen.has(i)) return;
    seen.add(i);
    pixels.push({ x, y });
  };
  for (const [patch, layer] of patches) {
    if (!patch) continue;
    const k = layer.scale;
    for (const { x, y, w, h } of patch.tiles) {
      for (let gy = Math.floor(y / k); gy < Math.ceil((y + h) / k); gy++) {
        for (let gx = Math.floor(x / k); gx < Math.ceil((x + w) / k); gx++) add(gx, gy);
      }
      if (pixels.length > limit) return null;
    }
  }
  const addCell = (key) => {
    const { col, row } = parseKey(key);
    add(col, 2 * row);
    add(col, 2 * row + 1);
  };
  for (const [a, b] of mapPairs) {
    if (a === b) continue;
    for (const [key, value] of a) if (b.get(key) !== value) addCell(key);
    for (const key of b.keys()) if (!a.has(key)) addCell(key);
    if (pixels.length > limit) return null;
  }
  for (const key of keys) addCell(key);
  return pixels.length > limit ? null : pixels;
}
