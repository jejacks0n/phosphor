// The grid and what's drawn on it: the grid's size (rescale or canvas resize), the paint and base
// layers following it, full renders and partial recomposites, and the cells the views show. Owns
// _renderQueued and _rendering (a render on its way, which tests wait on), _rendered (the params it used), _layerGrid
// (the grid the layers were last sized to) and _gridRun (the grid step a change a moment later extends).
// The renderer's pipeline converts the lower group (ProjectStore.lowerGroup) into lowerCells, and every layer above it is
// laid over those cell by cell (Renderer.composeUpper): an edit on an upper layer touches only its cells (recomposeUpper),
// and never runs the pipeline.
import PaintLayer, { resizeTransform } from '@/document/PaintLayer.js';
import ShapeLayer from '@/document/ShapeLayer.js';
import { remapBaseRecords } from '@/document/baseRecords.js';
import { shownShapes } from '@/document/followers.js';
import { lowerGroup } from '@/document/layerInfo.js';
import { parseKey } from '@/document/editCells.js';
import { fitCells } from '@/lib/BitmapFont.js';
import { fitRect } from '@/lib/Canvas.js';
import { charRowsOf, isWideChar, layoutWide, layoutWideRows, gridFits, lockedGrid, maxColsBeside, maxRowsBeside } from '@/lib/Cells.js';
import { workingScale } from '@/lib/ImageProcessor.js';
import { baseParams } from '@/store/settings.js';
import { NUDGE_MS, boundsOf, bytesHeld, lowerEdits, lowerPaint, useBase } from '@/store/project/shared.js';
import { toast } from '@/composables/useToast.js';
import { busyMessage, busyWhile } from '@/composables/useBusy.js';
import { t } from '@/i18n';
import { markRaw, toRaw, watch } from 'vue';

// The renderer's upper layers, as the stack is now: each upper cells layer's cells and paint, each upper vector layer's
// own ShapeLayer (none yet while it never had a shape), each with its own params (layerParams: its character settings).
function upperOf(project) {
  const own = project.layerParams;
  return project.lowerGroup.upper.map((id) => (project.layerById(id).kind === 'vector'
    ? { id, kind: 'vector', layer: project._upperShapes.get(id) ?? null, params: own.get(id) }
    : { id, kind: 'cells', cells: project.cellsOf(id), paint: project.paintOf(id), params: own.get(id) }));
}

// What the Number palette counts over the picture (Renderer.everyLayer): the stack as it would show with every eye open,
// so showing or hiding a layer never changes the palette. The layers that show are handed over as they're drawn; a
// hidden vector layer (or the base's shapes with something under them hidden) is drawn by a scratch ShapeLayer made only
// here. None (the output alone) for other palettes, while everything shows and nothing is above the lower group, and
// inside an art layer, where the edit layer's fields aren't its own.
// ponytail: a scratch ShapeLayer draws its shapes whole on every recount; keep them per layer if that's slow.
function countedLayers(project) {
  const { layers } = project;
  if (project.quantize !== 'count' || !project._shapeLayer || project._artInside) return [];
  const all = lowerGroup(layers, project.baseChars), shown = project.lowerGroup;
  if (!all.upper.length && !layers.some((layer) => layer.hidden)) return [];
  let byLayer = null; // the shapes each vector layer draws, made when a scratch layer needs them
  const shapesOn = (ids) => {
    byLayer ??= [...shownShapes(project.shapes, project.pixelAspect)];
    return new Map(byLayer.filter(([, shape]) => ids.includes(shape.layer ?? 'vector')));
  };
  let lower = project._shapeLayer;
  if (project.layerHidden('base') || shown.vectors.join() !== all.vectors.join()) {
    lower = new ShapeLayer(project.baseLayer);
    lower.set(shapesOn(all.vectors), (shape) => layers.findIndex((layer) => layer.id === (shape.layer ?? 'vector')), project.pixelAspect);
  }
  const counted = [{ layer: lower.drawsShapes ? lower : project.baseLayer }];
  if (all.cells) counted.push({ paint: project.paintOf(all.cells) });
  for (const id of all.upper) {
    if (project.layerById(id).kind === 'cells') counted.push({ paint: project.paintOf(id) });
    else if (shown.upper.includes(id)) counted.push({ layer: project._upperShapes.get(id) });
    else {
      const alone = new ShapeLayer(null);
      alone.grid(project.cols, project.rows, project.paintLayer.scale); // as syncShapeLayers grids an upper vector layer
      alone.set(shapesOn([id]), null, project.pixelAspect);
      counted.push({ layer: alone });
    }
  }
  return counted;
}

