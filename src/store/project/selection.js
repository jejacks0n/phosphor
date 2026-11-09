// The Select tool's operations: copy, delete, paste and move, each one undo step (none at all when
// nothing changes), and a moved or pasted block floating until the selection is set down. Owns
// _float (the move in progress).
//
// They act on layers by id, bottom first (workspace.selectionIds: every shown cells layer, through layersFor): a cells
// layer's cells and paint (stored apart but one thing to the user), and the base's colors and pins (the converter's own
// characters belong to their cells and stay). Block = { w, h, px?, parts: [{ id, cells: (Entry | null)[], paint?: canvas }],
// base?: { pixels: canvas (at scale, basePixelsOf), scale, colors: canvas (its stored colors, a grid pixel each), pins:
// (char | null)[] }, looks?: Entry[] (with base: each cell as the base showed it, completeAt), shown?: (Entry | null)[],
// shownAt?: number }: a part per cells layer; shown (Copy's) is what shapes on shown vector layers show there, as exact
// cells, laid over the parts before shownAt. A move, Delete, a flip or turn and a recolor act on each layer as itself, in
// one selectionEdit (one undo step) and through onLayer (one swap in and out of each layer that isn't in use): each part
// lands back on its own layer, and shapes stay whole where they are. A paste lands on the layer in use as one layer
// (flatBlock), on top of what's drawn there: its picture as cells looking as it did (asCells), each part over the one
// under it, the shown cells over those; on the base, as drawing there does. A block made elsewhere (a Moebius block, an
// older tab's) is { w, h, cells?, paint? }: one layer's. Rects are clipped to the grid.
import { cellKey, withoutCells, rectCells, pasteBlock, mergeEntry, isPaintBlock } from '@/document/editCells.js';
import { overwritesAll } from '@/document/wideChars.js';
import { ctx2d } from '@/lib/Canvas.js';
import { cellIndex, cellsOfPixels, charRowsOf } from '@/lib/Cells.js';
import { cellWidth } from '@/lib/CharWidth.js';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { boundsOf, onBottom, over, refusedNoCells } from '@/store/project/shared.js';
import { withPins, withoutPins } from '@/document/baseRecords.js';
import { turnChar } from '@/lib/TurnChars.js';
import { toRaw } from 'vue';
import { unitsOf, wandIn } from '@/lib/MagicWand.js';

// A float's moves take the last one back at once, which an artist can only do while it hasn't gone out
// (sharing.js): those are held. floated marks what's in a float's move; canTakeBack says the run can go on
// (steps: whether it has steps to take back).
const floated = (action) => function (...args) {
  this._floating = true;
  try {
    return action.apply(this, args);
  } finally {
    this._floating = false;
  }
};
const canTakeBack = (project, run, steps = run.recorded) => !steps || project._sharing?.role !== 'artist' || !!project._sharing.held;
const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

// Whether id is the base itself: inside an art layer the one id there is (layersFor) is its drawing's, whatever's in use.
const isBase = (project, id) => id === 'base' && !project._artInside;

// fn(id) for each layer of ids, bottom first, inside the open edit: a cells layer with its data in the edit layer's fields
// (onLayer), the base as it is (fn writes it itself).
function eachLayer(project, ids, fn) {
  for (const id of ids) {
    if (isBase(project, id)) fn(id);
    else project.onLayer(id, () => fn(id));
  }
}

