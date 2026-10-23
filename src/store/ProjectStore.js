import { shallowRef, markRaw } from 'vue';
import { defineStore } from 'pinia';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";
import { rgb2hex, hex2rgb } from "@/lib/ColorUtils.js";
import { fitRect, ctx2d } from "@/lib/Canvas.js";
import { cellIndex, charRowsOf, bakedEntry } from "@/lib/Cells.js";
import EditLayer, { editScaleFor, resizeTransform } from "@/document/EditLayer.js";
import { EMPTY_BASE, withErased, remapBaseRecords } from "@/document/baseRecords.js";
import Renderer from "@/document/Renderer.js";
import History from "@/document/History.js";
import { cellKey, parseKey, withCellEdit, mergeEntry, withoutCells, shiftRow, rectCells, pasteBlock, updateRect, copyCellLayers, deleteCellLayers, BLANK } from "@/document/cellEdits.js";
import { loadImage, readProject, writeProject, saveFile, downloadBlob, PROJECT_EXTENSION } from "@/document/projectIO.js";
import { useWorkspaceStore } from "@/store/WorkspaceStore.js";
import { SETTINGS, SETTING_KEYS, SAUCE_KEYS, RESET_GROUPS, getSetting, settingsState, groupDefaults, sourceParams } from "@/store/settings.js";

const MAX_DIMENSION = 300;
const DEFAULT_COLS = getSetting('cols').default;
const DEFAULT_ROWS = getSetting('rows').default;
const BLANK_CANVAS_SCALE = 10;
const TYPING_PAUSE_MS = 1000; // a pause this long ends a typing run (one undo step)

// Settings that feed the image pipeline (processParams); the rest only affect editing, saving or export.
const PIPELINE_KEYS = SETTINGS.filter(s => s.group !== 'sauce' && s.pipeline !== false).map(s => s.key);
const SAVED_KEYS = [...SETTING_KEYS, ...SAUCE_KEYS];
const settingsJson = (state) => JSON.stringify(SAVED_KEYS.map(key => state[key]));

