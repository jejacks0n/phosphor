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
import { unitsOf } from '@/lib/MagicWand.js';

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

  // Flip what's selected (op 'h', 'v') or turn it a quarter clockwise ('cw'), on the chosen layers:
  // its cells move, their characters turn with them (TurnChars), and its paint and base turn too. A
  // turned block is h x w cells from the same top-left corner, moved back onto the grid where it
  // would run off it. It floats, as a move does (floatSelection): turned while it floats, it's the
  // same run, so what it covers comes back when it moves on, and the run is one undo step. Returns
  // where it landed (clipped).
  turnSelection(rect, layers, op) {
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

  // Delete in the Magic Wand's selection (workspace.wand): the edit layer goes from its cells (or
  // pixels), as the Eraser's Edit does: in the pixel view, a ▄ there only to show paint (Half-block)
  // goes with the last of its paint. One undo step.
  deleteInWand(wand) {
    const units = unitsOf(wand.mask, wand.width);
    if (wand.view === 'output') {
      const cells = units.map(({ x, y }) => ({ col: x, row: y }));
      this.eraseEditPixels(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
      this.clearEditCells(cells);
    } else {
      const blocks = cellsOfPixels(units, this.cols, this.rows).filter(({ col, row }) => isPaintBlock(this.editCellAt(col, row)) && this.cellHasPaint(col, row));
      this.eraseEditPixels(units);
      this.clearEditCells(blocks.filter(({ col, row }) => !this.cellHasPaint(col, row)));
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

// A copied block (copySelection) flipped or turned (turnSelection's op): every cell's entry and pin
// from the cell that lands there, their characters turned, and the paint and base pictures with them.
function turnBlock(block, op) {
  const { w, h } = block;
  const out = op === 'cw' ? { w: h, h: w } : { w, h };
  const source = (x, y) => (op === 'h' ? [w - 1 - x, y] : op === 'v' ? [x, h - 1 - y] : [y, h - 1 - x]);
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

// A block's picture flipped or turned; turned, it's stretched to fit the turned cells (a cell is twice
// as tall as it's wide, and keeps its shape).
function turnCanvas(canvas, op) {
  const out = document.createElement('canvas');
  [out.width, out.height] = op === 'cw' ? [canvas.height / 2, canvas.width * 2] : [canvas.width, canvas.height];
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = false;
  if (op === 'h') ctx.setTransform(-1, 0, 0, 1, out.width, 0);
  if (op === 'v') ctx.setTransform(1, 0, 0, -1, 0, out.height);
  if (op === 'cw') ctx.setTransform(0, 1, -1, 0, out.width, 0);
  ctx.drawImage(canvas, 0, 0, op === 'cw' ? out.height : out.width, op === 'cw' ? out.width : out.height);
  return out;
}
