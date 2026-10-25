// The edit layer: painting and erasing paint, edit cells, typing (with the terminal's rules for wide
// characters), flipping a cell's colors, and clearing the layer. Owns _typingNow (a keystroke is
// being applied) and _typingTimer (the pause that ends a typing run).
import { cellKey, withCellEdit, mergeEntry, withoutCells, shiftRow } from '@/document/editCells.js';
import { overwritesAll } from '@/document/wideChars.js';
import { ctx2d } from '@/lib/Canvas.js';
import { cellIndex, bakedEntry } from '@/lib/Cells.js';
import { cellWidth } from '@/lib/CharWidth.js';
import { hex2rgb } from '@/lib/ColorUtils.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { TYPING_PAUSE_MS } from '@/store/project/shared.js';

export const editLayerActions = {
  paintEditPixels(pixels, opacity = 100) {
    if (!pixels.length || !this.renderer.outputCanvas) return;
    this.ensureLayer();
    this.beginEdit();
    this.paintLayer.paint(pixels, opacity);
    this.hasPaint = this.paintLayer.hasPaint;

    this.refreshCells(pixels);
  },

  // Paint grid pixels ({ x, y, alpha }) in color (default: the foreground color) at the brush opacity.
  paintStroke(pixels, color) {
    const workspace = useWorkspaceStore();
    const { r, g, b } = hex2rgb(color ?? workspace.editFgColor);
    const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < this.cols && y < this.rows);
    this.paintEditPixels(inGrid.map(p => ({ ...p, r, g, b })), workspace.editBrushOpacity);
  },

  eraseEditPixels(pixels) {
    if (!pixels.length || !this.renderer.outputCanvas) return;
    this.ensureLayer();
    this.beginEdit();
    this.paintLayer.erase(pixels);

    this.refreshCells(pixels);
  },

  // Set (string), clear (null) or keep (undefined) a cell's edit-cell char/fg/bg. clearPaint removes
  // the paint in that cell, so the edit shows (the last edit to a cell wins).
  editCell(col, row, attrs, { clearPaint = false } = {}) {
    this.ensureLayer();
    this.beginEdit();
    const pixels = [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }];
    if (clearPaint && this.cellHasPaint(col, row)) {
      this.paintLayer.erase(pixels);
      this.composite();
    }
    this.editCells = withCellEdit(this.editCells, col, row, attrs);
    this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
  },

  // Typing: one undo entry per keystroke. Typed cells sit above paint (the last edit wins). A
  // two-column character takes the cell to its right too, so there's no room for one in the last
  // column: false, and nothing is typed.
  typeAt(col, row, char, attrs, { insert = false } = {}) {
    const width = cellWidth(char);
    if (width === 2 && col === this.cols - 1) return false;
    this.typing(() => {
      if (insert) this.shiftCells(row, col, width);
      this.writeAt(col, row, { char, ...attrs });
    });
    return true;
  },

  // Write a typed cell over any paint; the half of a wide character it breaks becomes a space
  // (writeEditCells).
  writeAt(col, row, attrs) {
    this.writeEditCells([{ col, row, attrs }], { clearPaint: true });
  },

  // Backspace over a wide character takes all of it: the columns the cursor moves back (0 at the
  // row's start).
  backspaceAt(col, row, attrs, { insert = false } = {}) {
    if (col < 1) return 0;
    const target = this.cells[cellIndex(col - 1, row, this.cols)]?.wide === 'trail' ? col - 2 : col - 1;
    const k = col - target;
    this.typing(() => {
      if (insert) this.shiftCells(row, col, -k);
      else this.writeAt(target, row, { char: ' ', ...attrs });
    });
    return k;
  },

  // Delete on a wide character takes all of it.
  deleteAt(col, row) {
    const k = this.cells[cellIndex(col, row, this.cols)]?.wide === 'lead' ? 2 : 1;
    this.typing(() => this.shiftCells(row, col + k, -k));
  },

  // A run of typing is one undo step: its stroke stays open across keystrokes and is committed
  // after a pause, by any other edit (beginEdit), or by undo/redo/save (commitPending).
  typing(fn) {
    this.ensureLayer();
    this._typingNow = true;
    try {
      this.beginEdit();
      if (this._stroke && !this._stroke.typing) this._stroke.cursor = useWorkspaceStore().textCursor; // where undo puts it back
      fn();
    } finally {
      this._typingNow = false;
    }
    if (this._stroke) this._stroke.typing = true;
    clearTimeout(this._typingTimer);
    this._typingTimer = setTimeout(() => {
      if (this._stroke?.typing) this.commitEdit();
    }, TYPING_PAUSE_MS);
  },

  // Move a row's edit cells (insert/delete); paint stays where it is.
  shiftCells(row, fromCol, delta) {
    const next = shiftRow(this.editCells, row, fromCol, delta, this.cols);
    if (next === this.editCells) return;
    this.editCells = next;
    const pixels = Array.from({ length: this.cols }, (_, x) => ({ x, y: 2 * row }));
    this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
  },

  // A whole entry for a cell as the cell layer shows it: its own attributes, the rest frozen from
  // the image the way the render style shows it (bakedEntry). Paint isn't part of it; it stays put.
  completeAt(col, row, entry) {
    return { ...bakedEntry(this.renderStyle, this.baseCellAt(col, row)), ...entry };
  },

  // Many cell edits at once ([{ col, row, attrs }], e.g. a shape): one Map copy, one paint erase.
  // A character written over half of a wide character turns its other half into a space, as a
  // terminal does (that space keeps its colors and paint). Part of the current edit; the caller
  // commits it.
  writeEditCells(list, { clearPaint = false } = {}) {
    if (!list.length) return;
    this.ensureLayer();
    this.beginEdit();
    const blanks = overwritesAll(this.cells, this.cols, list.map(({ col, row, attrs }) => ({ col, row, char: attrs.char })));
    const next = new Map(this.editCells);
    const pixels = [];
    for (const { col, row, attrs } of list) {
      const key = cellKey(col, row);
      const entry = mergeEntry(next.get(key), attrs);
      if (entry) next.set(key, entry);
      else next.delete(key);
      pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
    }
    if (clearPaint && this.paintLayer?.hasPaint) {
      this.paintLayer.erase(pixels);
      this.composite();
    }
    for (const { col, row } of blanks) {
      next.set(cellKey(col, row), mergeEntry(next.get(cellKey(col, row)), { char: ' ' }));
      pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
    }
    this.editCells = next;
    this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
  },

  // Remove edit cells so the image shows through.
  clearEditCells(cells) {
    const next = withoutCells(this.editCells, cells);
    if (next === this.editCells) return;
    this.ensureLayer();
    this.beginEdit();
    this.editCells = next;
    const pixels = cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
    this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
  },

  // Flip a cell's colors on the chosen layers. Edit: the paint (as it shows) or the edit cell's
  // own colors; a cell with neither gets the flip as paint, unless the base is flipping it. Base:
  // the base's two halves. The edit side goes first, while the cell still shows unflipped.
  flipCell(col, row, { base = false, edit = true } = {}) {
    if (!this.cells[cellIndex(col, row, this.cols)]) return;
    if (edit) {
      if (this.editCellAt(col, row) && !this.cellHasPaint(col, row)) {
        const { fg, bg } = this.underlyingAt(col, row);
        this.editCell(col, row, { fg: bg, bg: fg });
      } else if (this.cellHasPaint(col, row) || !base) {
        this.flipPaint(col, row);
      }
    }
    if (base) this.flipBase([{ col, row }]);
  },

  // Swap a cell's two pixels in the paint layer, using the real colors from the output canvas
  // (cells may be normalized, e.g. a background forced to black in ASCII mode).
  flipPaint(col, row) {
    const outputCanvas = this.renderer.outputCanvas;
    if (!outputCanvas) return;
    // Safari requires explicit sRGB to avoid color space mismatch (P3).
    const ctx = ctx2d(outputCanvas);
    const p1Data = ctx.getImageData(col, 2 * row, 1, 1).data;
    const p2Data = ctx.getImageData(col, 2 * row + 1, 1, 1).data;

    this.paintEditPixels([
      { x: col, y: 2 * row, r: p2Data[0], g: p2Data[1], b: p2Data[2], alpha: 1 },
      { x: col, y: 2 * row + 1, r: p1Data[0], g: p1Data[1], b: p1Data[2], alpha: 1 },
    ]);
  },

  clearEditLayer() {
    this.ensureLayer();
    if (!this.paintLayer) return;
    this.commitPending();
    const before = { paintLayer: this.paintLayer.snapshot(), editCells: this.editCells };
    const after = { paintLayer: null, editCells: new Map() };
    const apply = ({ paintLayer, editCells }) => {
      this.paintLayer.restore(paintLayer);
      this.hasPaint = this.paintLayer.hasPaint;
      this.editCells = editCells;
      this.render();
    };
    apply(after);
    this.pushEdit({ undo: () => apply(before), redo: () => apply(after) });
  },
};
