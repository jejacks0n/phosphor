import { shallowRef, markRaw } from 'vue';
import { defineStore } from 'pinia';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";
import { rgb2hex, hex2rgb } from "@/lib/ColorUtils.js";
import { fitRect, ctx2d } from "@/lib/Canvas.js";
import { cellIndex, charRowsOf, bakedEntry, halfColors } from "@/lib/Cells.js";
import PaintLayer, { editScaleFor, resizeTransform } from "@/document/PaintLayer.js";
import { EMPTY_BASE, withPins, withoutPins, remapBaseRecords } from "@/document/baseRecords.js";
import Renderer from "@/document/Renderer.js";
import History from "@/document/History.js";
import { cellKey, parseKey, withCellEdit, mergeEntry, withoutCells, shiftRow, rectCells, pasteBlock, updateRect, BLANK } from "@/document/editCells.js";
import { loadImage, readProject, writeProject, saveFile, downloadBlob, PROJECT_EXTENSION } from "@/document/projectIO.js";
import { useWorkspaceStore } from "@/store/WorkspaceStore.js";
import { SETTINGS, SETTING_KEYS, SAUCE_KEYS, RESET_GROUPS, getSetting, settingsState, groupDefaults, baseParams } from "@/store/settings.js";

const MAX_DIMENSION = 300;
const DEFAULT_COLS = getSetting('cols').default;
const DEFAULT_ROWS = getSetting('rows').default;
const BLANK_CANVAS_SCALE = 10;
const TYPING_PAUSE_MS = 1000; // a pause this long ends a typing run (one undo step)

// Settings that feed the image pipeline (processParams); the rest only affect editing, saving or export.
const PIPELINE_KEYS = SETTINGS.filter(s => s.group !== 'sauce' && s.pipeline !== false).map(s => s.key);
const SAVED_KEYS = [...SETTING_KEYS, ...SAUCE_KEYS];
const settingsJson = (state) => JSON.stringify(SAVED_KEYS.map(key => state[key]));

// Cells as cell rects, one per run of neighbours along a row (a base edit keeps only these for undo).
const cellRuns = (cells) => {
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const runs = [];
  for (const { col, row } of sorted) {
    const last = runs.at(-1);
    if (last && last.r0 === row && last.c1 === col - 1) last.c1 = col;
    else runs.push({ c0: col, r0: row, c1: col, r1: row });
  }
  return runs;
};

