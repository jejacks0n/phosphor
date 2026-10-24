// The grid and what's drawn on it: the grid's size (rescale or canvas resize), the paint and base
// layers following it, full renders and partial recomposites, and the cells the views show. Owns
// _renderQueued and _rendering (a render on its way, which tests wait on) and _layerGrid (the grid
// the layers were last sized to).
import PaintLayer, { editScaleFor, resizeTransform } from "@/document/PaintLayer.js";
import { remapBaseRecords } from "@/document/baseRecords.js";
import { fitRect } from "@/lib/Canvas.js";
import { layoutWide } from "@/lib/Cells.js";
import { MAX_DIMENSION } from "@/store/project/shared.js";
import { baseParams } from "@/store/settings.js";
import { markRaw } from "vue";

export const renderingActions = {
  updateCols(val) {
    let num = parseInt(val);
    if (isNaN(num) || num < 1) return;

    let cols = Math.min(MAX_DIMENSION, num);
    let rows = this.rows;

    if (this.aspectLock && this.imageRatio && !this.hasEdits) {
      rows = Math.ceil(cols / this.imageRatio);
      if (rows > MAX_DIMENSION) {
        rows = MAX_DIMENSION;
        cols = Math.floor(rows * this.imageRatio);
      }
    }

    this.$patch({
      cols: Math.max(0, cols),
      rows: Math.max(0, rows)
    });
  },

  updateRows(val) {
    let num = parseInt(val);
    if (isNaN(num) || num < 1) return;

    let rows = Math.min(MAX_DIMENSION, num);
    let cols = this.cols;

    if (this.aspectLock && this.imageRatio && !this.hasEdits) {
      cols = Math.round(rows * this.imageRatio);
      if (cols > MAX_DIMENSION) {
        cols = MAX_DIMENSION;
        rows = Math.floor(cols / this.imageRatio);
      }
    }

    this.$patch({
      cols: Math.max(0, cols),
      rows: Math.max(0, rows)
    });
  },

  // Create the paint and base pixel layers on first use, and follow grid changes. With anything on
  // the edit layer, a grid change is a canvas resize: the image and every layer stay where they
  // are, and the grid gains or loses cells at the right and bottom (what's past the edge is kept,
  // for when it grows back). Otherwise it rescales: the image refits the grid, and the base's own
  // pixels (grid pixels, scale 1, hard-edged) and pins move with it.
  ensureLayer() {
    if (!this.image) return;
    const { cols, rows } = this;
    if (!this.paintLayer) {
      const sw = this.image.naturalWidth || this.image.width;
      const sh = this.image.naturalHeight || this.image.height;
      this.fit ??= this.fitFor(cols, rows);
      this.paintLayer = markRaw(new PaintLayer({ cols, rows, scale: this.paintScale ?? editScaleFor(sw, sh, cols, rows) }));
      this.baseLayer = markRaw(new PaintLayer({ cols, rows, scale: 1, smooth: false }));
      this.renderer.baseLayer = this.baseLayer;
      this._layerGrid = { cols, rows };
      return;
    }
    if (this._layerGrid.cols === cols && this._layerGrid.rows === rows) return;
    this._layerGrid = { cols, rows };
    this.commitPending(); // an open edit (a typing run) was recorded on the old layers
    if (this.hasEdits) {
      const kept = this.paintLayer.extend(cols, rows);
      this.baseLayer.extend(cols, rows);
      if (!kept) this.dropEdits(); // the paint had to be resampled, so recorded strokes no longer fit
      return;
    }
    // Recorded edits are in the old layers' pixel coordinates; they can't be replayed onto remapped ones.
    const oldFit = this.fit, newFit = this.fitFor(cols, rows);
    this.paintLayer.resize(cols, rows, oldFit, newFit);
    this.baseLayer.resize(cols, rows, oldFit, newFit);
    this.setBaseRecords(remapBaseRecords(this.baseRecords, resizeTransform(oldFit, newFit), cols, rows));
    this.fit = newFit;
    this.dropEdits();
  },

  // The grid changed under the history: forget it and the open edit.
  dropEdits() {
    this._stroke = null;
    this.clearHistory();
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
  setCells(composed) {
    this.composedCells = composed;
    this.cells = layoutWide(composed, this.cols);
  },

  // Recomposite the output after the paint or base pixels changed. When that rebalanced the Number
  // palette, every cell's colors can change: the cells are rebuilt from the output (as a full render
  // would, without rerunning the pipeline). While an edit is open (a stroke, a shape) the Number
  // palette holds still and the paint shows in its own colors; commitEdit catches up (rebuild).
  composite({ rebuild = false } = {}) {
    const hold = !!this._stroke && this.quantize === 'count';
    if (!this.renderer.composite(this.paintLayer, this.processParams, { hold }) && !rebuild) return;
    this.activePalette = this.renderer.palette;
    this.renderedCells = this.renderer.cellsFromOutput(this.processParams);
    this.applyEditCells();
  },

  // After the paint or base pixels changed under `pixels`: recomposite and rebuild just those cells.
  refreshCells(pixels) {
    this.composite();
    this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
  },

  applyEditCells() {
    if (!this.renderedCells.length) return;
    this.setCells(this.renderer.composeAll(this.renderedCells, this.editCells, this.processParams));
  },
};
