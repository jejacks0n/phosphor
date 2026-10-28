// The Select tool's operations: copy, delete, paste and move, each one undo step (none at all when
// nothing changes), and a moved or pasted block floating until the selection is set down. Owns
// _float (the move in progress).
//
// They act on the Select tool's layers: Layers = { base, edit }, where Edit is everything drawn
// (edit cells and paint, stored apart but one thing to the user), and Base is the base's colors and
// pins (the converter's own characters belong to their cells and stay). Each layer moves, copies
// and pastes as itself. Block = { w, h, cells?: (Entry | null)[], paint?: canvas, base?: { pixels:
// canvas (at scale, basePixelsOf), scale, colors: canvas (its stored colors, a grid pixel each), pins:
// (char | null)[] } }. Rects are clipped to the grid.
import { withPins, withoutPins } from '@/document/baseRecords.js';
import { cellKey, withoutCells, rectCells, pasteBlock, mergeEntry, isPaintBlock } from '@/document/editCells.js';
import { overwritesAll } from '@/document/wideChars.js';
import { ctx2d } from '@/lib/Canvas.js';
import { cellsOfPixels, charRowsOf } from '@/lib/Cells.js';
import { cellWidth } from '@/lib/CharWidth.js';
import { hex2rgb } from '@/lib/ColorUtils.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { boundsOf } from '@/store/project/shared.js';
import { turnChar } from '@/lib/TurnChars.js';
import { toRaw } from 'vue';
import { unitsOf, wandIn } from '@/lib/MagicWand.js';