// The cells under grid pixels, each once, as indexes into the cells.
// rows with those of the cells the last compose laid over again past the ones it was asked for: an upper layer's own
// Floyd–Steinberg worked out again (Renderer.settled).
function settledRows(project, rows) {
  for (const i of project.renderer.settled ?? []) rows.add(Math.floor(i / project.cols));
  return rows;
}

// Settings changes render again (EditWorkspace.vue, and the tests' app): the drawing's params, or a layer's own character
// settings (a layer added or gone draws itself, and a rename keeps its params). Not to params the same as those the render
// on its way, or the last, used (_rendered): its ensureLayer can move the base's scale (a first render, a restore, a resize
// past MAX_LAYER_DIM), which makes processParams and every layer's params anew. A plugin solver's options are made anew
// with them, so they're compared by value. Choosing a plugin solver, or changing one of its options, resolves the layer
// whole, which can take a while, as a new character set or font does on a large drawing (half a second at the limit):
// the busy note goes up first (solving). Returns what stops it.
// The plugin filters that run are made anew too, and compared by what changes their passes: each one's ref, script and values.
const filtersKey = (list) => JSON.stringify(list.map(({ ref, hash, values }) => [ref, hash, values]));
const sameValue = (key, a, b) => a === b || (key === 'solverOptions' && JSON.stringify(a) === JSON.stringify(b)) || (key === 'pluginFilters' && filtersKey(a) === filtersKey(b));
const sameParams = (a, b) => !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => sameValue(key, a[key], b[key]));
const solving = (now, rendered) => !!rendered && (now.chars !== rendered.chars || now.font !== rendered.font
  || (!!now.solver && (now.solver !== rendered.solver || !sameValue('solverOptions', now.solverOptions, rendered.solverOptions))));
export function followParams(project) {
  const render = (busy) => project.render(busy ? { busy: t('busy.solving') } : undefined);
  const stops = [
    watch(() => project.processParams, (now, was) => {
      const rendered = project._rendered?.params;
      if (now === was || !sameParams(now, rendered)) render(solving(now, rendered)); // the same object: changed inside
    }, { deep: true }),
    watch(() => project.layerParams, (now, was) => {
      const rendered = project._rendered?.layers, changed = [...now].filter(([id, params]) => was.has(id) && was.get(id) !== params && !sameParams(params, rendered?.get(id)));
      if (changed.length) render(changed.some(([id, params]) => solving(params, rendered?.get(id))));
    }),
  ];
  return () => stops.forEach((stop) => stop());
}

// Every layer a grid change reaches: each cells layer's paint (the one in use's, and those waiting in _layerData) and the base's.
const gridPaints = (project) => [...new Set([project.paintLayer, project.baseLayer, ...[...project._layerData.values()].map((data) => data.paintLayer)])].filter(Boolean);

// The grid step a change now extends (ensureLayer): the last step, made a moment ago on this frame, with nothing since.
function gridRun(project) {
  const run = project._gridRun;
  return run && run.entry === project.history.last && run.version === project.history.version && run.frame === toRaw(project.currentFrame) && Date.now() - run.at < NUDGE_MS ? run : null;
}

