// The grid and what's drawn on it: the grid's size (rescale or canvas resize), the paint and base
// layers following it, full renders and partial recomposites, and the cells the views show. Owns
// _renderQueued and _rendering (a render on its way, which tests wait on) and _layerGrid (the grid
// the layers were last sized to).
import PaintLayer, { editScaleFor, resizeTransform } from '@/document/PaintLayer.js';
import { remapBaseRecords } from '@/document/baseRecords.js';
import { fitRect } from '@/lib/Canvas.js';
import { layoutWide, layoutWideRows, gridFits, lockedGrid, maxColsBeside, maxRowsBeside } from '@/lib/Cells.js';
import { workingScale } from '@/lib/ImageProcessor.js';
import { baseParams } from '@/store/settings.js';
import { boundsOf } from '@/store/project/shared.js';
import { markRaw } from 'vue';

export const renderingActions = {
  updateCols(val) {
    let num = parseInt(val);
    if (isNaN(num) || num < 1) return;

    if (this.aspectLock && this.image && !this.hasEdits) this.$patch(lockedGrid(num, this.imageRatio));
    else this.cols = Math.min(num, maxColsBeside(this.rows));
  },

  updateRows(val) {
    let num = parseInt(val);
    if (isNaN(num) || num < 1) return;

    if (this.aspectLock && this.image && !this.hasEdits) {
      const cols = Math.max(1, Math.round(num * this.imageRatio));
      this.$patch(gridFits(cols, num) ? { cols, rows: num } : lockedGrid(cols, this.imageRatio));
    } else {
      this.rows = Math.min(num, maxRowsBeside(this.cols));
    }
  },

  // Create the paint and base pixel layers on first use, and follow grid changes. With anything on
  // the edit layer, a grid change is a canvas resize: the image and every layer stay where they
  // are, and the grid gains or loses cells at the right and bottom (what's past the edge is kept,
  // for when it grows back). Otherwise it rescales: the image refits the grid, and the base's own
  // pixels (hard-edged) and pins move with it. The base layer is at the pipeline's processing scale
  // (the new grid's, on a rescale), and the pipeline keeps that scale while it exists.
  ensureLayer() {
    if (!this.image) return;
    const { cols, rows } = this;
    if (!this.paintLayer) {
      const sw = this.image.naturalWidth || this.image.width;
      const sh = this.image.naturalHeight || this.image.height;
      this.fit ??= this.fitFor(cols, rows);
      this.paintLayer = markRaw(new PaintLayer({ cols, rows, scale: this.paintScale ?? editScaleFor(sw, sh, cols, rows) }));
      this.baseLayer = markRaw(new PaintLayer({ cols, rows, scale: this.baseScale ?? this.processingScale(), smooth: false }));
      this.renderer.baseLayer = this.baseLayer;
      this.baseScale = this.baseLayer.scale;
      this._layerGrid = { cols, rows };
      return;
    }
    if (this._layerGrid.cols === cols && this._layerGrid.rows === rows) return;
    this._layerGrid = { cols, rows };
    this.commitPending(); // an open edit (a typing run) was recorded on the old layers
    if (this.hasEdits) {
      const kept = this.paintLayer.extend(cols, rows);
      this.baseLayer.extend(cols, rows);
      this.baseScale = this.baseLayer.scale;
      if (!kept) this.dropEdits(); // the paint had to be resampled, so recorded strokes no longer fit
      return;
    }
    // Recorded edits are in the old layers' pixel coordinates; they can't be replayed onto remapped ones.
    const oldFit = this.fit, newFit = this.fitFor(cols, rows);
    this.paintLayer.resize(cols, rows, oldFit, newFit);
    this.baseLayer.resize(cols, rows, oldFit, newFit, this.processingScale({ fit: newFit }));
    this.baseScale = this.baseLayer.scale;
    this.setBaseRecords(remapBaseRecords(this.baseRecords, resizeTransform(oldFit, newFit), cols, rows));
    this.fit = newFit;
    this.dropEdits();
  },

  // The grid changed under the history: forget the open edit and every step but slider moves (they
  // don't depend on the grid).
  dropEdits() {
    this._stroke = null;
    this.history.retain(entry => entry.settingsOnly);
    this.historyVersion = this.history.version;
  },

  // The pipeline's own processing scale for the grid (not the base layer's), or 1 when the image is
  // smaller than the grid (processed at its native size).
  processingScale(params = {}) {
    return workingScale(this.image, { ...this.processParams, ...params, workScale: null }) ?? 1;
  },

  // Where the image fits a cols x rows grid.
  fitFor(cols, rows) {
    return fitRect(this.image.naturalWidth || this.image.width, this.image.naturalHeight || this.image.height, cols, rows);
  },

  // Full re-render on the next frame (calls in the same frame coalesce).
  // _renderQueued and _rendering say whether one is still to come (tests wait on them).
  render() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(async () => {
      this._renderQueued = false;
      if (!this.image) return;
      this._rendering = true;
      try {
        this.ensureLayer();
        this.renderedCells = await this.renderer.render(this.image, this.processParams, this.paintLayer, baseParams(this.processParams));
        this.activePalette = this.renderer.palette;
        this.applyEditCells();
      } finally {
        this._rendering = false;
      }
    });
  },

  // New composed cells: laid out with their wide characters as what the views show and export.
  // rows: the only rows that changed (an edit's), which are all that need laying out again.
  setCells(composed, rows = null) {
    const partial = rows && this.cells.length === composed.length;
    this.composedCells = composed;
    this.cells = partial ? layoutWideRows(composed, this.cols, this.cells, rows) : layoutWide(composed, this.cols);
  },

  // Rebuild the cells under grid pixels (an edit's) from the output as it is, and their rows' layout.
  recompose(pixels) {
    const rows = new Set();
    for (const { y } of pixels) rows.add(y >> 1);
    this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells), rows);
  },

  // Recomposite the output after the paint or base pixels changed. When that rebalanced the Number
  // palette, every cell's colors can change: the cells are rebuilt from the output (as a full render
  // would, without rerunning the pipeline). While an edit is open (a stroke, a shape) the Number
  // palette holds still and the paint shows in its own colors; commitEdit catches up (rebuild).
  // rect: the grid pixels that changed ({ x, y, w, h }), when an edit knows them.
  composite({ rebuild = false, rect = null } = {}) {
    const hold = !!this._stroke && this.quantize === 'count';
    if (!this.renderer.composite(this.paintLayer, this.processParams, { hold, rect }) && !rebuild) return;
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
    this.setCells(this.renderer.composeAll(this.renderedCells, this.editCells, this.processParams));
  },
};

