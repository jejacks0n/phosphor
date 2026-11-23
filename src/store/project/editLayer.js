// The edit layer: painting and erasing paint, edit cells, typing (with the terminal's rules for wide
// characters), flipping a cell's colors, and clearing the layer. Owns _typingNow (a keystroke is
// being applied) and _typingTimer (the pause that ends a typing run). With the base picked (onBottom)
// it all goes on the base: a cell written as it then shows (completeAt, writeBaseCells), paint as base
// pixels, and a row pushed along by typing as shiftBaseCells moves it.
import { cellKey, parseKey, withCellEdit, mergeEntry, withoutCells, shiftRow, moveCells, isFrozen, isLaid, isPaintBlock, ownEntry } from '@/document/editCells.js';
import { overwritesAll } from '@/document/wideChars.js';
import { EMPTY_STATE, cutKey } from '@/document/frames.js';
import { isShapeKey } from '@/document/shapes.js';
import { keyLayer } from '@/document/layerInfo.js';
import { ctx2d } from '@/lib/Canvas.js';
import { bakedEntry, blockOver, cellIndex, cellsOfPixels, opensToPaint, showsChar } from '@/lib/Cells.js';
import { cellWidth } from '@/lib/CharWidth.js';
import { fitFont } from '@/lib/BitmapFont.js';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { TYPING_PAUSE_MS, bytesHeld, forgetPastEdge, lineMoves, onBottom, over, ownHalves, pastEdge, readsOf, refusedHidden, refusedNoCells, takePins, ownColored } from '@/store/project/shared.js';
import { toast } from '@/composables/useToast';
import { t } from '@/i18n';

// A typed character with the colors it's typed in. A space has no ink, so it takes the background alone: the cell keeps
// the foreground it had (on the base that's its lower pixel, which the PIXEL view shows; on a layer a color no one sees
// till Merge down brings it out).
const typed = (char, attrs) => (char.trim() ? { char, ...attrs } : { char, ...attrs, fg: undefined, fgIndex: undefined });