// The grid's size as a grid step's side has it: set with _layerGrid, so ensureLayer has nothing to follow.
function putGridSize(project, { cols, rows }) {
  project.cols = cols;
  project.rows = rows;
  project._layerGrid = { cols, rows };
}

// What a grid change that resamples or rescales replaces, and what it leaves: the grid, the fit, the base's scale and
// records, and each layer's canvas (by the layer: its object stays, whichever layer is in use).
const paintStates = (project) => new Map(gridPaints(project).map((paint) => [paint, paint.gridState()]));
function gridState(project, grid) {
  return { ...grid, fit: project.fit && { ...project.fit }, baseScale: project.baseScale, records: project.baseRecords, scale: project.paintLayer.scale, paints: paintStates(project) };
}

// gridState's state put back. A layer's paint made since (picked with none, or its first paint) is empty, and follows.
function putGridState(project, state) {
  const fit = project.fit;
  putGridSize(project, state);
  for (const paint of gridPaints(project)) {
    const held = state.paints.get(paint);
    if (held) paint.putGrid(held);
    else paint.resize(state.cols, state.rows, fit, state.fit, state.scale);
  }
  project.fit = state.fit && { ...state.fit };
  project.baseScale = state.baseScale;
  project.setBaseRecords(state.records);
}

// The cells under grid pixels, each once in the order the pixels first reach it, and their rows (rows, when given, gets
// them). A byte a cell marks those seen: a fill comes with a million pixels.
function cellsUnder(pixels, cols, rows = null) {
  let most = 0;
  for (const { x, y } of pixels) most = Math.max(most, (y >> 1) * cols + x, y >> 1);
  const indexes = [], seen = new Uint8Array(most + 1), lines = new Uint8Array(most + 1);
  for (const { x, y } of pixels) {
    const row = y >> 1, i = row * cols + x;
    if (rows && !lines[row]) { lines[row] = 1; rows.add(row); }
    if (!seen[i]) { seen[i] = 1; indexes.push(i); }
  }
  return indexes;
}

// Whether the aspect lock holds a size change, with the grid's shape kept first (aspectRatio): the one it kept before
// while the grid still has it, the picture's own while the grid is at that (neither rounded to whole cells), or the
// grid's own when it's left both (unlocked, animation on, an older file). It holds after drawing too: a canvas resize
// keeps the shape as a rescale does. Not with animation on. Shapes in grid pixels (gridRatio: the picture's in the
// drawing's cells). A side effect: it writes aspectRatio (0, or cols / rows) when the grid has left the kept shape.
function locked(project) {
  if (!project.aspectLock || !project.image || project.hasFrames) return false;
  const fits = (ratio) => { const at = lockedGrid(project.cols, ratio); return at.cols === project.cols && at.rows === project.rows; };
  if (!fits(project.lockRatio)) project.aspectRatio = fits(project.gridRatio) ? 0 : project.cols / project.rows;
  return true;
}

// A size the lock held smaller than the grid could be without it: a toast says why, or the field only snaps back.
const heldByLock = (project) => toast(t('panel.sizeLocked', { cols: project.cols, rows: project.rows }));

