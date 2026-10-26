// History: each edit is recorded between beginEdit and commitEdit as one undo step (paint and base
// patches, edit cells, base records); undo and redo replay them. Owns _stroke, the edit being
// recorded (a typing run keeps it open across keystrokes: editLayer.js; clearImage and dropEdits
// drop it when the document or the grid changes under it).
import { markRaw, toRaw } from 'vue';
import { parseKey } from '@/document/editCells.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';

export const historyActions = {
  // An edit (stroke, fill, cell edit) records from its first change until commitEdit().
  beginEdit() {
    if (this._stroke?.typing && !this._typingNow) this.commitEdit(); // another edit ends a typing run
    if (this._stroke || !this.paintLayer) return;
    this._stroke = markRaw({ editCells: this.editCells, baseRecords: this.baseRecords }); // raw, so commitEdit's identity checks see the same objects
    this.paintLayer.beginStroke();
    this.baseLayer.beginStroke();
  },

  // End of a user edit: one undo entry for its paint and base pixel tiles and its cell-layer and
  // pin changes, and it counts as unsaved.
  commitEdit() {
    const stroke = this._stroke;
    this._stroke = null;
    const patch = this.paintLayer?.endStroke();
    const basePatch = this.baseLayer?.endStroke();
    this.hasPaint = this.paintLayer?.hasPaint ?? false; // an erase may have left none
    if (stroke && this.quantize === 'count') this.composite({ rebuild: true }); // the Number palette and the stroke's colors catch up
    if (!stroke || (!patch && !basePatch && stroke.editCells === this.editCells && stroke.baseRecords === this.baseRecords)) return;

    const sides = { before: [stroke.editCells, stroke.baseRecords], after: [this.editCells, this.baseRecords] };
    const apply = (side) => {
      if (patch) this.paintLayer.applyPatch(patch, side);
      if (basePatch) this.baseLayer.applyPatch(basePatch, side);
      this.hasPaint = this.paintLayer.hasPaint;
      [this.editCells] = sides[side];
      this.setBaseRecords(sides[side][1]);
      if (side === 'before' && stroke.cursor) useWorkspaceStore().textCursor = stroke.cursor; // typing undone: the cursor goes back to where it started
      this.refreshChanged([[patch, this.paintLayer], [basePatch, this.baseLayer]], sides.before, sides.after);
    };
    this.pushEdit({ undo: () => apply('before'), redo: () => apply('after') });
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
    const now = [this.editCells, this.baseRecords];
    this.editCells = stroke.editCells;
    this.setBaseRecords(stroke.baseRecords);
    this.refreshChanged([[patch, this.paintLayer], [basePatch, this.baseLayer]], now, [stroke.editCells, stroke.baseRecords]);
  },

  // After an edit was undone, redone or taken back: rebuild what it changed (under its paint and
  // base tiles, and every cell whose edit cell or pin differs between its sides), or render it all
  // when that's a large part of the grid (a big fill), which is as quick.
  refreshChanged(patches, [cellsA, recordsA], [cellsB, recordsB]) {
    const pixels = changedPixels(this.cols, this.rows, patches, [[cellsA, cellsB], [recordsA.pins, recordsB.pins]]);
    if (pixels) this.refreshCells(pixels);
    else this.render();
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

  clearHistory() {
    this.history.clear();
    this.historyVersion = this.history.version;
  },

  undo() {
    this.commitPending();
    const float = this._float?.recorded && this._float.version === this.history.version ? this._float : null;
    if (!this.history.undo()) return;
    this.historyVersion = this.history.version;
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
    if (!this.history.redo()) return;
    this.historyVersion = this.history.version;
    this.editVersion++;
  },
};

// The grid pixels under patches' tiles ([patch, layer]: tiles in the layer's pixels) and in the
// cells whose value differs between each pair of maps ('col,row' keys), or null past a quarter of
// the grid.
function changedPixels(cols, rows, patches, mapPairs) {
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
    for (const { x, y, before } of patch.tiles) {
      for (let gy = Math.floor(y / k); gy < Math.ceil((y + before.height) / k); gy++) {
        for (let gx = Math.floor(x / k); gx < Math.ceil((x + before.width) / k); gx++) add(gx, gy);
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
  return pixels;
}
