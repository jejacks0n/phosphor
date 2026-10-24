// History: each edit is recorded between beginEdit and commitEdit as one undo step (paint and base
// patches, edit cells, base records); undo and redo replay them. Owns _stroke, the edit being
// recorded (a typing run keeps it open across keystrokes: editLayer.js).
import { markRaw } from "vue";

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
      this.render();
    };
    this.pushEdit({ undo: () => apply('before'), redo: () => apply('after') });
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
    if (!this.history.undo()) return;
    this.historyVersion = this.history.version;
    this.editVersion++; // undo moves away from what was saved (undoing back to it still counts as dirty)
  },

  redo() {
    this.commitPending();
    if (!this.history.redo()) return;
    this.historyVersion = this.history.version;
    this.editVersion++;
  },
};