export const renderingActions = {
  updateCols(val) {
    let num = parseInt(val);
    if (num < 1) return void toast(t('panel.sizeMin'));
    if (isNaN(num)) return;

    if (locked(this)) {
      const unlocked = Math.min(num, maxColsBeside(this.rows));
      this.$patch(lockedGrid(num, this.lockRatio));
      if (this.cols < unlocked) heldByLock(this);
    } else {
      this.cols = Math.min(num, this.hasFrames ? this.maxCols : maxColsBeside(this.rows));
    }
  },

  // The aspect lock on or off. Turned on, it keeps the shape the grid has now (locked).
  setAspectLock(on) {
    this.aspectLock = on;
    locked(this);
  },

  updateRows(val) {
    let num = parseInt(val);
    if (num < 1) return void toast(t('panel.sizeMin'));
    if (isNaN(num)) return;

    if (locked(this)) {
      const cols = Math.max(1, Math.round(num * this.lockRatio)), unlocked = Math.min(num, maxRowsBeside(this.cols));
      this.$patch(gridFits(cols, num) ? { cols, rows: num } : lockedGrid(cols, this.lockRatio));
      if (this.rows < unlocked) heldByLock(this);
    } else {
      this.rows = Math.min(num, this.hasFrames ? this.maxRows : maxRowsBeside(this.cols));
    }
  },

  // Create the paint and base pixel layers on first use, and follow grid changes. With anything drawn (on a layer, or the
  // base's pins and own pixels), or a step to undo that's tied to where things are (resizesCanvas), a grid change is a canvas resize:
  // the image and every layer stay where they are, and the grid gains or loses cells at the right and bottom (what's
  // past the edge is kept, for when it grows back), so every undo step still fits. Otherwise it rescales: the image
  // refits the grid, and the base's own pixels (hard-edged) and pins move with it. The base layer is at the pipeline's processing scale
  // (the new grid's, on a rescale), and the pipeline keeps that scale while it exists.
  // The change is one undo step (gridOp), and the steps before it stay. A canvas resize that keeps every layer's scale
  // only adds room, so its undo puts the grid back and leaves the layers as they are. One that resamples them (past
  // MAX_LAYER_DIM), or a rescale, holds each layer's canvas as it was (PaintLayer.gridState) to put back whole, never
  // resized back; it's a whole-layer step, since the strokes before it don't fit the new layers. In a room the new grid
  // goes to everyone as the whole document and isn't a step (drawing/host.js), so the steps it no longer fits go.
  ensureLayer() {
    if (!this.image) return;
    const { cols, rows } = this;
    if (!this.paintLayer) {
      this.fit ??= this.fitFor(cols, rows);
      useBase(this, markRaw(new PaintLayer({ cols, rows, scale: this.baseScale ?? this.processingScale(), smooth: false })));
      // A new drawing paints at the base's scale, so every layer is the same pixels (docs/model.md R7); a file keeps its own.
      this.paintLayer = markRaw(new PaintLayer({ cols, rows, scale: this.paintScale ?? this.baseLayer.scale }));
      this.syncShapeLayers();
      this.baseScale = this.baseLayer.scale;
      this._layerGrid = { cols, rows };
      return;
    }
    if (this._layerGrid.cols === cols && this._layerGrid.rows === rows) return;
    const was = this._layerGrid;
    this._layerGrid = { cols, rows };
    if (this._artInside) this.leaveArt(); // stepped into an art layer: out first, its edits kept (on the old layers)
    this.commitPending(); // an open edit (a typing run) was recorded on the old layers
    // A run of changes a moment apart with nothing between (the stepper's arrows, held) is one step, as a run of nudges on
    // a slider is (sliders.js): its after goes as far as the last. One that only adds room joins either kind; one that
    // holds the layers, only a step that holds them.
    const paints = gridPaints(this), room = !!this._sharing, run = room ? null : gridRun(this), now = Date.now();
    if (this.resizesCanvas && paints.every((paint) => paint.keepsScale(cols, rows)) && run?.kind !== 'whole') {
      for (const paint of paints) paint.extend(cols, rows);
      if (room) return;
      const grid = (at) => () => {
        putGridSize(this, at);
        for (const paint of gridPaints(this)) paint.extend(at.cols, at.rows); // only grows: undone, the layers stay as they are
        this.render();
      };
      if (run) {
        run.at = now;
        run.entry.redo = grid({ cols, rows });
        this.editVersion++;
        return;
      }
      this.pushEdit({ gridOp: true, bytes: 0, undo: grid(was), redo: grid({ cols, rows }) });
      this._gridRun = markRaw({ kind: 'grid', entry: this.history.last, version: this.history.version, frame: toRaw(this.currentFrame), at: now });
      return;
    }
    const joins = run?.kind === 'whole' ? run : null, before = joins?.before ?? gridState(this, was);
    if (this.resizesCanvas) {
      for (const paint of paints) paint.extend(cols, rows);
    } else {
      // Nothing to undo is tied to the old layout (resizesCanvas): the layers follow the picture's new fit.
      const oldFit = this.fit, newFit = this.fitFor(cols, rows);
      const scale = this.processingScale({ fit: newFit }); // the base's, and the paint's with it (docs/model.md R7)
      for (const paint of paints) paint.resize(cols, rows, oldFit, newFit, scale);
      this.setBaseRecords(remapBaseRecords(this.baseRecords, resizeTransform(oldFit, newFit), cols, rows));
      this.fit = newFit;
    }
    this.baseScale = this.baseLayer.scale;
    if (room) return void this.dropEdits();
    const after = Object.assign(joins?.after ?? {}, gridState(this, { cols, rows })), frame = this.currentFrame;
    const bytes = bytesHeld(...[...before.paints].filter(([paint, { canvas }]) => after.paints.get(paint)?.canvas !== canvas).map(([, state]) => state));
    if (joins) { // its undo and redo hold after: what the changes between made is let go
      joins.at = now;
      joins.entry.bytes = bytes;
      this.editVersion++;
      return;
    }
    // The layers are shared by the frames, holding the one that shows: undone or redone on the frame it was made on. The
    // side left is held as the layers are then, not as they were made: a canvas resize since has drawn them onto new
    // canvases, and the steps after it were undone there.
    const put = (from, to) => () => {
      if (this.frames.includes(frame)) this.showFrame(this.frames.indexOf(frame));
      from.paints = paintStates(this);
      putGridState(this, to);
      this.render();
    };
    this.pushWholeLayer(put(after, before), put(before, after), bytes, { everyFrame: true, layerOp: true }); // layerOp: put back by the layers themselves, whichever is in use
    this.history.last.gridOp = true;
    this._gridRun = markRaw({ kind: 'whole', entry: this.history.last, version: this.history.version, frame: toRaw(frame), at: now, before, after });
  },

  // A grid change in a room: forget the open edit and every step but slider and settings moves (they don't depend on
  // the grid). A rescale has only those and selection steps to drop; a canvas resize whose paint had to be resampled,
  // everything else too.
  dropEdits() {
    this._stroke = null;
    this._ledger.reset(); // first: what History drops next has nothing left to forget
    for (const frame of this.frames) frame.ledger = null;
    this.history.retain(entry => entry.settingsOnly);
    this.historyVersion = this.history.version;
  },

  // The pipeline's own processing scale for the grid (not the base layer's), or 1 when the image is
  // smaller than the grid (processed at its native size).
  processingScale(params = {}) {
    return workingScale(this.image, { ...this.processParams, ...params, workScale: null }) ?? 1;
  },

  // Where the image fits a cols x rows grid, its pixels aspect (a grid pixel's height over width) each.
  fitFor(cols, rows, aspect = this.fitAspect) {
    return fitRect(this.image.naturalWidth || this.image.width, this.image.naturalHeight || this.image.height, cols, rows, aspect);
  },

  // Full re-render on the next frame (calls in the same frame coalesce).
  // _renderQueued and _rendering say whether one is still to come (tests wait on them). busy: words for the busy note,
  // up from now until the render ends (it waits for a frame with the note in it).
  render({ busy = null } = {}) {
    if (this._renderQueued) return;
    this._renderQueued = true;
    const run = async () => {
      this._renderQueued = false;
      if (!this.image) return;
      this._rendering = true;
      try {
        this.ensureLayer();
        if (this._moviePalette && (this.quantize !== 'count' || !this.hasFrames)) { // Color count left: the palette goes with it
          this._moviePalette = null;
          this.renderer.usePalette(null);
        }
        this.renderer.useFont(this.drawingFont); // Best match and By shape measure glyphs in it
        this.renderer.hideBase = this.layerHidden('base');
        if (this._shapeLayer) this._shapeLayer.hideBase = this.renderer.hideBase;
        this.syncShapeLayers();
        this.renderer.everyLayer = countedLayers(this);
        this.renderer.upper = upperOf(this); // a layer's own Best match or By shape waits for the reference font too
        const params = this.processParams;
        this._rendered = markRaw({ params, layers: this.layerParams }); // what followParams needn't render again
        this.renderedCells = await this.renderer.render(this.image, params, lowerPaint(this), baseParams(params));
        this.activePalette = this.renderer.palette;
        this.applyEditCells();
        if (this._moviePalette || (this.hasFrames && this.quantize === 'count')) this.pickPalette(); // settings changed: a whole movie's palette follows
      } finally {
        this._rendering = false;
      }
    };
    if (busy && !busyMessage.value) busyWhile(busy, run); // under another note (a file opening), on the next frame as ever
    else requestAnimationFrame(run);
  },

  // New composed cells: laid out with their wide characters as what the views show and export.
  // rows: the only rows that need laying out again (an edit's, or the only ones that can hold a wide
  // character), and laid: the layout the other rows keep.
  // With a drawing font, a character it lacks is swapped for its stand-in (BitmapFont.fitCells); the edit cells keep it.
  setCells(composed, rows = null, laid = this.cells) {
    if (this.drawingFont) { // ponytail: fits every cell each edit; fit only `rows` if 500k-cell drawings feel it
      const fitted = fitCells(composed, this.drawingFont);
      if (laid === composed) laid = fitted; // layUpper's rows kept as composed: fitted too
      composed = fitted;
    }
    const partial = rows && laid.length === composed.length;
    this.composedCells = composed;
    this.cells = partial ? layoutWideRows(composed, this.cols, laid, rows) : layoutWide(composed, this.cols);
  },

  // Rebuild the cells under grid pixels (an edit's) from the output as it is, the upper layers over them, and their
  // rows' layout.
  recompose(pixels) {
    // The grid changed and its render is on its way (a font of another height, a Bake): it draws this edit too.
    if (this.lowerCells.length !== this.cols * charRowsOf(this.rows)) return void this.render();
    const rows = new Set(), under = cellsUnder(pixels, this.cols, rows);
    this.lowerCells = this.renderer.updateCells(this.lowerCells, pixels, this.processParams, lowerEdits(this), this.renderedCells);
    this.setCells(this.overLower(under), settledRows(this, rows));
  },

  // The cells under grid pixels (an upper layer's edit) laid over again from the lower group's cells as they are: the
  // pipeline and its cells aren't touched. Every cell with null, for a change past where pixels are worth listing: not
  // applyEditCells, whose lower cells are the last render's, without the paint drawn on the lower group since.
  recomposeUpper(pixels = null) {
    if (!this.lowerCells.length || this.lowerCells.length !== this.composedCells.length) return; // a render's on its way
    if (!pixels) return layUpper(this);
    const rows = new Set(), under = cellsUnder(pixels, this.cols, rows);
    this.setCells(this.overLower(under), settledRows(this, rows));
  },

  // lowerCells with the upper layers over it (Renderer.composeUpper), the cells at indexes again (every cell with null)
  // and the rest as last composed; lowerCells itself while there's no upper layer, as before layers. While an edit is
  // open, an upper layer's own Floyd–Steinberg holds still (commitEdit catches it up).
  overLower(indexes = null) {
    this.renderer.upper = upperOf(this);
    if (!this.renderer.upper.length) return this.lowerCells;
    if (this.renderer.needsFont) this.render(); // a layer added, shown or moved without one, with its own Best match or By shape
    return this.renderer.composeUpper(this.lowerCells, indexes, this.renderer.palette, this.composedCells, { open: !!this._stroke });
  },

  // The edit layer's fields changed under pixels: drawn again the way their layer is, through the pipeline for the
  // lower group's cells layer (composited: its paint changed too, so the output is first), or over the group's cells
  // for an upper one.
  recomposeEdit(pixels, { composited = false } = {}) {
    if (this.editIsUpper) return this.recomposeUpper(pixels);
    if (composited) this.composite({ rect: boundsOf(pixels) });
    this.recompose(pixels);
  },

  // After the edit layer's paint changed under pixels: refreshCells, or an upper layer's cells alone.
  refreshEdit(pixels) {
    if (this.editIsUpper) this.recomposeUpper(pixels);
    else this.refreshCells(pixels);
  },

  // Recomposite the output after the paint or base pixels changed. When that rebalanced the Number
  // palette, every cell's colors can change: the cells are rebuilt from the output (as a full render
  // would, without rerunning the pipeline). While an edit is open (a stroke, a shape) the Number
  // palette holds still and the paint shows in its own colors, and Best match with Floyd–Steinberg
  // carries a change to the base no further than the edit's cells; commitEdit catches up. True when
  // every cell was rebuilt. rect: the grid pixels that changed ({ x, y, w, h }), when an edit knows them.
  composite({ rect = null } = {}) {
    const hold = !!this._stroke && this.quantize === 'count';
    this.renderer.everyLayer = hold ? [] : countedLayers(this); // held: not counted till the edit ends
    const changed = this.renderer.composite(lowerPaint(this), this.processParams, { hold, rect, open: !!this._stroke });
    if (changed) this.rebuildCells();
    return changed;
  },

  // Every cell again from the output as it is: a full render's cells, without the pipeline. An output of another size is
  // one the grid has left before its render (a size undone, then a layer step under it, at once): that render, queued
  // with the grid's change, makes every cell.
  rebuildCells() {
    const output = this.renderer.outputCanvas;
    if (output && (output.width !== this.cols || output.height !== this.rows)) return void this.render();
    this.activePalette = this.renderer.palette;
    this.renderedCells = this.renderer.cellsFromOutput(this.processParams);
    this.applyEditCells();
  },

  // After the paint or base pixels changed under `pixels`: recomposite and rebuild just those cells.
  refreshCells(pixels) {
    this.composite({ rect: boundsOf(pixels) });
    this.recompose(pixels);
  },

  applyEditCells() {
    if (!this.renderedCells.length) return;
    // A render that landed after the grid changed under it (a file of another size opened while it ran): its cells are
    // the old grid's, and the render the change queued composes the new one's (as recompose does).
    if (this.renderedCells.length !== this.cols * charRowsOf(this.rows)) return void this.render();
    this.lowerCells = this.renderer.composeAll(this.renderedCells, lowerEdits(this), this.processParams);
    layUpper(this);
  },
};

// Every upper layer laid over lowerCells as they are, and the cells the views show laid out.
function layUpper(project) {
  const composed = project.overLower();
  // The converter's characters are one column wide (Cells.glyphsOf), so only a row with a wide character in a cell of a
  // cells layer or a pin, or with an art layer's character, can hold one: the rest are laid out as they are (composed
  // anew, so a row whose wide character went has nothing to lay out). Keys are parsed only for those: at 500k cells,
  // parsing every one took 300 ms a redraw.
  const rows = new Set();
  for (const layer of project.shownLayers) if (layer.id !== 'base' && layer.kind === 'cells') for (const [key, { char }] of project.cellsOf(layer.id)) if (char && isWideChar(char)) rows.add(parseKey(key).row);
  if (!project.renderer.hideBase) for (const [key, char] of project.baseRecords.pins) if (char && isWideChar(char)) rows.add(parseKey(key).row);
  for (const shapes of [project.renderer.shapes, ...project.renderer.upper.map((u) => u.layer)]) if (shapes?.hasArt) for (const key of shapes.artCells()) rows.add(parseKey(key).row);
  project.setCells(composed, rows, composed);
}