export const useProjectStore = defineStore('project', {
  state: () => ({
    image: shallowRef(null),
    imageBuffer: null, // the image's encoded bytes, saved into .phosphor files
    ...settingsState(),

    hasPaint: false,
    renderer: markRaw(new Renderer()),
    layer: null, // EditLayer (markRaw); hasPaint mirrors layer.hasPaint for reactivity
    cellEdits: shallowRef(new Map()), // the authored cell layer (see document/cellEdits.js)
    baseRecords: shallowRef(EMPTY_BASE), // the base layer's erased cells and pins (see document/baseRecords.js)

    filename: null,
    cells: shallowRef([]),          // what the ANSI view shows and exports (renderedCells + authored cells + paint)
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
    hasEdits: (state) => state.cellEdits.size > 0 || state.hasPaint,
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
        layer: null,
        cellEdits: new Map(),
        hasPaint: false,
      });
      this.setBaseRecords(EMPTY_BASE, { onGrid: true });
      this._stroke = null;
      this.clearHistory();
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
        layer: null,
        cellEdits: new Map(),
        hasPaint: false,
      });
      this.setBaseRecords(EMPTY_BASE, { onGrid: true });
      this._stroke = null;
      this.clearHistory();
      this.markSaved();
    },

    async saveProject() {
      if (!this.image || !this.imageBuffer) return;
      this.commitPending(); // an open typing run counts as saved, not as an edit made after saving

      const settings = Object.fromEntries([...SAVED_KEYS, 'hasPaint'].map(key => [key, this[key]]));
      const blob = await writeProject({
        settings,
        imageBuffer: this.imageBuffer,
        paintBlob: this.layer ? await this.layer.toBlob() : null,
        cellEdits: this.cellEdits,
        baseRecords: this.baseRecords,
      });
      downloadBlob(blob, `${this.filename}${PROJECT_EXTENSION}`);
      this.markSaved();
    },

    async loadProject(file) {
      if (!file || !file.name.endsWith(PROJECT_EXTENSION)) return;

      try {
        const { settings, imageBuffer, paintBuffer, cellEdits, baseRecords, migrated } = await readProject(file);
        const image = await loadImage(imageBuffer);
        const paint = paintBuffer && await loadImage(paintBuffer, 'image/png');

        this.replaceImage(image, imageBuffer, { ...settings, filename: file.name.replace(PROJECT_EXTENSION, '') });
        this.cellEdits = cellEdits;
        this.setBaseRecords(baseRecords, { onGrid: true });
        if (paint) {
          this.ensureLayer();
          this.layer.load(paint, { width: image.naturalWidth, height: image.naturalHeight }, this.getFitParams(this.cols, this.rows));
          this.hasPaint = this.layer.hasPaint;
          if (migrated) this.keepMigratedLook();
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
      if (!this.layer) {
        const sw = this.image.naturalWidth || this.image.width;
        const sh = this.image.naturalHeight || this.image.height;
        this.layer = markRaw(new EditLayer({ cols: this.cols, rows: this.rows, scale: editScaleFor(sw, sh, this.cols, this.rows) }));
      } else if (this.layer.cols !== this.cols || this.layer.rows !== this.rows) {
        this.layer.resize(this.cols, this.rows, this.getFitParams(this.layer.cols, this.layer.rows), this.getFitParams(this.cols, this.rows));
        // Recorded edits are in the old layer's pixel coordinates; they can't be replayed onto the remapped layer.
        this._stroke = null;
        this.clearHistory();
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
      if (moved !== records) {
        this._stroke = null;
        this.clearHistory();
      }
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
        this.renderedCells = await this.renderer.render(this.image, this.processParams, this.layer, sourceParams(this.processParams));
        this.activePalette = this.renderer.palette;
        this.applyCellEdits();
      });
    },

    // After the paint layer changed under `pixels`: recomposite and rebuild just those cells.
    refreshCells(pixels) {
      this.renderer.composite(this.layer, this.processParams);
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.cellEdits, this.renderedCells);
    },

    // The colour under grid pixel (x, y) before adjustments: paint if there is any, else the source.
    rawColorAt(x, y) {
      if (!this.image) return '#000000';
      this.ensureLayer();
      x = Math.floor(x);
      y = Math.floor(y);
      const painted = this.layer?.colorAt(x, y);
      return painted ? rgb2hex(painted) : this.baseColorAt(x, y);
    },

    // The base layer's colour at grid pixel (x, y), as stored (before adjustments): an erased cell's
    // blank colours (background on top, foreground below), else the image.
    baseColorAt(x, y) {
      if (this.baseRecords.erased.has(cellKey(x, Math.floor(y / 2)))) return y % 2 ? BLANK.fg : BLANK.bg;
      return this.sourceColorAt(x, y);
    },

    // The image under grid pixel (x, y) before adjustments, as the pipeline downsamples it.
    sourceColorAt(x, y) {
      const source = this.renderer.sourceAt(x, y, this.cols, this.rows);
      return source ? rgb2hex(source) : '#000000';
    },

    // What's under a cell, as stored colours (pre-adjustment), for the eyedropper, flip and bake.
    // Spec "Bake and the eyedropper on generated cells", trial rule (a): stored colours are the
    // pre-adjustment ones, so they keep following the adjustments. withPaint: paint (on top) wins
    // per half; otherwise authored attributes, then the source image.
    underlyingAt(col, row, { withPaint = true } = {}) {
      const entry = this.cellEditAt(col, row) ?? {};
      const half = (y, attr) => {
        const painted = withPaint && this.layer?.colorAt(col, y);
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
      this.layer.paint(pixels, opacity);
      this.hasPaint = this.layer.hasPaint;

      this.refreshCells(pixels);
    },

    // Paint grid pixels ({ x, y, alpha }) in the current colour and brush opacity.
    paintStroke(pixels) {
      const workspace = useWorkspaceStore();
      const { r, g, b } = hex2rgb(workspace.editFgColor);
      const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < this.cols && y < this.rows);
      this.paintEditPixels(inGrid.map(p => ({ ...p, r, g, b })), workspace.editBrushOpacity);
    },

    eraseEditPixels(pixels) {
      if (!pixels.length || !this.renderer.outputCanvas) return;
      this.ensureLayer();
      this.beginEdit();
      this.layer.erase(pixels);

      this.refreshCells(pixels);
    },

    cellEditAt(col, row) {
      return this.cellEdits.get(cellKey(col, row));
    },

    // Set (string), clear (null) or keep (undefined) a cell's authored char/fg/bg. clearPaint removes
    // the paint in that cell, so the edit shows (the last edit to a cell wins).
    editCell(col, row, attrs, { clearPaint = false } = {}) {
      this.ensureLayer();
      this.beginEdit();
      const pixels = [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }];
      if (clearPaint && this.cellHasPaint(col, row)) {
        this.layer.erase(pixels);
        this.renderer.composite(this.layer, this.processParams);
      }
      this.cellEdits = withCellEdit(this.cellEdits, col, row, attrs);
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.cellEdits, this.renderedCells);
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

    // Move a row's authored cells (insert/delete); paint stays where it is.
    shiftCells(row, fromCol, delta) {
      const next = shiftRow(this.cellEdits, row, fromCol, delta, this.cols);
      if (next === this.cellEdits) return;
      this.cellEdits = next;
      const pixels = Array.from({ length: this.cols }, (_, x) => ({ x, y: 2 * row }));
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.cellEdits, this.renderedCells);
    },

    // --- Selection: each operation is one undo step, and none at all when nothing changes.

    // The whole grid as a rect (Bake/Release with no selection).
    gridRect() {
      return { c0: 0, r0: 0, c1: this.cols - 1, r1: charRowsOf(this.rows) - 1 };
    },

    // Swap in a new cell layer and recompose just the cells in rects (the rest, including paint made
    // since the last full render, is left as it is).
    setCellEdits(next, rects) {
      if (next === this.cellEdits) return;
      this.ensureLayer();
      this.beginEdit();
      this.cellEdits = next;
      const pixels = rects.flatMap(rect => rectCells(rect)).map(({ col, row }) => ({ x: col, y: 2 * row }));
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.cellEdits, this.renderedCells);
      this.commitEdit();
    },

    // The image's cell alone (no entry, no paint), as stored colours: bg the top half, fg the bottom.
    // The base layer's cell (no edits, no paint), as stored colours: an erased cell is BLANK; otherwise
    // the converter's character (or the pinned one) on the image's colours (bg the top half, fg the bottom).
    baseCellAt(col, row) {
      const key = cellKey(col, row);
      if (this.baseRecords.erased.has(key)) return { ...BLANK };
      return {
        char: this.baseRecords.pins.get(key) ?? this.renderedCells[cellIndex(col, row, this.cols)]?.char ?? ' ',
        bg: this.sourceColorAt(col, 2 * row),
        fg: this.sourceColorAt(col, 2 * row + 1),
      };
    },

    // Erase the base layer in these cells (they show blank, and lose any pin). Part of the current
    // edit; the caller commits it.
    eraseBase(cells) {
      const next = withErased(this.baseRecords, cells);
      if (next === this.baseRecords) return;
      this.ensureLayer();
      this.beginEdit();
      this.setBaseRecords(next);
      this.refreshCells(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
    },

    // A whole entry for a cell as the cell layer shows it: its authored attributes, the rest frozen from
    // the image the way the render style shows it (bakedEntry). Paint isn't part of it; it stays put.
    completeAt(col, row, entry) {
      return { ...bakedEntry(this.renderStyle, this.baseCellAt(col, row)), ...entry };
    },

    // Freeze the image's cells as authored (missing attributes from what's underneath, before paint).
    bakeCells(rect) {
      const area = rect ?? this.gridRect();
      this.setCellEdits(updateRect(this.cellEdits, area, (col, row, entry) => this.completeAt(col, row, entry)), [area]);
    },

    releaseCellsIn(rect) {
      const area = rect ?? this.gridRect();
      this.setCellEdits(withoutCells(this.cellEdits, rectCells(area)), [area]);
    },

    // Selection operations on the Select tool's layers: Layers = { image, edits }, where Edits is
    // everything drawn (authored cells and paint, stored apart but one thing to the user). Block =
    // { w, h, cells?: (Entry | null)[], paint?: canvas }. Each change is one undo step; rects are
    // clipped to the grid.
    partsOf({ image, edits }) {
      return { image, cells: edits, paint: edits };
    },

    clipRect({ c0, r0, c1, r1 }) {
      const rect = { c0: Math.max(0, c0), r0: Math.max(0, r0), c1: Math.min(this.cols - 1, c1), r1: Math.min(charRowsOf(this.rows) - 1, r1) };
      return rect.c0 <= rect.c1 && rect.r0 <= rect.r1 ? rect : null;
    },

    copySelection(rect, layers) {
      const parts = this.partsOf(layers);
      const block = { w: rect.c1 - rect.c0 + 1, h: rect.r1 - rect.r0 + 1 };
      if (parts.image || parts.cells) {
        block.cells = copyCellLayers(this.cellEdits, rect, parts, (col, row) => bakedEntry(this.renderStyle, this.baseCellAt(col, row)));
      }
      if (parts.paint && this.layer) block.paint = this.layer.copyCells(rect);
      return block;
    },

    deleteSelection(rect, layers) {
      this.selectionEdit([rect], () => this.deleteIn(rect, this.partsOf(layers)));
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
        this.deleteIn(rect, this.partsOf(layers));
        this.pasteAt(block, col, row);
      });
      return landed;
    },

    // The parts of the selection operations, inside selectionEdit (parts: partsOf's { image, cells, paint }).
    deleteIn(rect, parts) {
      this.cellEdits = deleteCellLayers(this.cellEdits, rect, parts);
      if (parts.paint) this.layer.eraseCells(rect);
    },

    pasteAt(block, col, row) {
      if (block.cells) this.cellEdits = pasteBlock(this.cellEdits, { w: block.w, h: block.h, entries: block.cells }, col, row, this.cols, charRowsOf(this.rows));
      if (block.paint) this.layer.pasteCells(block.paint, col, row, block.w, block.h);
    },

    // One undo step for a selection operation's cell and paint changes; the cells in rects recompose.
    selectionEdit(rects, change) {
      this.ensureLayer();
      this.beginEdit();
      change();
      this.hasPaint = this.layer?.hasPaint ?? false;
      this.renderer.composite(this.layer, this.processParams);
      const pixels = rects.flatMap(rect => rectCells(rect)).map(({ col, row }) => ({ x: col, y: 2 * row }));
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.cellEdits, this.renderedCells);
      this.commitEdit();
    },

    // Many cell edits at once ([{ col, row, attrs }], e.g. a shape): one Map copy, one paint erase.
    // Part of the current edit; the caller commits it.
    editCells(list, { clearPaint = false } = {}) {
      if (!list.length) return;
      this.ensureLayer();
      this.beginEdit();
      const next = new Map(this.cellEdits);
      const pixels = [];
      for (const { col, row, attrs } of list) {
        const key = cellKey(col, row);
        const entry = mergeEntry(next.get(key), attrs);
        if (entry) next.set(key, entry);
        else next.delete(key);
        pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
      }
      if (clearPaint && this.layer?.hasPaint) {
        this.layer.erase(pixels);
        this.renderer.composite(this.layer, this.processParams);
      }
      this.cellEdits = next;
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.cellEdits, this.renderedCells);
    },

    // Remove authored cells so the image shows through.
    releaseCells(cells) {
      const next = withoutCells(this.cellEdits, cells);
      if (next === this.cellEdits) return;
      this.ensureLayer();
      this.beginEdit();
      this.cellEdits = next;
      const pixels = cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.cellEdits, this.renderedCells);
    },

    cellHasPaint(col, row) {
      return !!(this.layer?.colorAt(col, 2 * row) || this.layer?.colorAt(col, 2 * row + 1));
    },

    flipCell(col, row) {
      if (!this.cells[cellIndex(col, row, this.cols)]) return;
      if (!this.cellEditAt(col, row) || this.cellHasPaint(col, row)) {
        this.flipPaint(col, row);
        return;
      }
      const { fg, bg } = this.underlyingAt(col, row);
      this.editCell(col, row, { fg: bg, bg: fg });
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

    applyCellEdits() {
      if (!this.renderedCells.length) return;
      this.cells = this.renderer.composeAll(this.renderedCells, this.cellEdits, this.processParams);
    },

    // Files from before the cell layer drew char edits over paint; now paint draws over authored
    // cells. A migrated char edit on paint takes that paint's colours and the paint is removed, so
    // the file looks as it did. Runs on load, before it's marked saved; not undoable.
    keepMigratedLook() {
      let next = this.cellEdits;
      const pixels = [];
      for (const [key, entry] of this.cellEdits) {
        const { col, row } = parseKey(key);
        if (!this.cellHasPaint(col, row)) continue;
        // Only painted halves take the paint's colour; an unpainted half keeps showing the image.
        const painted = (y) => {
          const color = this.layer.colorAt(col, y);
          return color ? rgb2hex(color) : undefined;
        };
        next = withCellEdit(next, col, row, { bg: painted(2 * row), fg: painted(2 * row + 1), char: entry.char });
        pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
      }
      if (!pixels.length) return;
      this.cellEdits = next;
      this.layer.erase(pixels);
      this.hasPaint = this.layer.hasPaint;
    },

    clearEditLayer() {
      this.ensureLayer();
      if (!this.layer) return;
      this.commitPending();
      const before = { layer: this.layer.snapshot(), cellEdits: this.cellEdits };
      const after = { layer: null, cellEdits: new Map() };
      const apply = ({ layer, cellEdits }) => {
        this.layer.restore(layer);
        this.hasPaint = this.layer.hasPaint;
        this.cellEdits = cellEdits;
        this.render();
      };
      apply(after);
      this.pushEdit({ undo: () => apply(before), redo: () => apply(after) });
    },

    // An edit (stroke, fill, cell edit) records from its first change until commitEdit().
    beginEdit() {
      if (this._stroke?.typing && !this._typingNow) this.commitEdit(); // another edit ends a typing run
      if (this._stroke || !this.layer) return;
      this._stroke = markRaw({ cellEdits: this.cellEdits, baseRecords: this.baseRecords }); // raw, so commitEdit's identity checks see the same objects
      this.layer.beginStroke();
    },

    // End of a user edit: one undo entry for its paint tiles and cell-layer changes, and it counts as unsaved.
    commitEdit() {
      const stroke = this._stroke;
      this._stroke = null;
      const patch = this.layer?.endStroke();
      if (!stroke || (!patch && stroke.cellEdits === this.cellEdits && stroke.baseRecords === this.baseRecords)) return;

      const sides = { before: [stroke.cellEdits, stroke.baseRecords], after: [this.cellEdits, this.baseRecords] };
      const apply = (side) => {
        if (patch) this.layer.applyPatch(patch, side);
        this.hasPaint = this.layer.hasPaint;
        [this.cellEdits] = sides[side];
        this.setBaseRecords(sides[side][1]);
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

    async flattenEdits() {
      if (!this.image) return;
      this.ensureLayer();
      this.commitPending();

      // Bake in grid space: the new base image IS the grid (letterbox included), sized like
      // the paint layer so paint overlays 1:1 and re-fitting the result is an identity.
      // Paint covers authored cells; once it's part of the image it must keep covering them, so those
      // cells are released along with the merge.
      const covered = [...this.cellEdits.keys()].map(parseKey).filter(({ col, row }) => this.cellHasPaint(col, row));
      const before = { image: this.image, imageBuffer: this.imageBuffer, layer: this.layer.snapshot(), cellEdits: this.cellEdits };
      const baked = this.layer.bake(this.image, this.getFitParams(this.cols, this.rows));
      const blob = await new Promise(resolve => baked.toBlob(resolve, 'image/png'));
      const after = { image: await loadImage(blob), imageBuffer: await blob.arrayBuffer(), layer: null, cellEdits: withoutCells(before.cellEdits, covered) };
      if (this.image !== before.image) return; // a different image was loaded while this merge was encoding
      const apply = ({ image, imageBuffer, layer, cellEdits }) => {
        this.$patch({ image: shallowRef(image), imageBuffer });
        this.layer.restore(layer);
        this.hasPaint = this.layer.hasPaint;
        this.cellEdits = cellEdits;
        this.render();
      };
      apply(after);
      this.pushEdit({ undo: () => apply(before), redo: () => apply(after) });
    },
  },
});