export const useProjectStore = defineStore('project', {
  state: () => ({
    image: shallowRef(null), // the base picture: the loaded image, or (once the base is edited) a canvas on the grid
    imageBuffer: null, // the image's encoded bytes, saved into .phosphor files (null for an edited picture: encoded on save)
    ...settingsState(),

    hasPaint: false,
    renderer: markRaw(new Renderer()),
    paintLayer: null, // PaintLayer (markRaw); hasPaint mirrors paintLayer.hasPaint for reactivity
    editCells: shallowRef(new Map()), // the edit cells (see document/editCells.js)
    baseRecords: shallowRef(EMPTY_BASE), // the base layer's pinned characters (see document/baseRecords.js)

    filename: null,
    cells: shallowRef([]),          // what the ANSI view shows and exports (renderedCells + edit cells + paint)
    renderedCells: shallowRef([]),  // last full render: generated cells only
    activePalette: shallowRef([]),

    // Dirty tracking: settings differ from the last save/load, or edits were committed since then
    savedSettings: null,
    editVersion: 0,
    savedEditVersion: 0,

    // History for undo/redo
    history: markRaw(new History(50)),
    historyVersion: 0, // mirrors history.version so canUndo/canRedo stay reactive
  }),

  getters: {
    canUndo: (state) => state.historyVersion >= 0 && state.history.canUndo,
    canRedo: (state) => state.historyVersion >= 0 && state.history.canRedo,
    hasEdits: (state) => state.editCells.size > 0 || state.hasPaint,
    isDirty: (state) => settingsJson(state) !== state.savedSettings || state.editVersion !== state.savedEditVersion,
    imageRatio: (state) => {
      if (!state.image) return 1;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      return w / h;
    },
    maxCols: (state) => {
      if (!state.aspectLock || !state.image) return MAX_DIMENSION;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      const ratio = w / h;
      return Math.ceil(Math.min(MAX_DIMENSION, MAX_DIMENSION * ratio));
    },
    maxRows: (state) => {
      if (!state.aspectLock || !state.image) return MAX_DIMENSION;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      const ratio = w / h;
      return Math.ceil(Math.min(MAX_DIMENSION, MAX_DIMENSION / ratio));
    },
    processParams: (state) => ({
      ...Object.fromEntries(PIPELINE_KEYS.map(key => [key, state[key]])),
      chars: state.renderStyle === 'ansi' ? state.chars : state.charsAscii,
      charMode: state.renderStyle === 'ansi' ? 'random' : 'brightness',
      image: state.image,
    }),
  },

  actions: {
    randomizeSeed() {
      this.seed = generateSlug(2);
    },
    async setImageFromFile(file) {
      if (!file) return;

      const buffer = await file.arrayBuffer();
      let image;
      try {
        image = await loadImage(buffer, file.type);
      } catch (e) {
        alert(`Couldn't open ${file.name}: ${e.message}`);
        return;
      }
      const ratio = (image.naturalWidth || 1) / (image.naturalHeight || 1);

      let cols = this.cols;
      let rows = Math.ceil(cols / ratio);
      if (rows > MAX_DIMENSION) {
        rows = MAX_DIMENSION;
        cols = Math.floor(rows * ratio);
      } else if (cols > MAX_DIMENSION) {
        cols = MAX_DIMENSION;
        rows = Math.floor(cols / ratio);
      }

      this.replaceImage(image, buffer, {
        cols: Math.max(1, cols),
        rows: Math.max(1, rows),
        filename: file.name.replace(/\.[^/.]+$/, ''),
        sauceTitle: '',
      });
      this.markSaved();
    },

    async setBlankCanvas() {
      const canvas = document.createElement('canvas');
      canvas.width = (this.cols || DEFAULT_COLS) * BLANK_CANVAS_SCALE;
      canvas.height = (this.rows || DEFAULT_ROWS) * BLANK_CANVAS_SCALE;
      const ctx = ctx2d(canvas);
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      this.replaceImage(await loadImage(blob), await blob.arrayBuffer(), {
        cols: Math.max(1, this.cols || DEFAULT_COLS),
        rows: Math.max(1, this.rows || DEFAULT_ROWS),
        filename: 'untitled',
        sauceTitle: '',
      });
      this.markSaved(); // nothing to lose until something is drawn
    },

    // Swap in a new base image and start a fresh document around it.
    replaceImage(image, imageBuffer, patch = {}) {
      this.renderer.reset();
      this.activePalette = [];
      this.$patch({
        ...patch,
        image: shallowRef(image),
        imageBuffer,
        paintLayer: null,
        editCells: new Map(),
        hasPaint: false,
      });
      this.newDocument();
    },

    // The base layer's records, kept in step with the renderer's copy. They belong to the grid they
    // were made on (render() remaps them when the grid changes); onGrid marks them as made on the
    // current one (a new image, a load, a remap), so an edit between a grid change and that render
    // doesn't relabel old-grid records.
    setBaseRecords(records, { onGrid = false } = {}) {
      this.baseRecords = records;
      this.renderer.baseRecords = records;
      if (onGrid || !this._baseGrid) this._baseGrid = { cols: this.cols, rows: this.rows };
    },

    // The current settings and edits are what's on disk (or there's nothing to lose).
    markSaved() {
      this.savedSettings = settingsJson(this);
      this.savedEditVersion = this.editVersion;
    },

    clearImage() {
      this.renderer.reset();
      this.activePalette = [];
      this.$patch({
        image: null,
        imageBuffer: null,
        filename: null,
        cells: [],
        renderedCells: [],
        paintLayer: null,
        editCells: new Map(),
        hasPaint: false,
      });
      this.newDocument();
      this.markSaved();
    },

    // A fresh document: no base records, no base edits queued, no history, and the selection (and
    // the Picker's last pick) dropped.
    newDocument() {
      this.setBaseRecords(EMPTY_BASE, { onGrid: true });
      this.renderer.baseEdits = new Map();
      this._baseQueue = new Map(); // the open edit's base edits, 'col,row' -> 'erase' | 'flip', until it's committed
      this._baseFlushed = new Set(); // cells whose queued edits are in the picture, until it renders
      this._stroke = null;
      this.clearHistory();
      const workspace = useWorkspaceStore();
      workspace.selection = workspace.selectionOffset = workspace.lastPick = null;
    },

    async saveProject() {
      if (!this.image) return;
      this.commitPending(); // an open typing run counts as saved, not as an edit made after saving

      const settings = Object.fromEntries([...SAVED_KEYS, 'hasPaint'].map(key => [key, this[key]]));
      const blob = await writeProject({
        settings,
        imageBuffer: this.imageBuffer ?? await (await new Promise(resolve => this.image.toBlob(resolve, 'image/png'))).arrayBuffer(),
        paintBlob: this.paintLayer ? await this.paintLayer.toBlob() : null,
        editCells: this.editCells,
        baseRecords: this.baseRecords,
      });
      downloadBlob(blob, `${this.filename}${PROJECT_EXTENSION}`);
      this.markSaved();
    },

    async loadProject(file) {
      if (!file || !file.name.endsWith(PROJECT_EXTENSION)) return;

      try {
        const { settings, imageBuffer, paintBuffer, editCells, baseRecords, erasedCells, migrated } = await readProject(file);
        const image = await loadImage(imageBuffer);
        const paint = paintBuffer && await loadImage(paintBuffer, 'image/png');

        this.replaceImage(image, imageBuffer, { ...settings, filename: file.name.replace(PROJECT_EXTENSION, '') });
        this.editCells = editCells;
        this.setBaseRecords(baseRecords, { onGrid: true });
        if (paint) {
          this.ensureLayer();
          this.paintLayer.load(paint, { width: image.naturalWidth, height: image.naturalHeight }, this.getFitParams(this.cols, this.rows));
          this.hasPaint = this.paintLayer.hasPaint;
          if (migrated) this.keepMigratedLook();
        }
        // Files from before the base was a picture kept erased cells as a record: erase them now
        // (as part of loading, not an edit).
        const onGrid = erasedCells.filter(({ col, row }) => col < this.cols && row < charRowsOf(this.rows));
        if (onGrid.length) {
          this.eraseBase(onGrid);
          this.commitEdit();
          this.clearHistory();
        }
        this.render();
        this.markSaved();
      } catch (e) {
        console.error('Failed to load project file', e);
        alert('Failed to load project file: ' + e.message);
      }
    },

    async exportFile(ext, opts = {}) {
      // .ans is CP437: say which characters it can't keep, and what's written instead, first.
      if (ext === 'ans') {
        const missing = AnsiFile.unmappable(this.cells);
        const list = [...missing].map(([char, { count, as }]) => `${char} ×${count} → ${as}`).join(', ');
        if (missing.size && !confirm(`Some characters can't be saved in .ans and will be replaced: ${list}. Export as .utf8ans to keep them. Export anyway?`)) return;
      }

      const comments = [
        `Created with Phosphor`,
        `Params: seed=${this.seed}, smoothing=${this.smoothing}, quantize=${this.quantize}`,
        `Adjust: brightness=${this.brightness}%, contrast=${this.contrast}%, saturation=${this.saturation}%, invert=${this.invert}%`,
        `Effects: sharpen=${this.sharpen}, flatten=${this.flatten}, edges=${this.edges} (${this.edgeColor}), thickness=${this.edgeThickness}`,
      ];
      if (this.sauceUserComments) {
        comments.push(''); // Spacer
        comments.push(...this.sauceUserComments.split('\n'));
      }

      const blob = new AnsiFile(this.cols, charRowsOf(this.rows), this.cells).toBlob({
        sauce: {
          use9pxFont: this.sauceUse9pxFont,
          fontName: this.sauceFontName,
          title: this.sauceTitle,
          author: this.sauceAuthor,
          group: this.sauceGroup,
          date: this.sauceDate,
          comments,
        },
        colorMode: this.quantize,
        utf8: ext === 'utf8ans',
        ...opts,
      });
      await saveFile(blob, `${this.filename}.${ext}`, ext === 'ans' ? 'ANSI Art File' : 'UTF8 ANSI Art File');
    },

    resetSliders() {
      RESET_GROUPS.forEach(group => this.resetGroup(group));
    },

    resetGroup(group) {
      this.$patch(groupDefaults(group));
    },

    updateCols(val) {
      let num = parseInt(val);
      if (isNaN(num) || num < 1) return;

      let cols = Math.min(MAX_DIMENSION, num);
      let rows = this.rows;

      if (this.aspectLock && this.imageRatio) {
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

      if (this.aspectLock && this.imageRatio) {
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

    // Create the paint layer on first use, or remap it when the grid size changed.
    ensureLayer() {
      if (!this.image) return;
      if (!this.paintLayer) {
        const sw = this.image.naturalWidth || this.image.width;
        const sh = this.image.naturalHeight || this.image.height;
        this.paintLayer = markRaw(new PaintLayer({ cols: this.cols, rows: this.rows, scale: editScaleFor(sw, sh, this.cols, this.rows) }));
      } else if (this.paintLayer.cols !== this.cols || this.paintLayer.rows !== this.rows) {
        this.paintLayer.resize(this.cols, this.rows, this.getFitParams(this.paintLayer.cols, this.paintLayer.rows), this.getFitParams(this.cols, this.rows));
        // Recorded edits are in the old layer's pixel coordinates; they can't be replayed onto the remapped layer.
        this.dropEdits();
      }
    },

    // After a grid change, move the base records with the picture (as ensureLayer moves the paint).
    // Like the paint's, the history can't be replayed onto the new grid, so it's cleared.
    remapBaseRecords() {
      const from = this._baseGrid;
      if (!from || (from.cols === this.cols && from.rows === this.rows)) return;
      const records = this.baseRecords;
      const moved = remapBaseRecords(records, resizeTransform(this.getFitParams(from.cols, from.rows), this.getFitParams(this.cols, this.rows)), this.cols, this.rows);
      this.setBaseRecords(moved, { onGrid: true });
      if (moved !== records) this.dropEdits();
    },

    // The grid changed under the history: forget it, the open edit and the base edits it queued.
    dropEdits() {
      this._baseQueue.forEach((op, key) => this.renderer.baseEdits.delete(key));
      this._baseQueue.clear();
      this._stroke = null;
      this.clearHistory();
    },

    getFitParams(w, h) {
      if (!this.image) return { dx: 0, dy: 0, dw: w, dh: h };
      return fitRect(this.image.naturalWidth || this.image.width, this.image.naturalHeight || this.image.height, w, h);
    },

    // Full re-render on the next frame (calls in the same frame coalesce).
    render() {
      if (this._renderQueued) return;
      this._renderQueued = true;
      requestAnimationFrame(async () => {
        this._renderQueued = false;
        if (!this.image) return;
        this.ensureLayer();
        this.remapBaseRecords();
        // Base edits in the picture are drawn from it from now on (unless the cell is being edited again).
        this._baseFlushed.forEach(key => this._baseQueue.has(key) || this.renderer.baseEdits.delete(key));
        this._baseFlushed.clear();
        this.renderedCells = await this.renderer.render(this.image, this.processParams, this.paintLayer, baseParams(this.processParams));
        this.activePalette = this.renderer.palette;
        this.applyEditCells();
      });
    },

    // After the paint layer changed under `pixels`: recomposite and rebuild just those cells.
    refreshCells(pixels) {
      this.renderer.composite(this.paintLayer, this.processParams);
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.editCells, this.renderedCells);
    },

    // The colour under grid pixel (x, y) before adjustments: paint if there is any, else the source.
    rawColorAt(x, y) {
      if (!this.image) return '#000000';
      this.ensureLayer();
      x = Math.floor(x);
      y = Math.floor(y);
      const painted = this.paintLayer?.colorAt(x, y);
      return painted ? rgb2hex(painted) : this.baseColorAt(x, y);
    },

    // The base layer's colour at grid pixel (x, y), as stored (before adjustments): a cell being
    // erased has its blank colours (background on top, foreground below), one being flipped its
    // other half's, else the picture's.
    baseColorAt(x, y) {
      const op = this.renderer.baseEdits.get(cellKey(x, Math.floor(y / 2)));
      if (op === 'erase') return y % 2 ? BLANK.fg : BLANK.bg;
      return this.imageColorAt(x, op === 'flip' ? y ^ 1 : y);
    },

    // The image under grid pixel (x, y) before adjustments, as the pipeline downsamples it.
    imageColorAt(x, y) {
      const source = this.renderer.imageAt(x, y, this.cols, this.rows);
      return source ? rgb2hex(source) : '#000000';
    },

    // What's under a cell, as stored colours (pre-adjustment), for the eyedropper, flip and merge up.
    // Spec "Bake and the eyedropper on generated cells" (bake is now Merge up), trial rule (a): stored colours are the
    // pre-adjustment ones, so they keep following the adjustments. withPaint: paint (on top) wins
    // per half; otherwise edit-cell attributes, then the source image.
    underlyingAt(col, row, { withPaint = true } = {}) {
      const entry = this.editCellAt(col, row) ?? {};
      const half = (y, attr) => {
        const painted = withPaint && this.paintLayer?.colorAt(col, y);
        if (painted) return rgb2hex(painted);
        return entry[attr] ?? this.baseColorAt(col, y);
      };
      const i = cellIndex(col, row, this.cols);
      const shown = withPaint ? this.cells[i] : null;
      return {
        char: shown?.char ?? entry.char ?? this.renderedCells[i]?.char ?? ' ',
        bg: half(2 * row, 'bg'),
        fg: half(2 * row + 1, 'fg'),
      };
    },

    paintEditPixels(pixels, opacity = 100) {
      if (!pixels.length || !this.renderer.outputCanvas) return;
      this.ensureLayer();
      this.beginEdit();
      this.paintLayer.paint(pixels, opacity);
      this.hasPaint = this.paintLayer.hasPaint;

      this.refreshCells(pixels);
    },

    // Paint grid pixels ({ x, y, alpha }) in color (default: the foreground colour) at the brush opacity.
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

    editCellAt(col, row) {
      return this.editCells.get(cellKey(col, row));
    },

    // Set (string), clear (null) or keep (undefined) a cell's edit-cell char/fg/bg. clearPaint removes
    // the paint in that cell, so the edit shows (the last edit to a cell wins).
    editCell(col, row, attrs, { clearPaint = false } = {}) {
      this.ensureLayer();
      this.beginEdit();
      const pixels = [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }];
      if (clearPaint && this.cellHasPaint(col, row)) {
        this.paintLayer.erase(pixels);
        this.renderer.composite(this.paintLayer, this.processParams);
      }
      this.editCells = withCellEdit(this.editCells, col, row, attrs);
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.editCells, this.renderedCells);
    },

    // Typing: one undo entry per keystroke. Typed cells sit above paint (the last edit wins).
    typeAt(col, row, char, attrs, { insert = false } = {}) {
      this.typing(() => {
        if (insert) this.shiftCells(row, col, 1);
        this.editCell(col, row, { char, ...attrs }, { clearPaint: true });
      });
    },

    backspaceAt(col, row, attrs, { insert = false } = {}) {
      if (col < 1) return;
      this.typing(() => {
        if (insert) this.shiftCells(row, col, -1);
        else this.editCell(col - 1, row, { char: ' ', ...attrs }, { clearPaint: true });
      });
    },

    deleteAt(col, row) {
      this.typing(() => this.shiftCells(row, col + 1, -1));
    },

    // A run of typing is one undo step: its stroke stays open across keystrokes and is committed
    // after a pause, by any other edit (beginEdit), or by undo/redo/save (commitPending).
    typing(fn) {
      this.ensureLayer();
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

    // Move a row's edit cells (insert/delete); paint stays where it is.
    shiftCells(row, fromCol, delta) {
      const next = shiftRow(this.editCells, row, fromCol, delta, this.cols);
      if (next === this.editCells) return;
      this.editCells = next;
      const pixels = Array.from({ length: this.cols }, (_, x) => ({ x, y: 2 * row }));
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.editCells, this.renderedCells);
    },

    // --- Selection: each operation is one undo step, and none at all when nothing changes.

    // The whole grid as a rect (Merge up and Select all with no selection).
    gridRect() {
      return { c0: 0, r0: 0, c1: this.cols - 1, r1: charRowsOf(this.rows) - 1 };
    },

    // Swap in a new cell layer and recompose just the cells in rects (the rest, including paint made
    // since the last full render, is left as it is).
    setEditCells(next, rects) {
      if (next === this.editCells) return;
      this.ensureLayer();
      this.beginEdit();
      this.editCells = next;
      const pixels = rects.flatMap(rect => rectCells(rect)).map(({ col, row }) => ({ x: col, y: 2 * row }));
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.editCells, this.renderedCells);
      this.commitEdit();
    },

    // The base layer's cell (no edits, no paint), as stored colours: a cell being erased is BLANK;
    // otherwise the converter's character (or the pinned one) on the picture's colours (bg the top
    // half, fg the bottom).
    baseCellAt(col, row) {
      const key = cellKey(col, row);
      if (this.renderer.baseEdits.get(key) === 'erase') return { ...BLANK };
      return {
        char: this.baseRecords.pins.get(key) ?? this.renderedCells[cellIndex(col, row, this.cols)]?.char ?? ' ',
        bg: this.baseColorAt(col, 2 * row),
        fg: this.baseColorAt(col, 2 * row + 1),
      };
    },

    // Erase the base layer in these cells: black pixels with a pinned space. They show blank at once
    // and go into the picture when the edit is committed (one picture change for a whole eraser
    // stroke); effects then run on the black too (Edges outlines an erased patch). Part of the
    // current edit; the caller commits it.
    eraseBase(cells) {
      this.queueBase(cells, 'erase');
    },

    // Flip the base layer in these cells: swap each cell's two halves (background and foreground).
    // Shown at once, into the picture at the commit, like eraseBase.
    flipBase(cells) {
      this.queueBase(cells, 'flip');
    },

    // Queue base edits for the open edit; the renderer shows them until the picture does.
    queueBase(cells, op) {
      const fresh = cells.filter(({ col, row }) => !this._baseQueue.has(cellKey(col, row)));
      if (!fresh.length) return;
      this.ensureLayer();
      this.beginEdit();
      for (const { col, row } of fresh) {
        this._baseQueue.set(cellKey(col, row), op);
        this.renderer.baseEdits.set(cellKey(col, row), op);
      }
      this.refreshCells(fresh.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
    },

    // At a commit, the queued base edits go into the picture: an erased cell is black with a pinned
    // space; a flipped one has its halves swapped.
    flushBase() {
      if (!this._baseQueue.size) return;
      const queued = [...this._baseQueue].map(([key, op]) => ({ ...parseKey(key), op }));
      this._baseQueue.forEach((op, key) => this._baseFlushed.add(key));
      this._baseQueue.clear();
      this.editBase(cellRuns(queued), (ctx, cellRect) => {
        ctx.fillStyle = BLANK.bg;
        for (const { col, row, op } of queued) {
          const { x, y, w, h } = cellRect(col, row);
          if (op === 'erase') {
            ctx.fillRect(x, y, w, h);
            continue;
          }
          const top = ctx.getImageData(x, y, w, h / 2);
          ctx.putImageData(ctx.getImageData(x, y + h / 2, w, h / 2), x, y);
          ctx.putImageData(top, x, y + h / 2);
        }
      });
      const erased = queued.filter(({ op }) => op === 'erase');
      this.setBaseRecords(withPins(this.baseRecords, erased.map(({ col, row }) => ({ col, row, char: ' ' }))));
    },

    // Change the base picture inside cell rects: change(ctx, cellRect) draws on it, where
    // cellRect(col, row) is the cell's { x, y, w, h } in picture pixels (the top half is the first
    // h / 2). The first base edit (and the first after a grid resize) turns the image into a
    // picture on the grid at the paint layer's resolution, as Merge down does: a one-time resample.
    // Part of the current edit (the stroke keeps the rects' pixels for undo); the caller commits it.
    editBase(rects, change) {
      if (!this.image) return;
      this.ensureLayer();
      this.beginEdit();
      if (!this._stroke) return;
      const k = this.paintLayer.scale;
      if (!(this.image instanceof HTMLCanvasElement) || this.image.width !== this.cols * k || this.image.height !== this.rows * k) {
        this.$patch({ image: shallowRef(this.paintLayer.picture(this.image, this.getFitParams(this.cols, this.rows))), imageBuffer: null });
      }
      const ctx = ctx2d(this.image);
      for (const { c0, r0, c1, r1 } of rects) {
        const area = { x: c0 * k, y: 2 * r0 * k, w: (c1 - c0 + 1) * k, h: 2 * (r1 - r0 + 1) * k };
        this._stroke.pictures.push({ canvas: this.image, area, before: ctx.getImageData(area.x, area.y, area.w, area.h) });
      }
      change(ctx, (col, row) => ({ x: col * k, y: 2 * row * k, w: k, h: 2 * k }));
      this.renderer.pictureChanged();
    },

    // A whole entry for a cell as the cell layer shows it: its own attributes, the rest frozen from
    // the image the way the render style shows it (bakedEntry). Paint isn't part of it; it stays put.
    completeAt(col, row, entry) {
      return { ...bakedEntry(this.renderStyle, this.baseCellAt(col, row)), ...entry };
    },

    // Merge up: what the base shows in rect (or the whole grid) becomes edit cells (an edit cell's own
    // attributes stay), and pins there are dropped, since the characters are now edit cells. One undo step.
    mergeUp(rect) {
      const area = rect ?? this.gridRect();
      this.selectionEdit([area], () => {
        this.editCells = updateRect(this.editCells, area, (col, row, entry) => this.completeAt(col, row, entry));
        this.setBaseRecords(withoutPins(this.baseRecords, rectCells(area)));
      });
    },

    // Selection operations on the Select tool's layers: Layers = { base, edit }, where Edit is
    // everything drawn (edit cells and paint, stored apart but one thing to the user), and Base is
    // the picture's pixels and pins (the converter's own characters belong to their cells and stay).
    // Each layer moves, copies and pastes as itself. Block = { w, h, cells?: (Entry | null)[],
    // paint?: canvas, base?: { picture: canvas, pins: (char | null)[] } }. Each change is one undo
    // step; rects are clipped to the grid.

    clipRect({ c0, r0, c1, r1 }) {
      const rect = { c0: Math.max(0, c0), r0: Math.max(0, r0), c1: Math.min(this.cols - 1, c1), r1: Math.min(charRowsOf(this.rows) - 1, r1) };
      return rect.c0 <= rect.c1 && rect.r0 <= rect.r1 ? rect : null;
    },

    copySelection(rect, { base, edit }) {
      this.ensureLayer();
      const block = { w: rect.c1 - rect.c0 + 1, h: rect.r1 - rect.r0 + 1 };
      const cells = rectCells(rect);
      if (edit) {
        block.cells = cells.map(({ col, row }) => this.editCellAt(col, row) ?? null);
        if (this.paintLayer) block.paint = this.paintLayer.copyCells(rect);
      }
      if (base) block.base = { picture: this.basePictureOf(rect), pins: cells.map(({ col, row }) => this.baseRecords.pins.get(cellKey(col, row)) ?? null) };
      return block;
    },

    // The base picture over a cell rect, as a canvas at the paint layer's scale (from the image at
    // its fit, when the base hasn't been edited yet).
    basePictureOf({ c0, r0, c1, r1 }) {
      const k = this.paintLayer.scale, fit = this.getFitParams(this.cols, this.rows);
      const out = document.createElement('canvas');
      out.width = (c1 - c0 + 1) * k;
      out.height = 2 * (r1 - r0 + 1) * k;
      const ctx = ctx2d(out);
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.image, (fit.dx - c0) * k, (fit.dy - 2 * r0) * k, fit.dw * k, fit.dh * k);
      return out;
    },

    deleteSelection(rect, layers) {
      this.selectionEdit([rect], () => this.deleteIn(rect, layers));
    },

    // Returns the pasted rect (clipped), or null when it's all off the grid.
    pasteSelection(block, col, row) {
      const rect = this.clipRect({ c0: col, r0: row, c1: col + block.w - 1, r1: row + block.h - 1 });
      if (rect) this.selectionEdit([rect], () => this.pasteAt(block, col, row));
      return rect;
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
        this.pasteAt(block, col, row);
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

    pasteAt(block, col, row) {
      if (block.cells) this.editCells = pasteBlock(this.editCells, { w: block.w, h: block.h, entries: block.cells }, col, row, this.cols, charRowsOf(this.rows));
      if (block.paint) this.paintLayer.pasteCells(block.paint, col, row, block.w, block.h);
      if (block.base) this.pasteBase(block, col, row);
    },

    // A block's base at (col, row): its picture over the base picture's, and its pins (a cell with
    // none takes the converter's character there). Cells it lands on aren't erased by the same edit
    // (a move's source overlapping where it lands).
    pasteBase({ w, h, base }, col, row) {
      const rect = this.clipRect({ c0: col, r0: row, c1: col + w - 1, r1: row + h - 1 });
      if (!rect) return;
      for (const cell of rectCells(rect)) {
        const key = cellKey(cell.col, cell.row);
        if (this._baseQueue.get(key) !== 'erase') continue;
        this._baseQueue.delete(key);
        this.renderer.baseEdits.delete(key);
      }
      this.editBase([rect], (ctx, cellRect) => {
        const at = cellRect(col, row);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(base.picture, at.x, at.y, w * at.w, h * at.h); // a block copied before a grid resize still fits
      });
      const pins = base.pins.map((char, i) => ({ col: col + (i % w), row: row + Math.floor(i / w), char }))
        .filter(({ col: c, row: r }) => c >= rect.c0 && c <= rect.c1 && r >= rect.r0 && r <= rect.r1);
      this.setBaseRecords(withPins(withoutPins(this.baseRecords, pins.filter(p => !p.char)), pins.filter(p => p.char)));
    },

    // One undo step for a selection operation's changes (cells, paint, picture, pins); the cells in rects recompose.
    selectionEdit(rects, change) {
      this.ensureLayer();
      this.beginEdit();
      change();
      this.hasPaint = this.paintLayer?.hasPaint ?? false;
      this.renderer.composite(this.paintLayer, this.processParams);
      const pixels = rects.flatMap(rect => rectCells(rect)).map(({ col, row }) => ({ x: col, y: 2 * row }));
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.editCells, this.renderedCells);
      this.commitEdit();
    },

    // Many cell edits at once ([{ col, row, attrs }], e.g. a shape): one Map copy, one paint erase.
    // Part of the current edit; the caller commits it.
    writeEditCells(list, { clearPaint = false } = {}) {
      if (!list.length) return;
      this.ensureLayer();
      this.beginEdit();
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
        this.renderer.composite(this.paintLayer, this.processParams);
      }
      this.editCells = next;
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.editCells, this.renderedCells);
    },

    // Remove edit cells so the image shows through.
    clearEditCells(cells) {
      const next = withoutCells(this.editCells, cells);
      if (next === this.editCells) return;
      this.ensureLayer();
      this.beginEdit();
      this.editCells = next;
      const pixels = cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.editCells, this.renderedCells);
    },

    cellHasPaint(col, row) {
      return !!(this.paintLayer?.colorAt(col, 2 * row) || this.paintLayer?.colorAt(col, 2 * row + 1));
    },

    // Flip a cell's colours on the chosen layers. Edit: the paint (as it shows) or the edit cell's
    // own colours; a cell with neither gets the flip as paint, unless the base is flipping it. Base:
    // the picture's two halves. The edit side goes first, while the cell still shows unflipped.
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

    // Swap a cell's two pixels in the paint layer, using the real colours from the output canvas
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

    applyEditCells() {
      if (!this.renderedCells.length) return;
      this.cells = this.renderer.composeAll(this.renderedCells, this.editCells, this.processParams);
    },

    // Files from before the cell layer drew char edits over paint; now paint draws over edit
    // cells. A migrated char edit on paint takes that paint's colours and the paint is removed, so
    // the file looks as it did. Runs on load, before it's marked saved; not undoable.
    keepMigratedLook() {
      let next = this.editCells;
      const pixels = [];
      for (const [key, entry] of this.editCells) {
        const { col, row } = parseKey(key);
        if (!this.cellHasPaint(col, row)) continue;
        // Only painted halves take the paint's colour; an unpainted half keeps showing the image.
        const painted = (y) => {
          const color = this.paintLayer.colorAt(col, y);
          return color ? rgb2hex(color) : undefined;
        };
        next = withCellEdit(next, col, row, { bg: painted(2 * row), fg: painted(2 * row + 1), char: entry.char });
        pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
      }
      if (!pixels.length) return;
      this.editCells = next;
      this.paintLayer.erase(pixels);
      this.hasPaint = this.paintLayer.hasPaint;
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

    // An edit (stroke, fill, cell edit) records from its first change until commitEdit().
    beginEdit() {
      if (this._stroke?.typing && !this._typingNow) this.commitEdit(); // another edit ends a typing run
      if (this._stroke || !this.paintLayer) return;
      // Raw, so commitEdit's identity checks see the same objects; pictures: editBase's changed areas.
      this._stroke = markRaw({ editCells: this.editCells, baseRecords: this.baseRecords, image: this.image, imageBuffer: this.imageBuffer, pictures: [] });
      this.paintLayer.beginStroke();
    },

    // End of a user edit: one undo entry for its paint tiles, cell-layer, pin and picture changes,
    // and it counts as unsaved.
    commitEdit() {
      if (this._stroke) this.flushBase();
      const stroke = this._stroke;
      this._stroke = null;
      const patch = this.paintLayer?.endStroke();
      // The picture's changed areas, before and after (undo puts them back in reverse order); an
      // area erased again, say, didn't change. A first base edit also swapped the image for the
      // picture, so undo brings the image back.
      const pictures = (stroke?.pictures ?? [])
        .map(({ canvas, area, before }) => ({ canvas, area, before, after: ctx2d(canvas).getImageData(area.x, area.y, area.w, area.h) }))
        .filter(({ before, after }) => before.data.some((v, i) => v !== after.data[i]));
      // Render the edited pixels (effects run on them again), and queued edits that changed nothing
      // (erasing black, flipping equal halves), so they show as the picture does, not as the preview.
      if (pictures.length || this._baseFlushed.size) this.render();
      if (!stroke || (!patch && !pictures.length && stroke.image === this.image && stroke.editCells === this.editCells && stroke.baseRecords === this.baseRecords)) return;

      const sides = {
        before: { editCells: stroke.editCells, baseRecords: stroke.baseRecords, image: stroke.image, imageBuffer: stroke.imageBuffer },
        after: { editCells: this.editCells, baseRecords: this.baseRecords, image: this.image, imageBuffer: this.imageBuffer },
      };
      const apply = (side) => {
        const { editCells, baseRecords, image, imageBuffer } = sides[side];
        if (patch) this.paintLayer.applyPatch(patch, side);
        this.hasPaint = this.paintLayer.hasPaint;
        this.editCells = editCells;
        this.setBaseRecords(baseRecords);
        (side === 'before' ? [...pictures].reverse() : pictures).forEach(p => ctx2d(p.canvas).putImageData(p[side], p.area.x, p.area.y));
        if (pictures.length) this.renderer.pictureChanged();
        if (image !== this.image) this.$patch({ image: shallowRef(image), imageBuffer });
        this.render();
      };
      this.pushEdit({ undo: () => apply('before'), redo: () => apply('after') });
    },

    // Fold an unfinished stroke into history before an edit that replaces the whole layer.
    commitPending() {
      if (this._stroke) this.commitEdit();
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

    // Merge down: the whole edit layer goes into the base picture. The new picture is the picture,
    // then every edit cell, then the paint, so the converter rebuilds what showed: each edit cell as
    // its background (top) and foreground (bottom) pixels with its character pinned; a cell that
    // showed a different character (▄ for a solid one under paint) as its two half colours with the
    // shown character pinned. Paint over a pinned cell (an erased one's space) pins what it shows too.
    async mergeDown() {
      if (!this.image) return;
      this.ensureLayer();
      this.commitPending();

      const rows = charRowsOf(this.rows);
      const shownChar = (col, row) => this.cells[cellIndex(col, row, this.cols)]?.char;
      const merged = [];   // { col, row, top, bottom, char }: edit cells, drawn under the paint
      for (const [key, entry] of this.editCells) {
        const { col, row } = parseKey(key);
        if (col >= this.cols || row >= rows) continue;
        const cell = { ...this.baseCellAt(col, row), ...entry };
        const char = shownChar(col, row) ?? cell.char;
        // Color ASCII shows only the foreground (on black) and rebuilds it as the halves' average.
        const [top, bottom] = this.renderStyle === 'colorAscii' ? [hex2rgb(cell.fg), hex2rgb(cell.fg)]
          : char === cell.char ? [hex2rgb(cell.bg), hex2rgb(cell.fg)]
            : halfColors({ char: cell.char, fg: hex2rgb(cell.fg), bg: hex2rgb(cell.bg) });
        merged.push({ col, row, top, bottom, char });
      }
      const paintedPins = [...this.baseRecords.pins.keys()].map(parseKey)
        .filter(({ col, row }) => !this.editCells.has(cellKey(col, row)) && this.cellHasPaint(col, row))
        .map(({ col, row }) => ({ col, row, char: shownChar(col, row) ?? '▄' }));
      const beneath = (ctx, k) => {
        const fill = (rgb, x, y) => {
          ctx.fillStyle = rgb2hex(rgb);
          ctx.fillRect(x * k, y * k, k, k);
        };
        for (const { col, row, top, bottom } of merged) {
          fill(top, col, 2 * row);
          fill(bottom, col, 2 * row + 1);
        }
      };

      const before = { image: this.image, imageBuffer: this.imageBuffer, paintLayer: this.paintLayer.snapshot(), editCells: this.editCells, baseRecords: this.baseRecords };
      const version = this.historyVersion;
      const baked = this.paintLayer.bake(this.image, this.getFitParams(this.cols, this.rows), beneath);
      const blob = await new Promise(resolve => baked.toBlob(resolve, 'image/png'));
      const pins = [...merged.map(({ col, row, char }) => ({ col, row, char })), ...paintedPins];
      const after = { image: await loadImage(blob), imageBuffer: await blob.arrayBuffer(), paintLayer: null, editCells: new Map(), baseRecords: withPins(before.baseRecords, pins) };
      // Something changed while this merge was encoding (a new image, an edit): merging now would lose it.
      if (this.image !== before.image || this.historyVersion !== version || this._stroke) return;
      const apply = ({ image, imageBuffer, paintLayer, editCells, baseRecords }) => {
        this.$patch({ image: shallowRef(image), imageBuffer });
        this.paintLayer.restore(paintLayer);
        this.hasPaint = this.paintLayer.hasPaint;
        this.editCells = editCells;
        this.setBaseRecords(baseRecords);
        this.render();
      };
      apply(after);
      this.pushEdit({ undo: () => apply(before), redo: () => apply(after) });
    },
  },
});