export const editLayerActions = {
  paintEditPixels(pixels, opacity = 100, stack = false) {
    if (!pixels.length || !this.renderer.outputCanvas || refusedNoCells(this, { toast: false })) return; // no cells layer has the fields
    if (onBottom(this)) {
      takePins(this, pixels);
      return this.paintBasePixels(pixels, opacity, stack);
    }
    this.ensureLayer();
    this.beginEdit();
    unfreeze(this, pixels, { painted: true });
    this.noteDrawn(pixels);
    this.paintLayer.paint(pixels, opacity, stack);
    this.hasPaint = this.paintLayer.hasPaint;

    this.refreshEdit(pixels);
  },

  // Paint grid pixels ({ x, y, alpha }) in color (default: the foreground color) at the brush opacity,
  // stacking or not (Stack opacity). blockChars (the Pencil's and Brush's Half-block, ANSI view)
  // makes each cell painted a ▄ first, which the paint colors half by half, instead of showing through
  // the cell's own character; 'plain' (their Colors only, in either view) only the cells colorsOnlyCells says.
  paintStroke(pixels, color, { blockChars = false } = {}) {
    const workspace = useWorkspaceStore();
    const { r, g, b } = hex2rgb(color ?? workspace.editFgColor);
    const { cols, rows } = this; // read once: a store getter per pixel adds up over a fill
    const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < cols && y < rows);
    if (blockChars === 'plain') this.colorsOnlyCells(inGrid);
    else if (blockChars) this.writeBlocks(cellsOfPixels(inGrid, cols, rows).filter(({ col, row }) => !isPaintBlock(this.editCellAt(col, row)))); // a block already; a frozen ▄ is a frozen cell (R5)
    this.paintEditPixels(inGrid.map(({ x, y, alpha }) => ({ x, y, alpha, r, g, b })), workspace.editBrushOpacity, workspace.editBrushStack);
  },

  // Colors only's cells (docs/model.md R5, R2), before paint is laid at grid pixels ({ x, y }, on the grid): the Brush's
  // and Pencil's (paintStroke's 'plain'), and a plugin brush's, whose paint shows as theirs does (tools/pluginBrush.js).
  // Each cell the pixels reach that shows no character in ANSI (showsNoChar: a blank canvas's, in its own background
  // color) as the stroke first reaches it becomes a bare ▄, so the paint doesn't bring a hidden one out (a cell the
  // stroke itself paints into one color stays as it was), and so does a frozen cell. The same cells take it whichever
  // view and art style the stroke is laid in; the ▄ shows in ANSI alone (editCells.js shownEntry, and the base's ▄ pins:
  // Renderer.pinAt), and in ASCII the paint is converted with the ASCII characters. Part of the current edit (begun here
  // when a cell changes); the caller lays the paint and commits.
  colorsOnlyCells(pixels) {
    const { cols, rows } = this;
    let cells = cellsOfPixels(pixels, cols, rows).filter(({ col, row }) => !isPaintBlock(this.editCellAt(col, row))); // a block already; a frozen ▄ is a frozen cell (R5)
    if (!cells.length) return;
    if (!refusedNoCells(this, { toast: false })) {
      this.ensureLayer();
      this.beginEdit();
    }
    const seen = this._stroke && (this._stroke.plainSeen ??= new Set());
    // A cell the converter drew is paint to Colors only and gets no ▄ (one would outlast a change of how characters
    // are chosen): the paint becomes the characters the layer's settings choose over the pixels under it (R7), the
    // base's Random among them, so a stroke on a blank canvas shows Random's characters. A pinned character (the
    // base), or a cell of the layer's own, is someone's own (R5); over one under the layer the paint shows as R2 has
    // it, with no entry. Inside an art layer every cell is someone's own, and the rule below holds.
    const converted = this._artInside ? null : (key) => !(onBottom(this) ? this.baseRecords.pins : this.editCells).has(key);
    cells = !seen ? [] : cells.filter(({ col, row }) => {
      const key = cellKey(col, row), first = !seen.has(key), cell = this.cells[cellIndex(col, row, cols)];
      seen.add(key);
      if (!first || !cell || converted?.(key)) return false;
      // docs/model.md R5 (a frozen cell is paint) and R2 (a character with nothing to tint)
      return isFrozen(this.editCellAt(col, row)) || (ownColored(this, col, row) ? opensToPaint(cell, this.renderStyle) : showsNoChar(this, col, row, cell));
    });
    // A cell of the layer's own with colors shows them itself, and a ▄ with colors of its own isn't a paint block
    // (ASCII would show it): its colors go into paint, as it showed (unlockCells), and the ▄ has none.
    this.unlockCells(cells.filter(({ col, row }) => ownColored(this, col, row)));
    const bottom = onBottom(this);
    this.writeEditCells(cells.map((c) => ({ ...c, attrs: bottom ? baseBlock(this, c.col, c.row) : { char: '▄' } })));
  },

  // Cells of the layer in use ([{ col, row }]) turned into paint: a cell with colors of its own has the two halves it
  // shows (ownHalves) laid as opaque paint, a frozen cell has its paint under it already (docs/model.md R3), and the entry
  // goes. What Colors only does to a frozen cell (R5) and to a cell with colors of its own that shows no character (R2).
  // Not on the base.
  unlockCells(cells) {
    if (!cells.length || onBottom(this)) return;
    const { rows } = this, colored = cells.filter(({ col, row }) => !isFrozen(this.editCellAt(col, row)));
    this.putEditPixels(colored.flatMap(({ col, row }) => ownHalves(this, col, row).map((color, k) => ({ x: col, y: 2 * row + k, ...color, a: 1 }))).filter(({ y }) => y < rows));
    this.clearEditCells(cells);
  },

  // Cells ([{ col, row }]) made paint blocks, bare ▄s, for paint laid next to color (Half-block, and the Shape tool's
  // Write block glyphs). The character goes and its foreground with it; a ▄ that kept a typed line's foreground was a
  // character of the layer's own, so its bottom half showed that color under paint on the top half, a whole cell where
  // the stroke drew half of one. A background of the cell's own stays: it goes into paint in both halves, under the
  // layer's paint there, as the cell showed it. A frozen cell's paint is under it already. On the base a pinned
  // character's colors are its two pixels, its foreground the lower one, so its block takes its background in both
  // (blockOver: a solid glyph, a ▄ among them, keeps its halves); a cell the converter drew keeps the halves it had.
  writeBlocks(cells) {
    if (onBottom(this)) {
      return this.writeEditCells(cells.map((c) => ({ ...c, attrs: baseBlock(this, c.col, c.row) })));
    }
    const { rows } = this, backed = cells.filter(({ col, row }) => this.editCellAt(col, row)?.bg && !isFrozen(this.editCellAt(col, row)));
    this.putEditPixels(backed.flatMap(({ col, row }) => [0, 1].map((k) => {
      const bg = hex2rgb(this.editCellAt(col, row).bg), paint = this.paintLayer?.pixelAt(col, 2 * row + k);
      return { x: col, y: 2 * row + k, ...(paint ? over(bg, paint) : bg), a: 1 };
    })).filter(({ y }) => y < rows));
    this.writeEditCells(cells.map((c) => ({ ...c, attrs: { char: '▄', fg: null, bg: null } })));
  },

  // Set the picked layer's paint at grid pixels ({ x, y, r, g, b, a }, a 0..1) to exactly those colors and alphas,
  // whatever was there (Retouch on a layer's own paint). Not on the base, whose pixels are all opaque.
  putEditPixels(pixels) {
    if (!pixels.length || !this.renderer.outputCanvas || onBottom(this) || refusedNoCells(this, { toast: false })) return;
    this.ensureLayer();
    this.beginEdit();
    unfreeze(this, pixels, { painted: true });
    this.noteDrawn(pixels);
    this.paintLayer.put(pixels);
    this.hasPaint = this.paintLayer.hasPaint;
    this.refreshEdit(pixels);
  },

  eraseEditPixels(pixels) {
    if (!pixels.length || !this.renderer.outputCanvas || refusedNoCells(this, { toast: false })) return;
    if (onBottom(this)) return this.eraseBasePixels(pixels);
    this.ensureLayer();
    this.beginEdit();
    unfreeze(this, pixels);
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
  // column: false, and nothing is typed. mode (workspace.typingMode): 'overwrite' replaces the cell; 'insert' pushes
  // the rest of the row right first, its characters and its paint; 'partial' its characters alone (shiftCells).
  typeAt(col, row, char, attrs, { mode = 'overwrite' } = {}) {
    if (this.drawingFont) char = fitFont(char, this.drawingFont); // only what the drawing's font holds
    const width = cellWidth(char);
    if (refusedNoCells(this, { toast: false })) return null; // no cells layer to type on (typeLines says so)
    if (width === 2 && col === this.cols - 1) return false;
    this.typing(() => {
      if (mode !== 'overwrite') this.shiftCells(row, col, width, { paint: mode === 'insert' });
      this.writeAt(col, row, typed(char, attrs));
    });
    return true;
  },

  // Write a typed cell over any paint; the half of a wide character it breaks becomes a space
  // (writeEditCells).
  writeAt(col, row, attrs) {
    this.writeEditCells([{ col, row, attrs }], { clearPaint: true });
  },

  // Backspace over a wide character takes all of it: the columns the cursor moves back (0 at the
  // row's start). In Overwrite mode it leaves a space; in the others it pulls the rest of the row left, as typing
  // there pushes it right.
  backspaceAt(col, row, attrs, { mode = 'overwrite' } = {}) {
    if (col < 1) return 0;
    const target = this.cells[cellIndex(col - 1, row, this.cols)]?.wide === 'trail' ? col - 2 : col - 1;
    const k = col - target;
    this.typing(() => {
      if (mode !== 'overwrite') this.shiftCells(row, col, -k, { paint: mode === 'insert' });
      else this.writeAt(target, row, typed(' ', attrs));
    });
    return k;
  },

  // Delete on a wide character takes all of it. It pulls the rest of the row left in every mode: its characters, and
  // in Insert mode its paint too.
  deleteAt(col, row, { mode = 'overwrite' } = {}) {
    const k = this.cells[cellIndex(col, row, this.cols)]?.wide === 'lead' ? 2 : 1;
    this.typing(() => this.shiftCells(row, col + k, -k, { paint: mode === 'insert' }));
  },

  // Lines and columns (Edit mode's Alt+arrows, Moebius's Insert Row and the rest): a line put in at row, pushing the lines
  // from there down, or taken out, pulling the ones below up; a column the same, right and left. Each moves everything the
  // picked layer has, and only that layer, as Insert typing moves a row (shiftCells with paint): every entry and the paint,
  // on the base every cell's pixels and pin (shiftBaseLines, shiftBaseColumns). The grid keeps its size, what's pushed past
  // the bottom or right edge goes, and the layer's memory of what typing pushed past the edge goes too (forgetPastEdge).
  // One undo step each, and in a room an edit like any other; the cursor stays where it is. False when refused: no cells
  // layer, a hidden one (with its toast), a line or column off the grid, or the base for an artist; paused, the guard's
  // undefined. Inside an art layer one too big is refused after it's made (commitArt, with its toast), and that's true.
  insertLine(row) { return lineStep(this, 'row', row, 1); },
  deleteLine(row) { return lineStep(this, 'row', row, -1); },
  insertColumn(col) { return lineStep(this, 'col', col, 1); },
  deleteColumn(col) { return lineStep(this, 'col', col, -1); },

  // A run of typing is one undo step (editRun).
  typing(fn) {
    if (refusedNoCells(this, { toast: false })) return;
    this.ensureLayer();
    this.editRun(() => {
      if (this._stroke && !this._stroke.typing) this._stroke.cursor = useWorkspaceStore().textCursor; // where undo puts it back
      fn();
    });
  },

  // A run of small edits as one undo step (typing; a shape option's key nudges, tools/vshape.js): fn's edit joins the
  // run's stroke, which stays open across them (its typing says it's a run's) and is committed after a pause, by any
  // other edit (beginEdit), or by undo/redo/save (commitPending). With fn changing nothing, the edit open now becomes a
  // run's.
  editRun(fn) {
    this._typingNow = true;
    try {
      this.beginEdit();
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

  // Move a row along from fromCol by delta cells (typing's Insert, Partial and Delete); what's pushed past the row's
  // end is remembered, and comes back when the row moves left again (pastEdge). Without paint (Partial, and Delete in
  // Overwrite), its characters of someone's own: paint stays where
  // it is, and so does what's paint to it (a paint block, a frozen cell: docs/model.md R1), a character moved onto it
  // taking its place. With paint (Insert), everything the layer has there: every entry, and the paint. On the base,
  // shiftBaseCells.
  shiftCells(row, fromCol, delta, { paint = false } = {}) {
    if (onBottom(this)) return this.shiftBaseCells(row, fromCol, delta, { paint });
    const stays = [];
    for (const [key, entry] of paint ? [] : this.editCells) {
      const at = parseKey(key);
      if (at.row === row && at.col >= fromCol + Math.min(delta, 0) && !ownEntry(entry, this.renderStyle)) stays.push([key, entry]);
    }
    const from = stays.length ? withoutCells(this.editCells, stays.map(([key]) => parseKey(key))) : this.editCells;
    let moved = shiftRow(from, row, fromCol, delta, this.cols);
    // Past the edge (pastEdge): a right shift's last cells are remembered, each with its paint when the paint moves too,
    // and a left shift brings back as many: with paint, the cell as it was; without, a character of someone's own alone.
    const { cols } = this, { was, keep } = pastEdge(this, row), back = [], cellAt = (col) => ({ c0: col, r0: row, c1: col, r1: row });
    if (delta > 0) {
      keep([...Array.from({ length: delta }, (_, i) => {
        const col = cols - delta + i, falls = col >= fromCol, entry = falls ? from.get(cellKey(col, row)) ?? null : null;
        const own = paint && falls && this.paintLayer?.hasPaintIn(cellAt(col)) ? this.paintLayer.copyCells(cellAt(col)) : null;
        return entry || own ? { entry, paint: own } : null;
      }), ...was]);
    } else if (was.length && fromCol >= 1) {
      was.slice(0, -delta).forEach((slot, i) => {
        const col = cols + delta + i;
        if (slot?.entry && (paint || ownEntry(slot.entry, this.renderStyle))) {
          if (moved === from) moved = new Map(from); // shiftRow moved nothing on the grid: the map is still the caller's
          moved.set(cellKey(col, row), slot.entry);
        }
        if (paint && slot?.paint) back.push({ col, paint: slot.paint });
      });
      keep(was.slice(-delta));
    }
    const span = paint && this.clipRect({ c0: Math.min(fromCol, fromCol + delta), r0: row, c1: cols - 1, r1: row });
    const painted = !!span && !!this.paintLayer?.hasPaintIn(span);
    if (moved === this.editCells && !painted && !back.length) return;
    const pixels = Array.from({ length: cols }, (_, x) => ({ x, y: 2 * row }));
    if (painted || back.length) {
      this.beginEdit();
      pixels.push(...pixels.map(({ x, y }) => ({ x, y: y + 1 })));
      this.noteDrawn(pixels);
      if (painted) {
        const tail = fromCol < cols && this.paintLayer.copyCells({ ...span, c0: fromCol });
        this.paintLayer.eraseCells(span);
        if (tail) this.paintLayer.pasteCells(tail, fromCol + delta, row, cols - fromCol, 1, span);
      }
      for (const { col, paint: cell } of back) this.paintLayer.pasteCells(cell, col, row, 1, 1);
      this.hasPaint = this.paintLayer.hasPaint;
    }
    const next = stays.length ? new Map(moved) : moved;
    for (const [key, entry] of stays) if (!next.has(key)) next.set(key, entry);
    if (next !== this.editCells) this.setEditCells(next, Array.from({ length: this.cols }, (_, col) => cellKey(col, row)));
    this.recomposeEdit(pixels, { composited: painted || back.length > 0 });
  },

  // A whole entry for a cell as the cell layer shows it: its own attributes, the rest frozen from
  // what shows under it the way the render style shows it: the base (bakedEntry) with the shown
  // cells layers below (below: the layer it's for, the one in use unless said) over it (reading.js:
  // lookUnder). Its own paint isn't part of it; it stays put. A color of its own drops the index the one under had (mergeEntry).
  completeAt(col, row, entry, below = this.editId) {
    const look = this.lookUnder(col, row, below);
    return entry ? mergeEntry(look, entry) : look;
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
    const pixels = [], keys = [], paintAt = clearPaint && paintReader(this.paintLayer, list.filter(({ attrs }) => attrs.bg === undefined));
    for (const { col, row, attrs } of list) {
      const key = cellKey(col, row);
      keys.push(key);
      const keepPaintBg = paintAt && attrs.bg === undefined && paintAt(col, 2 * row);
      const entry = mergeEntry(next.get(key), keepPaintBg ? { ...attrs, bg: this.underlyingAt(col, row, { evenHidden: true }).bg } : attrs);
      if (entry) next.set(key, entry);
      else next.delete(key);
      pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
    }
    this.noteDrawn(pixels);
    const erased = clearPaint && !!this.paintLayer?.hasPaint;
    if (erased) this.paintLayer.erase(pixels);
    for (const { col, row } of blanks) {
      const key = cellKey(col, row);
      keys.push(key);
      next.set(key, mergeEntry(next.get(key), { char: ' ' }));
      pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
    }
    this.setEditCells(next, keys);
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
  // (cells may be normalized, e.g. a background forced to black in ASCII mode). On the base, its halves. On a layer above
  // the lower group (not in the output canvas), its pixels as they show up to it, in stored colors.
  flipPaint(col, row) {
    if (onBottom(this)) return this.flipBase([{ col, row }]);
    if (this.editIsUpper) {
      const [top, bottom] = [2 * row, 2 * row + 1].map((y) => hex2rgb(this.rawColorAt(col, y, { upTo: this.editId })));
      return this.paintEditPixels([{ x: col, y: 2 * row, ...bottom, alpha: 1 }, { x: col, y: 2 * row + 1, ...top, alpha: 1 }]);
    }
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
    // On a movie it's the frame that changes: its cells and paint on the layer in use go, and a Blank one is cut off from
    // the layer's cells on the frames before it, so it stays empty there, whatever's drawn on them later; its kind, the
    // other layers and the shapes stay.
    if (this.hasFrames) {
      this.noteFrame();
      const { kind, changes, parts } = this.currentFrame, mine = (key) => !isShapeKey(key) && keyLayer(key).id === this.editId;
      const cut = kind === 'blank' && this.frame ? [[cutKey(this.editId), EMPTY_STATE]] : [];
      const cleared = { kind, changes: new Map([...[...changes].filter(([key]) => !mine(key)), ...cut]), parts };
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

// The paint at the top pixels of cells ([{ col, row }]) as pixelAt reads it, read in one go (a read a cell was 500k of
// them over a fill); null with no cells or no paint layer.
function paintReader(paint, cells) {
  if (!paint || !cells.length) return null;
  let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
  for (const { col, row } of cells) {
    c0 = Math.min(c0, col); c1 = Math.max(c1, col); r0 = Math.min(r0, row); r1 = Math.max(r1, row);
  }
  return paint.pixelsIn(c0, 2 * r0, c1, 2 * r1);
}

// A line or column step (insertLine and the others): refused as drawing on the layer is, then one step of its own.
function lineStep(project, axis, at, delta) {
  if (refusedNoCells(project)) return false;
  if (project.layerHidden(project.drawsOn)) { // as drawing on it is (tools: refusesHidden)
    toast(t('layers.hiddenToast'));
    return false;
  }
  project.commitPending(); // a run of typing is a step of its own
  if (onBottom(project)) {
    if (!(axis === 'row' ? project.shiftBaseLines(at, delta) : project.shiftBaseColumns(at, delta))) return false;
  } else {
    const moves = lineMoves(project, axis, at, delta);
    if (!moves.length) return false;
    project.ensureLayer();
    project.beginEdit();
    moveLayer(project, moves);
  }
  project.commitEdit();
  return true;
}

// A cells layer's entries and paint with lineMoves' moves made. Inside an art layer they're its drawing, which commitArt
// reads back (too big: refused there, and nothing changes).
function moveLayer(project, moves) {
  const paint = project.paintLayer, pixels = [];
  let painted = false;
  for (const { span, from, dx, dy } of moves) {
    for (let row = span.r0; row <= span.r1; row++) for (let x = span.c0; x <= span.c1; x++) pixels.push({ x, y: 2 * row }, { x, y: 2 * row + 1 });
    if (!paint?.hasPaintIn(span)) continue;
    painted = true;
    const block = from && paint.copyCells(from);
    paint.eraseCells(span);
    if (block) paint.pasteCells(block, from.c0 + dx, from.r0 + dy, from.c1 - from.c0 + 1, from.r1 - from.r0 + 1, span);
  }
  const next = moveCells(project.editCells, moves);
  if (next === project.editCells && !painted) return; // nothing moved: no step, and the memory past the edge stays
  forgetPastEdge(project);
  project.noteDrawn(pixels);
  if (painted) project.hasPaint = paint.hasPaint;
  project.editCells = next; // the whole map: the slice scans it, as for any edit that commits at once
  project.recomposeEdit(pixels, { composited: painted });
}

// The frozen cells (docs/model.md R3: Merge down's pinned conversion of the paint under them) among the cells the grid
// pixels touch lose their mark: paint written or erased there is paint again, converted as the layer converts it. With
// painted, the laid cells among them lose theirs too: a tinted laid character is someone's own (R1, R5).
// One look at each cell's entry, the map read once (not a store action a cell: over a fill's half a million cells that
// took half a second); a frozen cell is cleared, so it's laid no longer.
function unfreeze(project, pixels, { painted = false } = {}) {
  const entries = project.editCells;
  if (!entries.size) return;
  const frozen = [], laid = [];
  for (const cell of cellsOfPixels(pixels, project.cols, project.rows)) {
    const entry = entries.get(cellKey(cell.col, cell.row));
    if (isFrozen(entry)) frozen.push(cell);
    else if (painted && isLaid(entry)) laid.push(cell);
  }
  if (frozen.length) project.clearEditCells(frozen);
  if (laid.length) project.writeEditCells(laid.map((c) => ({ ...c, attrs: { laid: null } })));
}

// Whether the topmost thing under the layer in use at col, row is a shape's fill or stroke (not an art layer's character,
// which is someone's own): a shown vector layer's shape reaches the cell, with no shown cells layer's entry or paint
// between. A flat shape's cell has both halves one color, as a blank canvas's does, but it hides no character: it's
// converted pixels, as the picture's are, so Colors only lays paint there with no ▄ and the layer's Characters convert it
// (docs/model.md R5).
function shapeUnder(project, col, row) {
  if (onBottom(project) || project._artInside) return false;
  const { layers } = project, lower = project.lowerGroup.vectors, key = cellKey(col, row);
  for (let i = layers.findIndex((layer) => layer.id === project.editId) - 1; i > 0; i--) {
    const { id, kind, hidden } = layers[i];
    if (hidden) continue;
    if (kind === 'vector') {
      const char = (lower.includes(id) ? project._shapeLayer : project._upperShapes.get(id))?.charAt(col, row);
      if (char !== undefined) return char === null;
    } else if (project.cellsOf(id).has(key) || project.paintOf(id)?.pixelAt(col, 2 * row) || project.paintOf(id)?.pixelAt(col, 2 * row + 1)) return false;
  }
  return false;
}

// Whether the cell at col, row shows no character in ANSI, as a stroke first reaching it reads it: in ANSI as it's drawn
// (cell), or in any style its two halves one color as stored up to the layer in use (the base alone when it's picked),
// which ANSI draws as no character. So which view or art style a stroke is laid in doesn't change the cells it makes ▄.
// Not a cell a shape under the layer covers (shapeUnder).
function showsNoChar(project, col, row, cell) {
  if (shapeUnder(project, col, row)) return false;
  if (project.renderStyle === 'ansi' && !showsChar(cell)) return true;
  const look = onBottom(project) ? { bg: project.baseColorAt(col, 2 * row), fg: project.baseColorAt(col, 2 * row + 1) } : project.underlyingAt(col, row, { evenHidden: true });
  return look.bg.toLowerCase() === look.fg.toLowerCase();
}

// A ▄ written on the base at col, row (Half-block's, Write block glyphs', Colors only's), in the cell's own colors as ANSI
// shows them, whatever the art style: Color ASCII and Monochrome ASCII show a character there on black or in no colors
// at all, and a ▄ written as it showed stored a black top pixel under paint that never reached it. A pinned character's
// block takes its background in both (blockOver: a solid glyph, a ▄ pinned already among them, keeps its halves); a
// cell the converter drew keeps the halves it had (docs/model.md R5).
function baseBlock(project, col, row) {
  const own = bakedEntry('ansi', project.baseCellAt(col, row));
  const { fg, bg, fgIndex, bgIndex } = project.baseRecords.pins.has(cellKey(col, row)) ? blockOver(own) : own; // with the 256-color indexes they carry
  return { char: '▄', fg, bg, fgIndex, bgIndex };
}

// Cells written on the base ([{ col, row, attrs }], attrs as writeEditCells takes them: undefined keeps, null clears):
// each as it then shows, its own attributes over the base's look (completeAt), its character pinned; the half of a wide
// character one breaks becomes a space, as on a cells layer.
function writeOnBottom(project, list) {
  const own = (attrs) => Object.fromEntries(Object.entries(attrs).filter(([, value]) => value != null));
  const blanks = overwritesAll(project.cells, project.cols, list.map(({ col, row, attrs }) => ({ col, row, char: attrs.char })));
  const reads = readsOf(project); // the looks, all read before any is written
  project.writeBaseCells([...list, ...blanks.map((cell) => ({ ...cell, attrs: { char: ' ' } }))].map(({ col, row, attrs }) => ({ col, row, ...colored(reads, col, row, reads.completeAt(col, row, own(attrs))) })));
}

// Monochrome ASCII's look of a base cell is its character alone (reading.js baseLook), so a cell written there with no
// colors of its own takes the halves it shows: a pin's look (white on black, R11), else its pixels (a converted cell's,
// a ▄ pin's, which are its look outside ANSI: Renderer.pinAt). Left without, writeBaseCells wrote it black: the Brush's
// ▄ over a cell it had painted went in black, and a soft stroke over white painted before showed a black rim.
function colored(project, col, row, entry) {
  if (entry.fg !== undefined || entry.bg !== undefined) return entry;
  const [bg, fg] = project.renderer.baseLook(col, row, project.processParams)?.map(rgb2hex) ?? [project.baseColorAt(col, 2 * row), project.baseColorAt(col, 2 * row + 1)];
  return { ...entry, bg, fg };
}