export const selectionActions = {
  copySelection(rect, { base, edit }) {
    this.ensureLayer();
    const block = { w: rect.c1 - rect.c0 + 1, h: rect.r1 - rect.r0 + 1 };
    const cells = rectCells(rect);
    if (edit) {
      block.cells = cells.map(({ col, row }) => this.editCellAt(col, row) ?? null);
      if (this.paintLayer) block.paint = this.paintLayer.copyCells(rect);
    }
    if (base) {
      block.base = {
        pixels: this.basePixelsOf(rect), scale: this.baseLayer.scale, colors: this.baseColorsOf(rect),
        pins: cells.map(({ col, row }) => this.baseRecords.pins.get(cellKey(col, row)) ?? null),
      };
    }
    return block;
  },

  // The base over a cell rect at the base layer's scale: the processed picture (the Renderer's,
  // every pixel the converter made, before the color adjustments and the palette) with the base's
  // own pixels over it. Moved or pasted, it looks as it did here.
  basePixelsOf({ c0, r0, c1, r1 }) {
    const k = this.baseLayer.scale;
    const x = c0 * k, y = 2 * r0 * k, w = (c1 - c0 + 1) * k, h = 2 * (r1 - r0 + 1) * k;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = ctx2d(out);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const processed = this.renderer.processed;
    if (processed) { // at its own scale (the same, unless the grid changed and it's not rendered yet)
      const ps = processed.scale / k;
      ctx.drawImage(processed.canvas, x * ps, y * ps, w * ps, h * ps, 0, 0, w, h);
    }
    ctx.drawImage(this.baseLayer.canvas, x, y, w, h, 0, 0, w, h);
    return out;
  },

  // The base's stored colors over a cell rect, a grid pixel per pixel: what a block pastes as into a
  // base layer at another scale (another document, or after a rescale), where its pixels would be
  // resampled and could snap to other colors.
  baseColorsOf({ c0, r0, c1, r1 }) {
    const w = c1 - c0 + 1, h = 2 * (r1 - r0 + 1);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = ctx2d(out), pixels = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const { r, g, b } = hex2rgb(this.baseColorAt(c0 + x, 2 * r0 + y));
        pixels.data.set([r, g, b, 255], (y * w + x) * 4);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    return out;
  },

  // Delete (and Cut) on a block that's floating takes away the block, not what it's over: the move or
  // paste is undone and, for a move, the place it came from is cleared (one undo step), and the
  // selection goes with the block. Otherwise what's selected is deleted.
  deleteSelection(rect, layers) {
    const run = this._float;
    if (run?.recorded && run.version === this.history.version && toRaw(rect) === toRaw(run.landed)) {
      this._float = null;
      this.undo();
      if (!run.paste) this.selectionEdit([run.from], () => this.deleteIn(run.from, run.layers));
      useWorkspaceStore().selection = null;
      return;
    }
    this.selectionEdit([rect], () => this.deleteIn(rect, layers));
  },

  // Returns the pasted rect (clipped), or null when it's all off the grid.
  // A paste starts a float (floatSelection): moving it right after re-pastes it, so what it first
  // landed on comes back. recorded: whether it was an undo step (a paste that changes nothing isn't).
  pasteSelection(block, col, row) {
    const paste = (c, r) => {
      const rect = this.clipRect({ c0: c, r0: r, c1: c + block.w - 1, r1: r + block.h - 1 });
      if (rect) this.selectionEdit([rect], () => this.pasteAt(block, c, r));
      return rect;
    };
    const version = this.history.version;
    const landed = paste(col, row);
    this._float = landed && { paste: true, block, redo: (dc, dr) => paste(col + dc, row + dr), from: landed, layers: null, dc: 0, dr: 0, landed, version: this.history.version, recorded: this.history.version !== version };
    return landed;
  },

  // Stamp (Moebius's S while moving, and C on a selection): a copy of what's selected stays where it
  // is, and the block floats on from there as a paste of it, so moving it leaves the copy behind.
  stampSelection(rect, layers) {
    this.commitPending();
    const landed = this.pasteSelection(this.copySelection(rect, layers), rect.c0, rect.r0);
    if (this._float) this._float.stamped = true;
    return landed;
  },

  // A selection's contents float while you move them: every move of the same selection (a drag, an
  // arrow-key nudge), and a paste with the moves after it, is one change from where it started,
  // redone with each move (the last one undone first). What's under the path is only covered where
  // the block comes to rest, and the run is one undo step. The run ends, leaving the block where it
  // is, when the selection is cleared or replaced (Escape, Deselect, a new selection: tied to the
  // selection object itself, so reselecting the same cells starts over), its layers change, or
  // anything else is recorded. Returns where it landed (clipped), or null when it left the grid.
  floatSelection(rect, layers, dc, dr) {
    this.commitPending(); // text typed onto the block (a paste) is recorded: the next move starts a new run
    const run = this._float;
    const sameRun = run && run.version === this.history.version && toRaw(rect) === toRaw(run.landed)
      && (!run.layers || (run.layers.base === layers.base && run.layers.edit === layers.edit));
    const current = sameRun ? run : { redo: (c, r) => this.moveSelection(rect, layers, c, r), from: rect, layers: { ...layers }, dc: 0, dr: 0 };
    const offset = { dc: current.dc + dc, dr: current.dr + dr };
    if (sameRun && run.recorded) this.undo();
    if (!current.paste && !current.turned && !offset.dc && !offset.dr) { // back where the move started: nothing moved, nothing recorded
      this._float = null;
      return current.from;
    }
    const version = this.history.version;
    const landed = current.redo(offset.dc, offset.dr);
    this._float = landed && { ...current, ...offset, landed, version: this.history.version, recorded: this.history.version !== version };
    return landed;
  },

  // Flip what's selected (op 'h', 'v') or rotate it 90° clockwise ('cw'), on the chosen layers. A
  // flip moves its cells, their characters turning with them (TurnChars), and its paint and base flip
  // too. Rotate turns only pixels, by the picture's shape (rotateBlock), and does nothing while the
  // selection has characters (hasCharacters); the turned block starts at the same top-left corner,
  // moved back onto the grid where it would run off it. It floats, as a move does (floatSelection):
  // turned while it floats, it's the same run, so what it covers comes back when it moves on, and the
  // run is one undo step. Returns where it landed (clipped).
  turnSelection(rect, layers, op) {
    if (op === 'cw' && this.hasCharacters(rect, layers)) return rect;
    this.commitPending();
    const run = this._float;
    const sameRun = run && run.version === this.history.version && toRaw(rect) === toRaw(run.landed)
      && (!run.layers || (run.layers.base === layers.base && run.layers.edit === layers.edit));
    if (sameRun && run.recorded) this.undo();
    // Lifted from (cleared each time it lands; none for a paste), and the block as it floats.
    const lifted = sameRun ? (run.paste ? null : run.from) : rect;
    const liftedLayers = sameRun ? run.layers : { ...layers };
    const block = turnBlock(sameRun && run.block ? run.block : this.copySelection(lifted, liftedLayers), op);
    const col = Math.max(0, Math.min(rect.c0, this.cols - block.w));
    const row = Math.max(0, Math.min(rect.r0, charRowsOf(this.rows) - block.h));
    const place = (dc, dr) => {
      const c = col + dc, r = row + dr;
      const landed = this.clipRect({ c0: c, r0: r, c1: c + block.w - 1, r1: r + block.h - 1 });
      this.selectionEdit([lifted, landed].filter(Boolean), () => {
        if (lifted) this.deleteIn(lifted, liftedLayers);
        this.pasteAt(block, c, r, lifted);
      });
      return landed;
    };
    const version = this.history.version;
    const landed = place(0, 0);
    this._float = landed && {
      paste: !lifted, turned: true, block, redo: place, from: lifted ?? landed, layers: lifted ? liftedLayers : null,
      dc: 0, dr: 0, landed, version: this.history.version, recorded: this.history.version !== version,
    };
    return landed;
  },

  // Whether what's in rect, on the chosen layers, has characters Rotate can't turn: anything on the
  // edit layer but a Half-block's ▄, or a pin on the base but ▄ (both only show their cell's pixels).
  hasCharacters(rect, { base, edit }) {
    return rectCells(rect).some(({ col, row }) => {
      const key = cellKey(col, row), entry = edit && this.editCells.get(key), pin = base && this.baseRecords.pins.get(key);
      return (entry && !isPaintBlock(entry)) || (pin && pin !== '▄');
    });
  },

  // Delete in the Magic Wand's selection (workspace.wand), in `view` (the ANSI view's cells or the
  // pixel view's grid pixels), on the layers lit, as the Eraser does: Edit takes the drawing away (in
  // the pixel view, a ▄ there only to show paint (Half-block) goes with the last of its paint); Base
  // turns the picture black (in the ANSI view whole cells, with a pinned space). One undo step.
  deleteInWand(made, view = made.view, { base, edit } = { base: false, edit: true }) {
    const wand = wandIn(made, view, this.rows);
    const units = unitsOf(wand.mask, wand.width);
    const cells = view === 'output' ? units.map(({ x, y }) => ({ col: x, row: y })) : null;
    if (edit && cells) {
      this.eraseEditPixels(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
      this.clearEditCells(cells);
    } else if (edit) {
      const blocks = cellsOfPixels(units, this.cols, this.rows).filter(({ col, row }) => isPaintBlock(this.editCellAt(col, row)) && this.cellHasPaint(col, row));
      this.eraseEditPixels(units);
      this.clearEditCells(blocks.filter(({ col, row }) => !this.cellHasPaint(col, row)));
    }
    if (base) cells ? this.eraseBase(cells) : this.eraseBasePixels(units);
    this.commitEdit();
  },

  // Recolor what's selected (made: the wand's selection or a Select rect), on the layers lit, one
  // undo step. In the ANSI view, colors { fg?, bg? } go to every cell: on Base, bg to its top pixel
  // and fg to its bottom one (the ASCII styles show the pair's average, so fg to both); on Edit, as
  // edit cells, their characters kept. In the pixel view, colors.fg goes to every pixel: the picture
  // on Base, paint on Edit.
  recolorSelection(made, view, { base, edit }, { fg, bg }) {
    let units;
    if (made.mask) {
      const wand = wandIn(made, view, this.rows);
      units = unitsOf(wand.mask, wand.width);
    } else {
      const cells = rectCells(made);
      units = view === 'output' ? cells.map(({ col, row }) => ({ x: col, y: row })) : cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
    }
    if (view === 'output') {
      if (edit) this.writeEditCells(units.map(({ x, y }) => ({ col: x, row: y, attrs: { ...(fg ? { fg } : {}), ...(bg ? { bg } : {}) } })), { clearPaint: true });
      if (base) {
        const ascii = this.renderStyle === 'ascii' || this.renderStyle === 'colorAscii';
        const top = ascii ? fg : bg;
        this.writeBase(units.flatMap(({ x, y }) => [top && { x, y: 2 * y, hex: top }, fg && { x, y: 2 * y + 1, hex: fg }].filter(Boolean)));
      }
    } else if (fg) {
      if (base) this.writeBase(units.map(({ x, y }) => ({ x, y, hex: fg })));
      if (edit) this.paintEditPixels(units.map(({ x, y }) => ({ x, y, ...hex2rgb(fg), alpha: 1 })));
    }
    this.commitEdit();
  },

  // Lift, clear the source, drop dc/dr away (copied first, so an overlapping move keeps everything).
  // Returns where it landed (clipped), or null when it left the grid.
  moveSelection(rect, layers, dc, dr) {
    if (!dc && !dr) return rect;
    const block = this.copySelection(rect, layers);
    const col = rect.c0 + dc, row = rect.r0 + dr;
    const landed = this.clipRect({ c0: col, r0: row, c1: rect.c1 + dc, r1: rect.r1 + dr });
    this.selectionEdit(landed ? [rect, landed] : [rect], () => {
      this.deleteIn(rect, layers);
      this.pasteAt(block, col, row, rect);
    });
    return landed;
  },

  // The parts of the selection operations, inside selectionEdit.
  deleteIn(rect, { base, edit }) {
    if (edit) {
      this.editCells = withoutCells(this.editCells, rectCells(rect));
      this.paintLayer.eraseCells(rect);
    }
    if (base) this.eraseBase(rectCells(rect));
  },

  // A character pasted over half of a wide character turns its other half into a space, as typing
  // does; not in the rect a move just vacated (the cells there still show what was moved).
  pasteAt(block, col, row, vacated = null) {
    if (block.px % 2) block = withHalfRowUnder(this, block, col, row);
    if (block.cells) {
      const written = block.cells.flatMap((entry, i) => (entry ? [{ col: col + (i % block.w), row: row + Math.floor(i / block.w), char: entry.char }] : []));
      const inVacated = ({ col: c, row: r }) => vacated && c >= vacated.c0 && c <= vacated.c1 && r >= vacated.r0 && r <= vacated.r1;
      const blanks = overwritesAll(this.cells, this.cols, written).filter((cell) => !inVacated(cell));
      this.editCells = pasteBlock(this.editCells, { w: block.w, h: block.h, entries: block.cells }, col, row, this.cols, charRowsOf(this.rows));
      if (blanks.length) {
        this.editCells = new Map(this.editCells);
        for (const { col: c, row: r } of blanks) this.editCells.set(cellKey(c, r), mergeEntry(this.editCells.get(cellKey(c, r)), { char: ' ' }));
      }
    }
    if (block.paint) this.paintLayer.pasteCells(block.paint, col, row, block.w, block.h, this.gridRect());
    if (block.base) this.pasteBase(block, col, row);
  },

  // A block's base at (col, row): its pixels into the base layer, and its pins (a cell with none
  // takes the converter's character there).
  pasteBase({ w, h, base }, col, row) {
    const rect = this.clipRect({ c0: col, r0: row, c1: col + w - 1, r1: row + h - 1 });
    if (!rect) return;
    this.baseLayer.pasteCells(base.scale === this.baseLayer.scale ? base.pixels : base.colors, col, row, w, h, rect);
    const pins = base.pins.map((char, i) => ({ col: col + (i % w), row: row + Math.floor(i / w), char }))
      .filter(({ col: c, row: r }) => c >= rect.c0 && c <= rect.c1 && r >= rect.r0 && r <= rect.r1);
    this.setBaseRecords(withPins(withoutPins(this.baseRecords, pins.filter(p => !p.char)), pins.filter(p => p.char)));
  },

  // A selection made, changed or dropped (the Select tool's rectangle, the Magic Wand's, Deselect):
  // change(workspace) sets workspace.selection and/or .wand, and it's one undo step that isn't a
  // change to the document (nothing when the selection stays as it was). before: the selection to go
  // back to, when it changed already (a drag). A move or paste it ends is kept with it (undo).
  changeSelection(change, before = null) {
    const workspace = useWorkspaceStore();
    this.commitPending();
    before ??= { selection: workspace.selection, wand: workspace.wand };
    const float = this._float?.version === this.history.version ? this._float : null;
    change?.(workspace);
    const after = { selection: workspace.selection, wand: workspace.wand };
    if (toRaw(after.selection) === toRaw(before.selection) && toRaw(after.wand) === toRaw(before.wand)) return;
    const apply = (side) => Object.assign(workspace, side);
    this.history.push({ undo: () => apply(before), redo: () => apply(after), selectionOnly: true, float, bytes: after.wand?.mask.length ?? 0 });
    this.historyVersion = this.history.version;
  },

  // One undo step for a selection operation's changes (cells, paint, base pixels, pins); the cells in
  // rects recompose, and a column either side (a wide character the edit broke).
  selectionEdit(rects, change) {
    this.ensureLayer();
    this.beginEdit();
    change();
    this.hasPaint = this.paintLayer?.hasPaint ?? false;
    const pixels = rects.flatMap(rect => rectCells({ ...rect, c0: Math.max(0, rect.c0 - 1), c1: Math.min(this.cols - 1, rect.c1 + 1) })).map(({ col, row }) => ({ x: col, y: 2 * row }));
    this.composite({ rect: boundsOf(pixels) }); // whole cells: both pixel rows
    this.recompose(pixels);
    this.commitEdit();
  },
};

// A copied block (copySelection) flipped (turnSelection's op 'h' or 'v'): every cell's entry and pin
// from the cell that lands there, their characters turned, and the paint and base pictures with them.
// Rotated ('cw'): rotateBlock.
function turnBlock(block, op) {
  if (op === 'cw') return rotateBlock(block);
  const { w, h } = block;
  const out = { w, h, px: block.px };
  const source = (x, y) => (op === 'h' ? [w - 1 - x, y] : [x, h - 1 - y]);
  const turned = (list, turn) => {
    const cells = Array.from({ length: out.w * out.h }, (_, i) => {
      const [x, y] = source(i % out.w, Math.floor(i / out.w));
      return turn(list[y * w + x]);
    });
    // Flipped across, a wide character lands on the cell it covered (its trail): it moves back one.
    if (op === 'h') {
      for (let i = 0; i < cells.length; i++) {
        const char = typeof cells[i] === 'string' ? cells[i] : cells[i]?.char;
        if (i % out.w && char && cellWidth(char) === 2) [cells[i - 1], cells[i]] = [cells[i], cells[i - 1]];
      }
    }
    return cells;
  };
  if (block.cells) out.cells = turned(block.cells, (e) => (e?.char && !isPaintBlock(e) ? { ...e, char: turnChar(e.char, op) } : e));
  if (block.paint) out.paint = turnCanvas(block.paint, op);
  if (block.base) {
    const { pixels, scale, colors, pins } = block.base;
    out.base = { pixels: turnCanvas(pixels, op), scale, colors: turnCanvas(colors, op), pins: turned(pins, (char) => char && turnChar(char, op)) };
  }
  return out;
}

// A block's picture flipped ('h', 'v') or rotated 90° clockwise ('cw'), pixel for pixel.
function turnCanvas(canvas, op) {
  const out = document.createElement('canvas');
  [out.width, out.height] = op === 'cw' ? [canvas.height, canvas.width] : [canvas.width, canvas.height];
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = false;
  if (op === 'h') ctx.setTransform(-1, 0, 0, 1, out.width, 0);
  if (op === 'v') ctx.setTransform(1, 0, 0, -1, 0, out.height);
  if (op === 'cw') ctx.setTransform(0, 1, -1, 0, out.width, 0);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

// A block rotated 90° clockwise by its picture's shape: W x P grid pixels (a cell is one wide and two
// tall; P is 2h, or one less for a block rotated from an odd width) turn into P x W, so the block is P
// cells across and W pixel rows down. When W is odd its last row's bottom half isn't the block's
// (px marks it; pasteAt fills it from what's under). Only pixels turn (no characters: hasCharacters);
// a Half-block's ▄ (an edit cell or a pin) goes to each cell showing a pixel from one of its cells,
// an edit cell's only where that cell has paint (it's there to show it).
function rotateBlock(block) {
  const W = block.w, P = block.px ?? 2 * block.h;
  const out = { w: P, h: Math.ceil(W / 2), px: W };
  // Turned pixel (X, Y) is source pixel (Y, P - 1 - X): a turned cell's pixels come from one source column.
  const from = (list) => Array.from({ length: out.w * out.h }, (_, i) => {
    const col = i % out.w, row = Math.floor(i / out.w), y = P - 1 - col;
    return [2 * row, 2 * row + 1].filter((x) => x < W).map((x) => list[Math.floor(y / 2) * W + x]).find(Boolean) ?? null;
  });
  if (block.paint) out.paint = turnCanvas(block.paint, 'cw');
  if (block.cells) {
    const painted = out.paint && paintedCells(out.paint, out.w, out.h);
    out.cells = from(block.cells).map((entry, i) => (entry && painted?.[i] ? entry : null));
  }
  if (block.base) {
    const { pixels, scale, colors, pins } = block.base;
    out.base = { pixels: turnCanvas(pixels, 'cw'), scale, colors: turnCanvas(colors, 'cw'), pins: from(pins) };
  }
  return out;
}

// Which of a block picture's w x h cells have any paint.
function paintedCells(canvas, w, h) {
  const k = canvas.width / w, out = new Array(w * h).fill(false);
  const { data } = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (!data[i]) continue;
    const p = (i - 3) / 4, x = p % canvas.width, y = (p - x) / canvas.width;
    out[Math.floor(y / (2 * k)) * w + Math.floor(x / k)] = true;
  }
  return out;
}

// A rotated block an odd number of pixel rows tall (rotateBlock), whole cells for pasting at (col,
// row): the bottom half of its last row takes what's there now (pixels, edit cells, pins), so
// pasting keeps it as it was.
function withHalfRowUnder(project, block, col, row) {
  const r = row + block.h - 1, last = { c0: col, r0: r, c1: col + block.w - 1, r1: r };
  const fill = (canvas, under) => {
    const k = canvas.width / block.w, out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height + k;
    const ctx = ctx2d(out);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(under, 0, under.height / 2, under.width, under.height / 2, 0, canvas.height, out.width, k);
    ctx.drawImage(canvas, 0, 0);
    return out;
  };
  const keep = (list, at) => list.map((v, i) => v ?? (Math.floor(i / block.w) === block.h - 1 ? at(cellKey(col + (i % block.w), r)) ?? null : null));
  const out = { ...block, px: 2 * block.h };
  if (block.cells) out.cells = keep(block.cells, (key) => project.editCells.get(key));
  if (block.paint) out.paint = fill(block.paint, project.paintLayer.copyCells(last));
  if (block.base) {
    const { pixels, colors, pins } = block.base;
    out.base = { ...block.base, pixels: fill(pixels, project.basePixelsOf(last)), colors: fill(colors, project.baseColorsOf(last)), pins: keep(pins, (key) => project.baseRecords.pins.get(key)) };
  }
  return out;
}