export const selectionActions = {
  // shapes: the cells shapes on shown vector layers show in rect come too, as shown (a move's block leaves them).
  copySelection(rect, ids, { shapes = true } = {}) {
    this.ensureLayer();
    const block = { w: rect.c1 - rect.c0 + 1, h: rect.r1 - rect.r0 + 1, parts: [] };
    const cells = rectCells(rect);
    for (const id of ids) {
      if (isBase(this, id)) {
        block.base = {
          pixels: this.basePixelsOf(rect), scale: this.baseLayer.scale, colors: this.baseColorsOf(rect),
          pins: cells.map(({ col, row }) => this.baseRecords.pins.get(cellKey(col, row)) ?? null),
        };
        block.looks = cells.map(({ col, row }) => this.completeAt(col, row, undefined, 'base'));
        continue;
      }
      const own = this.cellsOf(id), paint = this.paintOf(id);
      block.parts.push({ id, cells: cells.map(({ col, row }) => own.get(cellKey(col, row)) ?? null), ...(paint && { paint: paint.copyCells(rect) }) });
    }
    const shown = shapes && !this._artInside && shownByShapes(this, cells);
    if (shown) Object.assign(block, { shown, shownAt: block.parts.length });
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

  // Delete (and Cut) on a block that's floating takes away the block, not what it's over: the move, or
  // the paste and its moves, are undone and, for a move, the place it came from is cleared (one undo
  // step), and the selection goes with the block. Otherwise what's selected is deleted.
  deleteSelection(rect, ids) {
    ids = this.layersFor(ids);
    const run = this._float;
    // Its steps: a move's, or a paste's and the moves after it.
    const steps = run?.version === this.history.version && toRaw(rect) === toRaw(run.landed) ? Number(!!run.recorded) + Number(!!(run.paste && run.pasted)) : 0;
    if (steps && canTakeBack(this, run, steps)) {
      floated(() => { for (let i = 0; i < steps; i++) this.undo(); }).call(this);
      this._float = null;
      if (!run.paste) this.selectionEdit([run.from], () => this.deleteIn(run.from, run.layers));
      useWorkspaceStore().selection = null;
      return;
    }
    this.selectionEdit([rect], () => this.deleteIn(rect, ids));
  },

  // Returns the pasted rect (clipped), or null when it's all off the grid.
  // A paste is one undo step, and starts a float (floatSelection) whose moves are another: each lifts
  // the block off what it was pasted on, which comes back as it was (covered), and lands it again. So
  // undo after moving it puts it back where it was pasted, still floating, and undo again takes it away.
  // It lands on the layer in use (to), and its moves stay there whichever is picked meanwhile.
  // pasted: whether the paste was an undo step (one that changes nothing isn't).
  pasteSelection: floated(function (block, col, row) {
    if (this._artInside && block.base) block = { ...block, base: null, looks: null }; // inside an art layer, only it's drawn on (layersFor)
    if (refusedNoCells(this)) return null; // a paste lands on the cells layer in use
    this.ensureLayer();
    const to = this.editId;
    const rectAt = (c, r) => this.clipRect({ c0: c, r0: r, c1: c + block.w - 1, r1: r + block.h - 1 });
    const landed = rectAt(col, row);
    if (!landed) {
      this._float = null;
      return null;
    }
    const under = covered(this, landed);
    const version = this.history.version;
    this.selectionEdit([landed], () => this.pasteAt(flatBlock(block), col, row));
    const pasted = this.history.version !== version;
    const redo = (dc, dr) => {
      const rect = rectAt(col + dc, row + dr);
      this.selectionEdit([under.rect, rect].filter(Boolean), () => this.onLayer(to, () => {
        uncover(this, under);
        if (rect) this.pasteAt(flatBlock(block), col + dc, row + dr);
      }));
      return rect;
    };
    const start = { paste: true, block, to, redo, under, from: landed, layers: null, dc: 0, dr: 0, landed, recorded: false, pasted };
    this._float = { ...start, start, version: this.history.version };
    if (pasted) this.history.last.floats = { before: null, after: this._float };
    return landed;
  }),

  // Stamp (Moebius's S while moving, and C on a selection): a copy of what's selected stays where it
  // is, and the block floats on from there as a paste of it, so moving it leaves the copy behind.
  stampSelection(rect, ids) {
    this.commitPending();
    const landed = this.pasteSelection(this.copySelection(rect, this.layersFor(ids)), rect.c0, rect.r0);
    if (this._float) this._float.stamped = this._float.start.stamped = true;
    return landed;
  },

  // A selection's contents float while you move them: every move of the same selection (a drag, an
  // arrow-key nudge), and a paste with the moves after it, is one change from where it started,
  // redone with each move (the last one undone first). What's under the path is only covered where
  // the block comes to rest, and the run is one undo step. The run ends, leaving the block where it
  // is, when the selection is cleared or replaced (Escape, Deselect, a new selection: tied to the
  // selection object itself, so reselecting the same cells starts over), its layers change, or
  // anything else is recorded. Each part stays on the layer it was lifted from, whatever's picked meanwhile.
  // Returns where it landed (clipped), or null when it left the grid.
  floatSelection: floated(function (rect, ids, dc, dr) {
    ids = this.layersFor(ids);
    this.commitPending(); // text typed onto the block (a paste) is recorded: the next move starts a new run
    const run = this._float;
    const sameRun = run && canTakeBack(this, run) && run.version === this.history.version && toRaw(rect) === toRaw(run.landed)
      && (!run.layers || sameIds(run.layers, ids));
    const block = !sameRun && this.copySelection(rect, ids, { shapes: false });
    const current = sameRun ? run : { block, redo: (c, r) => this.moveSelection(rect, ids, c, r, block), from: rect, layers: [...ids], dc: 0, dr: 0 };
    const offset = { dc: current.dc + dc, dr: current.dr + dr };
    if (sameRun && run.recorded) this.undo();
    if (!current.turned && !offset.dc && !offset.dr) { // back where it started: a move's nothing, a paste's where it was pasted
      this._float = current.paste ? { ...current.start, start: current.start, version: this.history.version } : null;
      return current.from;
    }
    const version = this.history.version;
    const landed = current.redo(offset.dc, offset.dr);
    const recorded = this.history.version !== version;
    this._float = landed && { ...current, ...offset, landed, version: this.history.version, recorded };
    if (recorded) this.history.last.floats = { before: current.paste ? { ...current.start, start: current.start } : null, after: this._float ?? { ...current, landed: null } };
    return landed;
  }),

  // Flip what's selected (op 'h', 'v') or rotate it 90° clockwise ('cw'), on each of the layers. A
  // flip moves its cells, their characters turning with them (TurnChars), and its paint and base flip
  // too. Rotate turns only pixels, by the picture's shape (rotateBlock), and does nothing while the
  // selection has characters (hasCharacters); the turned block starts at the same top-left corner,
  // moved back onto the grid where it would run off it. It floats, as a move does (floatSelection):
  // turned while it floats, it's the same run, so what it covers comes back when it moves on, and the
  // run is one undo step. Returns where it landed (clipped).
  turnSelection: floated(function (rect, ids, op) {
    ids = this.layersFor(ids);
    if (op === 'cw' && this.hasCharacters(rect, ids)) return rect;
    this.commitPending();
    const run = this._float;
    const sameRun = run && canTakeBack(this, run) && run.version === this.history.version && toRaw(rect) === toRaw(run.landed)
      && (!run.layers || sameIds(run.layers, ids));
    if (sameRun && run.recorded) this.undo();
    // Lifted from (cleared each time it lands; none for a paste, which puts back what it covered, on its layer to), and
    // the block as it floats.
    const lifted = sameRun ? (run.paste ? null : run.from) : rect;
    const liftedLayers = sameRun ? run.layers : [...ids];
    const under = !lifted ? run.under : null, start = !lifted ? run.start : null, to = !lifted ? run.to : null;
    const block = turnBlock(sameRun && run.block ? run.block : this.copySelection(lifted, liftedLayers, { shapes: false }), op);
    const col = Math.max(0, Math.min(rect.c0, this.cols - block.w));
    const row = Math.max(0, Math.min(rect.r0, charRowsOf(this.rows) - block.h));
    const place = (dc, dr) => {
      const c = col + dc, r = row + dr;
      const landed = this.clipRect({ c0: c, r0: r, c1: c + block.w - 1, r1: r + block.h - 1 });
      this.selectionEdit([lifted, under?.rect, landed].filter(Boolean), () => {
        if (lifted) moveParts(this, block, liftedLayers, lifted, c, r);
        else this.onLayer(to, () => {
          uncover(this, under);
          this.pasteAt(flatBlock(block), c, r);
        });
      });
      return landed;
    };
    const version = this.history.version;
    const landed = place(0, 0);
    const recorded = this.history.version !== version;
    this._float = landed && {
      paste: !lifted, turned: true, block, redo: place, from: lifted ?? run.from, layers: lifted ? liftedLayers : null, under, start, to, pasted: !lifted && run.pasted, stamped: !lifted && run.stamped,
      dc: 0, dr: 0, landed, version: this.history.version, recorded,
    };
    if (recorded) this.history.last.floats = { before: start && { ...start, start }, after: this._float ?? { paste: !lifted, from: lifted ?? run.from, landed: null } };
    return landed;
  }),

  // Whether what's in rect, on the layers, has characters Rotate can't turn: anything on a cells
  // layer but a Half-block's ▄, or a pin on the base but ▄ (both only show their cell's pixels).
  // A floating block is judged as it was lifted: its picture landed as cells, but turns as pixels.
  hasCharacters(rect, ids) {
    const run = this._float;
    if (run?.block && run.version === this.history.version && toRaw(rect) === toRaw(run.landed)) {
      const { parts, cells, base, shown } = run.block;
      return (parts ?? [{ cells }]).some((part) => !!part.cells?.some((entry) => entry && !isPaintBlock(entry)))
        || !!base?.pins.some((pin) => pin && pin !== '▄') || !!shown?.some(Boolean);
    }
    ids = this.layersFor(ids);
    return rectCells(rect).some(({ col, row }) => ids.some((id) => {
      const key = cellKey(col, row);
      if (isBase(this, id)) return ((pin) => !!pin && pin !== '▄')(this.baseRecords.pins.get(key));
      const entry = this.cellsOf(id).get(key);
      return !!entry && !isPaintBlock(entry);
    }));
  },

  // Delete in the Magic Wand's selection (workspace.wand), in `view` (the ANSI view's cells or the
  // pixel view's grid pixels), on each of the layers, as the Eraser does: a cells layer's drawing goes
  // (in the pixel view, a ▄ there only to show paint (Half-block) goes with the last of its paint); the
  // base turns black (in the ANSI view whole cells, with a pinned space). One undo step.
  deleteInWand(made, view = made.view, ids = [this.editId]) {
    ids = this.layersFor(ids);
    const wand = wandIn(made, view, this.rows);
    const units = unitsOf(wand.mask, wand.width);
    const cells = view === 'output' ? units.map(({ x, y }) => ({ col: x, row: y })) : null;
    this.ensureLayer();
    this.beginEdit();
    eachLayer(this, ids, (id) => {
      if (isBase(this, id)) return cells ? this.eraseBase(cells) : this.eraseBasePixels(units);
      if (cells) {
        this.eraseEditPixels(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
        this.clearEditCells(cells);
        return;
      }
      const blocks = cellsOfPixels(units, this.cols, this.rows).filter(({ col, row }) => isPaintBlock(this.editCellAt(col, row)) && this.cellHasPaint(col, row));
      this.eraseEditPixels(units);
      this.clearEditCells(blocks.filter(({ col, row }) => !this.cellHasPaint(col, row)));
    });
    this.commitEdit();
  },

  // Recolor what's selected (made: the wand's selection or a Select rect), on the layers, one undo
  // step. In the ANSI view, colors { fg?, bg? } change that color of what every cell shows, its
  // character and other color kept, each cell on the topmost of the layers with an edit cell or paint
  // of its own there, else the base (else the topmost layer): on a cells layer, as an edit cell (the
  // paint there, which it replaces, giving its halves' colors); on the base, as its two pixels (bg the
  // top, fg the bottom; the ASCII styles show the pair's average, so fg to both) with its character
  // pinned, so the converter doesn't pick another. In the pixel view, colors.fg goes to every pixel of
  // each layer: the picture on the base, paint on a cells layer.
  recolorSelection(made, view, ids, { fg, bg }) {
    ids = this.layersFor(ids);
    let units;
    if (made.mask) {
      const wand = wandIn(made, view, this.rows);
      units = unitsOf(wand.mask, wand.width);
    } else {
      const cells = rectCells(made);
      units = view === 'output' ? cells.map(({ col, row }) => ({ x: col, y: row })) : cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
    }
    this.ensureLayer();
    this.beginEdit();
    if (view === 'output') {
      const colors = { ...(fg && { fg }), ...(bg && { bg }) }, ascii = this.renderStyle === 'ascii' || this.renderStyle === 'colorAscii';
      const layered = ids.filter((id) => !isBase(this, id)), base = ids.find((id) => isBase(this, id));
      const owns = (id, { x, y }) => this.cellsOf(id).has(cellKey(x, y)) || painted(this.paintOf(id), x, y);
      const byLayer = new Map();
      for (const unit of units) {
        const id = layered.findLast((each) => owns(each, unit)) ?? base ?? layered.at(-1);
        if (id) (byLayer.get(id) ?? byLayer.set(id, []).get(id)).push(unit);
      }
      eachLayer(this, ids.filter((id) => byLayer.has(id)), (id) => {
        const mine = byLayer.get(id);
        if (!isBase(this, id)) return this.writeEditCells(mine.map(({ x, y }) => ({ col: x, row: y, attrs: { ...shownLook(this, x, y), ...colors } })), { clearPaint: true });
        this.writeBaseCells((ascii && !fg ? [] : mine).map(({ x, y }) => {
          const look = this.completeAt(x, y, undefined, 'base');
          return { col: x, row: y, char: look.char, fg: fg ?? look.fg, bg: ascii ? fg : bg ?? look.bg };
        }));
      });
    } else if (fg) {
      eachLayer(this, ids, (id) => (isBase(this, id)
        ? this.writeBase(units.map(({ x, y }) => ({ x, y, hex: fg })))
        : this.paintEditPixels(units.map(({ x, y }) => ({ x, y, ...hex2rgb(fg), alpha: 1 })))));
    }
    this.commitEdit();
  },

  // Lift, clear the source, drop dc/dr away (copied first, so an overlapping move keeps everything),
  // each layer's part on its own layer. Returns where it landed (clipped), or null when it left the grid.
  moveSelection(rect, ids, dc, dr, block = null) {
    if (!dc && !dr) return rect;
    ids = this.layersFor(ids);
    block ||= this.copySelection(rect, ids, { shapes: false });
    const col = rect.c0 + dc, row = rect.r0 + dr;
    const landed = this.clipRect({ c0: col, r0: row, c1: rect.c1 + dc, r1: rect.r1 + dr });
    this.selectionEdit(landed ? [rect, landed] : [rect], () => moveParts(this, block, ids, rect, col, row));
    return landed;
  },

  // The parts of the selection operations, inside selectionEdit: rect cleared on each of the layers.
  deleteIn(rect, ids) {
    eachLayer(this, this.layersFor(ids), (id) => deleteOn(this, id, rect));
  },

  // A block of one layer's (flatBlock) pasted on the layer in use. A character pasted over half of a
  // wide character turns its other half into a space, as typing does; not in the rect a move just
  // vacated (the cells there still show what was moved). Its empty cells (no edit cell, no paint) are
  // see-through (withEditUnder). On the base, as drawing there is (landOnBottom).
  pasteAt(block, col, row, vacated = null) {
    if (block.px % 2) block = withHalfRowUnder(this, block, col, row);
    if (onBottom(this)) return landOnBottom(this, block, col, row);
    if (refusedNoCells(this, { toast: false })) return; // no cells layer to land on
    const own = block.cells;
    if (block.cells) block = withEditUnder(this, block, col, row);
    if (block.cells) {
      const written = own.flatMap((entry, i) => (entry ? [{ col: col + (i % block.w), row: row + Math.floor(i / block.w), char: entry.char }] : []));
      const inVacated = ({ col: c, row: r }) => vacated && c >= vacated.c0 && c <= vacated.c1 && r >= vacated.r0 && r <= vacated.r1;
      const blanks = overwritesAll(this.cells, this.cols, written).filter((cell) => !inVacated(cell));
      this.editCells = pasteBlock(this.editCells, { w: block.w, h: block.h, entries: block.cells }, col, row, this.cols, charRowsOf(this.rows));
      if (blanks.length) {
        this.editCells = new Map(this.editCells);
        for (const { col: c, row: r } of blanks) this.editCells.set(cellKey(c, r), mergeEntry(this.editCells.get(cellKey(c, r)), { char: ' ' }));
      }
    }
    if (block.paint) this.paintLayer.pasteCells(block.paint, col, row, block.w, block.h, this.gridRect());
  },

  // A selection made, changed or dropped (the Select tool's rectangle, the Magic Wand's, Deselect):
  // change(workspace) sets workspace.selection and/or .wand, and it's one undo step that isn't a
  // change to the document (nothing when the selection stays as it was). before: the selection to go
  // back to, when it changed already (a drag). A move or paste it ends is kept with it (undo).
  changeSelection(change, before = null) {
    const workspace = useWorkspaceStore();
    this.commitPending();
    before ??= { selection: workspace.selection, wand: workspace.wand, vectorSelected: workspace.vectorSelected };
    before.vectorSelected ??= workspace.vectorSelected;
    const float = this._float?.version === this.history.version ? this._float : null;
    change?.(workspace);
    const after = { selection: workspace.selection, wand: workspace.wand, vectorSelected: workspace.vectorSelected };
    const sameShapes = after.vectorSelected.length === before.vectorSelected.length && after.vectorSelected.every((key, i) => key === before.vectorSelected[i]);
    if (toRaw(after.selection) === toRaw(before.selection) && toRaw(after.wand) === toRaw(before.wand) && sameShapes) return;
    const apply = (side) => Object.assign(workspace, side);
    this.history.push({ undo: () => apply(before), redo: () => apply(after), selectionOnly: true, float, bytes: after.wand?.mask.length ?? 0 });
    this.historyVersion = this.history.version;
  },

  // VECTOR's selection set to keys, as an undo step (changeSelection): a click, Esc, a box, Select all.
  selectShapes(keys) {
    this.changeSelection((w) => { w.vectorSelected = keys; });
    useWorkspaceStore().vectorStop = null; // the selected stop was a selected shape's
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

// What a cell shows, as an edit cell would hold it (stored colors): its edit cell over the picture
// (completeAt), and where it has paint, the character it shows and each painted half's color.
function shownLook(project, col, row) {
  const look = project.completeAt(col, row, project.editCellAt(col, row));
  const top = project.paintLayer?.pixelAt(col, 2 * row), bottom = project.paintLayer?.pixelAt(col, 2 * row + 1);
  if (!top?.a && !bottom?.a) return look;
  const half = (hex, paint) => (paint?.a && hex ? rgb2hex(over(hex2rgb(hex), paint)) : hex);
  return { ...look, char: project.cells[cellIndex(col, row, project.cols)].char, fg: half(look.fg, bottom), bg: half(look.bg, top) };
}

// Whether a paint layer has paint in cell (col, row).
const painted = (paint, col, row) => !!(paint?.pixelAt(col, 2 * row) || paint?.pixelAt(col, 2 * row + 1));

// rect cleared on one layer, inside the open edit (a cells layer's data in the edit layer's fields): a cells layer's
// cells and paint go; the base turns black, with pinned spaces.
function deleteOn(project, id, rect) {
  if (isBase(project, id)) return project.eraseBase(rectCells(rect));
  project.editCells = withoutCells(project.editCells, rectCells(rect));
  project.paintLayer.eraseCells(rect);
}

// A move's (or a flip's) block landing at (col, row), rect lifted: on each of the layers, rect cleared and that layer's
// part put down (the base's own pixels and pins on the base, exactly), one swap in and out of each layer not in use.
function moveParts(project, block, ids, rect, col, row) {
  const parts = new Map(block.parts.map((part) => [part.id, part]));
  eachLayer(project, ids, (id) => {
    deleteOn(project, id, rect);
    if (isBase(project, id)) {
      if (block.base) pasteOnBase(project, block.px % 2 ? withHalfRowUnder(project, { w: block.w, h: block.h, px: block.px, base: block.base }, col, row) : block, col, row);
      return;
    }
    const part = parts.get(id);
    if (part) project.pasteAt({ w: block.w, h: block.h, px: block.px, cells: part.cells, ...(part.paint && { paint: part.paint }) }, col, row, rect);
  });
}

// What the shapes on shown vector layers show in these cells (Copy's), as exact cells (stored colors: storedLookAt), or
// null where none reaches; null when none reaches any.
function shownByShapes(project, cells) {
  const layers = [project._shapeLayer, ...project.lowerGroup.upper.map((id) => project._upperShapes.get(id))].filter((layer) => layer?.drawsShapes);
  if (!layers.length) return null;
  const shown = cells.map(({ col, row }) => {
    if (!layers.some((layer) => layer.charAt(col, row) !== undefined)) return null;
    return project.cells[cellIndex(col, row, project.cols)] ? project.storedLookAt(col, row) : null;
  });
  return shown.some(Boolean) ? shown : null;
}

// A block (copySelection's) as one layer's { w, h, px, cells, paint }, for a paste or another app: the base as edit cells
// looking as it did (asCells), each part over the one under it (an entry over the paint under it covers it; a
// Half-block's ▄ over the base shows its pixels), the shown cells laid in at shownAt, exactly. A block that's one
// layer's already comes back as it is.
// ponytail: an entry with only some attributes takes the rest from the entry under it, not the paint there (that's cleared).
export function flatBlock(block) {
  if (!block.parts) return block;
  const { w, h, px, base, shown, shownAt } = block;
  const layers = [...block.parts];
  if (shown) layers.splice(shownAt, 0, { cells: shown, exact: true });
  const fromBase = base ? asCells(block) : null;
  let cells = fromBase ? fromBase.cells : new Array(w * h).fill(null), paint = null;
  for (const part of layers) {
    const k = paint && paint.width / w;
    cells = cells.map((lower, i) => {
      const entry = part.cells[i];
      if (!entry) return lower;
      if (paint && !isPaintBlock(entry)) ctx2d(paint).clearRect((i % w) * k, 2 * Math.floor(i / w) * k, k, 2 * k);
      if (part.exact || !lower) return entry;
      return isPaintBlock(entry) ? lower : { ...lower, ...entry };
    });
    if (!part.paint) continue;
    if (!paint) {
      paint = document.createElement('canvas');
      paint.width = part.paint.width;
      paint.height = part.paint.height;
    }
    const ctx = ctx2d(paint);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(part.paint, 0, 0, paint.width, paint.height);
  }
  if (base && !paint) { // the base's cells replace the paint under them
    paint = document.createElement('canvas');
    paint.width = w;
    paint.height = 2 * h;
  }
  return { w, h, ...(px != null && { px }), cells, ...(paint && { paint }) };
}

// A one-layer block landing on the base at (col, row), as drawing there does: each entry written as it shows there
// (completeAt), every character pinned, and the paint laid over the base's pixels.
function landOnBottom(project, block, col, row) {
  const rect = project.clipRect({ c0: col, r0: row, c1: col + block.w - 1, r1: row + block.h - 1 });
  if (!rect) return;
  const at = ({ col: c, row: r }) => (r - row) * block.w + (c - col);
  project.writeBaseCells(rectCells(rect).flatMap((cell) => {
    const entry = block.cells?.[at(cell)];
    return entry ? [{ ...cell, ...project.completeAt(cell.col, cell.row, entry, 'base') }] : [];
  }));
  if (!block.paint) return;
  const grid = document.createElement('canvas');
  grid.width = block.w;
  grid.height = 2 * block.h;
  const ctx = ctx2d(grid);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(block.paint, 0, 0, grid.width, grid.height);
  const { data } = ctx.getImageData(0, 0, grid.width, grid.height), pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const p = i / 4, x = p % grid.width;
    pixels.push({ x: col + x, y: 2 * row + (p - x) / grid.width, r: data[i], g: data[i + 1], b: data[i + 2], alpha: data[i + 3] / 255 });
  }
  project.paintBasePixels(pixels.filter(({ x, y }) => x >= rect.c0 && x <= rect.c1 && y >= 2 * rect.r0 && y <= 2 * rect.r1 + 1));
}

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
  const turnCells = (cells) => turned(cells, (e) => (e?.char && !isPaintBlock(e) ? { ...e, char: turnChar(e.char, op) } : e));
  const turnLayer = ({ cells, paint }) => ({ ...(cells && { cells: turnCells(cells) }), ...(paint && { paint: turnCanvas(paint, op) }) });
  Object.assign(out, turnLayer(block));
  if (block.parts) out.parts = block.parts.map((part) => ({ id: part.id, ...turnLayer(part) }));
  if (block.shown) Object.assign(out, { shown: turnCells(block.shown), shownAt: block.shownAt });
  if (block.looks) out.looks = turned(block.looks, (e) => ({ ...e, char: turnChar(e.char, op) }));
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
  const rotateLayer = ({ cells, paint }) => {
    const layer = {};
    if (paint) layer.paint = turnCanvas(paint, 'cw');
    if (cells) {
      const shows = layer.paint && paintedCells(layer.paint, out.w, out.h);
      layer.cells = from(cells).map((entry, i) => (entry && shows?.[i] ? entry : null));
    }
    return layer;
  };
  Object.assign(out, rotateLayer(block));
  if (block.parts) out.parts = block.parts.map((part) => ({ id: part.id, ...rotateLayer(part) }));
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

// A block's base pasted back into the base at (col, row), clipped to the grid: its pixels, and its pins (a cell it had
// none in is left with none). Where a base moved on its own goes while there's no cells layer to lift it onto (pasteAt).
function pasteOnBase(project, { w, h, base }, col, row) {
  const rect = project.clipRect({ c0: col, r0: row, c1: col + w - 1, r1: row + h - 1 });
  if (!rect) return;
  const cells = rectCells(rect), pin = ({ col: c, row: r }) => base.pins[(r - row) * w + (c - col)];
  project.baseLayer.pasteCells(base.pixels, col, row, w, h, rect);
  project.setBaseRecords(withPins(withoutPins(project.baseRecords, cells), cells.filter((cell) => pin(cell) != null).map((cell) => ({ ...cell, char: pin(cell) }))));
  project.refreshCells(cells.flatMap(({ col: c, row: r }) => [{ x: c, y: 2 * r }, { x: c, y: 2 * r + 1 }]));
}

// A block whose picture part (base) is edit cells: each cell as it looked where it was copied (looks),
// or, turned by its pixels (rotateBlock), its two pixels' stored colors under its pin, or ▄; with the
// block's own edit cell over that, as it was over the picture. A Half-block's ▄ (there to show paint)
// shows its two pixels, as it did.
function asCells(block) {
  const { w, base, looks, cells } = block;
  const { data } = ctx2d(base.colors).getImageData(0, 0, base.colors.width, base.colors.height);
  const hex = (x, y) => `#${[0, 1, 2].map((c) => data[(y * w + x) * 4 + c].toString(16).padStart(2, '0')).join('')}`;
  const pixels = (i, char) => ({ char, fg: hex(i % w, 2 * Math.floor(i / w) + 1), bg: hex(i % w, 2 * Math.floor(i / w)) });
  const out = base.pins.map((pin, i) => {
    const own = cells?.[i];
    if (isPaintBlock(own)) return pixels(i, '▄');
    const look = looks?.[i] ?? pixels(i, pin ?? '▄');
    return own ? { ...look, ...own } : look;
  });
  return { ...block, cells: out, base: null, looks: null };
}

// A block for pasting at (col, row) whose empty cells (no edit cell and no paint) take the edit layer
// there now, so what's drawn shows through them instead of being cleared. The base isn't see-through:
// the picture under a cell is always there.
function withEditUnder(project, block, col, row) {
  const painted = block.paint && paintedCells(block.paint, block.w, block.h);
  const empty = block.cells.map((entry, i) => !entry && !painted?.[i]);
  if (!empty.some(Boolean)) return block;
  const keyAt = (i) => cellKey(col + (i % block.w), row + Math.floor(i / block.w));
  const out = { ...block, cells: block.cells.map((entry, i) => (empty[i] ? project.editCells.get(keyAt(i)) ?? null : entry)) };
  if (block.paint) {
    const under = project.paintLayer.copyCells({ c0: col, r0: row, c1: col + block.w - 1, r1: row + block.h - 1 });
    const k = block.paint.width / block.w, u = under.width / block.w;
    out.paint = document.createElement('canvas');
    out.paint.width = block.paint.width;
    out.paint.height = block.paint.height;
    const ctx = ctx2d(out.paint);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(block.paint, 0, 0);
    empty.forEach((e, i) => {
      if (!e) return;
      const c = i % block.w, r = Math.floor(i / block.w);
      ctx.drawImage(under, c * u, 2 * r * u, u, 2 * u, c * k, 2 * r * k, k, 2 * k);
    });
  }
  return out;
}

// What a paste covers (a column either side too, for the wide characters it breaks), as it was, on the
// layer it lands on (the one in use): put back by uncover, exactly, when the paste moves on.
function covered(project, rect) {
  const area = { ...rect, c0: Math.max(0, rect.c0 - 1), c1: Math.min(project.cols - 1, rect.c1 + 1) };
  if (onBottom(project)) {
    return { rect: area, base: { pixels: project.baseLayer.copyCells(area), pins: rectCells(area).map(({ col, row }) => project.baseRecords.pins.get(cellKey(col, row)) ?? null) } };
  }
  return { rect: area, entries: rectCells(area).map(({ col, row }) => project.editCells.get(cellKey(col, row)) ?? null), paint: project.paintLayer.copyCells(area) };
}

function uncover(project, { rect, entries, paint, base }) {
  const w = rect.c1 - rect.c0 + 1, h = rect.r1 - rect.r0 + 1;
  if (base) return pasteOnBase(project, { w, h, base }, rect.c0, rect.r0);
  if (entries) project.editCells = pasteBlock(project.editCells, { w, h, entries }, rect.c0, rect.r0, project.cols, charRowsOf(project.rows));
  if (paint) project.paintLayer.pasteCells(paint, rect.c0, rect.r0, w, h);
}
