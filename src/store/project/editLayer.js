// The edit layer: painting and erasing paint, edit cells, typing (with the terminal's rules for wide
// characters), flipping a cell's colors, and clearing the layer. Owns _typingNow (a keystroke is
// being applied) and _typingTimer (the pause that ends a typing run). With the base picked (onBottom)
// it all goes on the base: a cell written as it then shows (completeAt, writeBaseCells), paint as base
// pixels, and typing overwrites (a row of pins and pixels doesn't shift).
import { cellKey, withCellEdit, mergeEntry, withoutCells, shiftRow } from '@/document/editCells.js';
import { overwritesAll } from '@/document/wideChars.js';
import { EMPTY_STATE } from '@/document/frames.js';
import { isShapeKey } from '@/document/shapes.js';
import { keyLayer } from '@/document/layerInfo.js';
import { ctx2d } from '@/lib/Canvas.js';
import { cellIndex, cellsOfPixels } from '@/lib/Cells.js';
import { cellWidth } from '@/lib/CharWidth.js';
import { hex2rgb } from '@/lib/ColorUtils.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { TYPING_PAUSE_MS, bytesHeld, onBottom, refusedHidden, refusedNoCells } from '@/store/project/shared.js';

export const editLayerActions = {
  paintEditPixels(pixels, opacity = 100, stack = false) {
    if (!pixels.length || !this.renderer.outputCanvas || refusedNoCells(this, { toast: false })) return; // no cells layer has the fields
    if (onBottom(this)) return this.paintBasePixels(pixels, opacity, stack);
    this.ensureLayer();
    this.beginEdit();
    this.noteDrawn(pixels);
    this.paintLayer.paint(pixels, opacity, stack);
    this.hasPaint = this.paintLayer.hasPaint;

    this.refreshEdit(pixels);
  },

  // Paint grid pixels ({ x, y, alpha }) in color (default: the foreground color) at the brush opacity,
  // stacking or not (Stack opacity). blockChars (the Pencil's and Brush's Half-block, ANSI view)
  // makes each cell painted a ▄ first, which the paint colors half by half, instead of showing through
  // the cell's own character.
  paintStroke(pixels, color, { blockChars = false } = {}) {
    const workspace = useWorkspaceStore();
    const { r, g, b } = hex2rgb(color ?? workspace.editFgColor);
    const { cols, rows } = this; // read once: a store getter per pixel adds up over a fill
    const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < cols && y < rows);
    if (blockChars) {
      const cells = cellsOfPixels(inGrid, cols, rows).filter(({ col, row }) => this.editCellAt(col, row)?.char !== '▄');
      this.writeEditCells(cells.map((c) => ({ ...c, attrs: { char: '▄' } })));
    }
    this.paintEditPixels(inGrid.map(p => ({ ...p, r, g, b })), workspace.editBrushOpacity, workspace.editBrushStack);
  },

  eraseEditPixels(pixels) {
    if (!pixels.length || !this.renderer.outputCanvas || refusedNoCells(this, { toast: false })) return;
    if (onBottom(this)) return this.eraseBasePixels(pixels);
    this.ensureLayer();
    this.beginEdit();
    this.paintLayer.erase(pixels);

    this.refreshEdit(pixels);
  },

  // Set (string), clear (null) or keep (undefined) a cell's edit-cell char/fg/bg. clearPaint removes
  // the paint in that cell, so the edit shows (the last edit to a cell wins).
  editCell(col, row, attrs, { clearPaint = false } = {}) {
    if (refusedNoCells(this, { toast: false })) return;
    if (onBottom(this)) return writeOnBottom(this, [{ col, row, attrs }]);
    this.ensureLayer();
    this.beginEdit();
    const pixels = [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }], erased = clearPaint && this.cellHasPaint(col, row);
    this.noteDrawn(pixels);
    if (erased) this.paintLayer.erase(pixels);
    this.setEditCells(withCellEdit(this.editCells, col, row, attrs), [cellKey(col, row)]);
    this.recomposeEdit(pixels, { composited: erased });
  },

  // Typing: one undo entry per keystroke. Typed cells sit above paint (the last edit wins). A
  // two-column character takes the cell to its right too, so there's no room for one in the last
  // column: false, and nothing is typed.
  typeAt(col, row, char, attrs, { insert = false } = {}) {
    const width = cellWidth(char);
    if (refusedNoCells(this, { toast: false })) return null; // no cells layer to type on (typeLines says so)
    if (width === 2 && col === this.cols - 1) return false;
    insert &&= !onBottom(this);
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
    insert &&= !onBottom(this);
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
    if (refusedNoCells(this, { toast: false })) return;
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

  // Move a row's edit cells (insert/delete); paint stays where it is. Not on the base.
  shiftCells(row, fromCol, delta) {
    if (onBottom(this)) return;
    const next = shiftRow(this.editCells, row, fromCol, delta, this.cols);
    if (next === this.editCells) return;
    this.setEditCells(next, Array.from({ length: this.cols }, (_, col) => cellKey(col, row)));
    const pixels = Array.from({ length: this.cols }, (_, x) => ({ x, y: 2 * row }));
    this.recomposeEdit(pixels);
  },

  // A whole entry for a cell as the cell layer shows it: its own attributes, the rest frozen from
  // what shows under it the way the render style shows it: the base (bakedEntry) with the shown
  // cells layers below (below: the layer it's for, the one in use unless said) over it (reading.js:
  // lookUnder). Its own paint isn't part of it; it stays put.
  completeAt(col, row, entry, below = this.editId) {
    return { ...this.lookUnder(col, row, below), ...entry };
  },

  // Many cell edits at once ([{ col, row, attrs }], e.g. a shape): one Map copy, one paint erase.
  // A character written over half of a wide character turns its other half into a space, as a
  // terminal does (that space keeps its colors and paint). clearPaint erases the paint in the cells
  // so what's written shows; a cell written with no background of its own (BG None) keeps the one
  // the paint gave it, as it keeps the base's or an edit cell's. Part of the current edit; the
  // caller commits it.
  writeEditCells(list, { clearPaint = false } = {}) {
    if (!list.length || refusedNoCells(this, { toast: false })) return;
    if (onBottom(this)) return writeOnBottom(this, list);
    this.ensureLayer();
    this.beginEdit();
    const blanks = overwritesAll(this.cells, this.cols, list.map(({ col, row, attrs }) => ({ col, row, char: attrs.char })));
    const next = new Map(this.editCells);
    const pixels = [];
    for (const { col, row, attrs } of list) {
      const key = cellKey(col, row);
      const keepPaintBg = clearPaint && attrs.bg === undefined && this.paintLayer?.pixelAt(col, 2 * row);
      const entry = mergeEntry(next.get(key), keepPaintBg ? { ...attrs, bg: this.underlyingAt(col, row, { evenHidden: true }).bg } : attrs);
      if (entry) next.set(key, entry);
      else next.delete(key);
      pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
    }
    this.noteDrawn(pixels);
    const erased = clearPaint && !!this.paintLayer?.hasPaint;
    if (erased) this.paintLayer.erase(pixels);
    for (const { col, row } of blanks) {
      next.set(cellKey(col, row), mergeEntry(next.get(cellKey(col, row)), { char: ' ' }));
      pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
    }
    this.setEditCells(next, [...list, ...blanks].map(({ col, row }) => cellKey(col, row)));
    this.recomposeEdit(pixels, { composited: erased });
  },

  // Remove edit cells so the image shows through.
  clearEditCells(cells) {
    if (onBottom(this)) return this.eraseBase(cells);
    const next = withoutCells(this.editCells, cells);
    if (next === this.editCells || refusedNoCells(this, { toast: false })) return;
    this.ensureLayer();
    this.beginEdit();
    this.setEditCells(next, cells.map(({ col, row }) => cellKey(col, row)));
    const pixels = cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
    this.recomposeEdit(pixels);
  },

  // Flip a cell's colors on the layer in use: the paint (as it shows) or the edit cell's own colors;
  // a cell with neither gets the flip as paint. On the base, its two halves.
  flipCell(col, row) {
    if (!this.cells[cellIndex(col, row, this.cols)]) return;
    if (this.editCellAt(col, row) && !this.cellHasPaint(col, row)) {
      const { fg, bg } = this.underlyingAt(col, row, { evenHidden: true });
      this.editCell(col, row, { fg: bg, bg: fg });
    } else this.flipPaint(col, row);
  },

  // Swap a cell's two pixels in the paint layer, using the real colors from the output canvas
  // (cells may be normalized, e.g. a background forced to black in ASCII mode). On the base, its halves.
  flipPaint(col, row) {
    if (onBottom(this)) return this.flipBase([{ col, row }]);
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

  // The picked cells layer (the one in use): off with the base or a vector layer picked, and refused while it's hidden:
  // what you can't see isn't destroyed.
  clearEditLayer() {
    if (!useWorkspaceStore().pickedCells || refusedHidden(this, [this.editId])) return;
    if (this._artInside) this.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
    this.ensureLayer();
    if (!this.paintLayer) return;
    this.commitPending();
    // On a movie it's the frame that changes: its cells and paint on the layer in use go, and what it inherits there is
    // covered over; its kind, the other layers and the shapes stay.
    if (this.hasFrames) {
      this.noteFrame();
      const { kind, changes, parts } = this.currentFrame, at = this.frame, mine = (key) => !isShapeKey(key) && keyLayer(key).id === this.editId;
      const inherited = kind === 'blank' && at ? (this.resolvedOf(at - 1), this.frames[at - 1].passes) : new Map();
      const cleared = { kind, changes: new Map([...[...changes].filter(([key]) => !mine(key)), ...[...inherited.keys()].filter(mine).map((key) => [key, EMPTY_STATE])]), parts };
      const eases = this.frames.map((frame) => [frame, frame.tweens, frame.motions]); // what the Clear leaves no tween for goes
      this.setFrameState(cleared);
      this.pushWholeLayer(() => this.setFrameState({ kind, changes, parts, eases }), () => this.setFrameState(cleared), bytesHeld(changes));
      return;
    }
    const before = { paintLayer: this.paintLayer.snapshot(), editCells: this.editCells };
    const after = { paintLayer: null, editCells: new Map() };
    const apply = ({ paintLayer, editCells }) => {
      this.paintLayer.restore(paintLayer);
      this.hasPaint = this.paintLayer.hasPaint;
      this.editCells = editCells;
      this.render();
    };
    apply(after);
    this.pushWholeLayer(() => apply(before), () => apply(after), bytesHeld(before.paintLayer, before.editCells));
  },
};

// Cells written on the base ([{ col, row, attrs }], attrs as writeEditCells takes them: undefined keeps, null clears):
// each as it then shows, its own attributes over the base's look (completeAt), its character pinned; the half of a wide
// character one breaks becomes a space, as on a cells layer.
function writeOnBottom(project, list) {
  const own = (attrs) => Object.fromEntries(Object.entries(attrs).filter(([, value]) => value != null));
  const blanks = overwritesAll(project.cells, project.cols, list.map(({ col, row, attrs }) => ({ col, row, char: attrs.char })));
  project.writeBaseCells([...list, ...blanks.map((cell) => ({ ...cell, attrs: { char: ' ' } }))].map(({ col, row, attrs }) => ({ col, row, ...project.completeAt(col, row, own(attrs)) })));
}
