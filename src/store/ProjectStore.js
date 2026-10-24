import { shallowRef, markRaw, toRaw } from 'vue';
import { defineStore } from 'pinia';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";
import { rgb2hex, hex2rgb } from "@/lib/ColorUtils.js";
import { fitRect, ctx2d } from "@/lib/Canvas.js";
import { cellIndex, charRowsOf, bakedEntry, halfColors, layoutWide } from "@/lib/Cells.js";
import PaintLayer, { editScaleFor, resizeTransform } from "@/document/PaintLayer.js";
import { EMPTY_BASE, withPins, withoutPins, remapBaseRecords } from "@/document/baseRecords.js";
import Renderer from "@/document/Renderer.js";
import History from "@/document/History.js";
import { cellKey, parseKey, withCellEdit, mergeEntry, withoutCells, shiftRow, rectCells, pasteBlock, updateRect, BLANK, bakeEditCells, bakeEntry, mergeKind } from "@/document/editCells.js";
import { processedImage, workingScale } from "@/lib/ImageProcessor.js";
import { bakedCanvas, getEffectiveColor } from "@/lib/PixelTransforms.js";
import { loadImage, readProject, writeProject, saveFile, downloadBlob, PROJECT_EXTENSION } from "@/document/projectIO.js";
import { useWorkspaceStore } from "@/store/WorkspaceStore.js";
import { cellWidth } from "@/lib/CharWidth.js";
import { overwritesAll } from "@/document/wideChars.js";
import { SETTINGS, SETTING_KEYS, SAUCE_KEYS, RESET_GROUPS, getSetting, settingsState, groupDefaults, baseParams, slidersAtDefaults } from "@/store/settings.js";

const MAX_DIMENSION = 300;
const DEFAULT_COLS = getSetting('cols').default;
const DEFAULT_ROWS = getSetting('rows').default;
const BLANK_CANVAS_SCALE = 10;
const TYPING_PAUSE_MS = 1000; // a pause this long ends a typing run (one undo step)

// Settings that feed the image pipeline (processParams); the rest only affect editing, saving or export.
const PIPELINE_KEYS = SETTINGS.filter(s => s.group !== 'sauce' && s.pipeline !== false).map(s => s.key);
const SAVED_KEYS = [...SETTING_KEYS, ...SAUCE_KEYS];
const settingsJson = (state) => JSON.stringify(SAVED_KEYS.map(key => state[key]));
// A colour ({ r, g, b, a }, a in 0..1) laid over another ({ r, g, b }).
// An image's pixels on a canvas of its own.
const copyOf = (image, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  ctx2d(canvas).drawImage(image, 0, 0);
  return canvas;
};
const over = (under, { r, g, b, a }) => ({ r: Math.round(under.r + (r - under.r) * a), g: Math.round(under.g + (g - under.g) * a), b: Math.round(under.b + (b - under.b) * a) });

export const useProjectStore = defineStore('project', {
  state: () => ({
    image: shallowRef(null),
    imageBuffer: null, // the image's encoded bytes, saved into .phosphor files
    imageIsWorkingCopy: false, // the image is a working-size copy (after a Bake or an Into-the-picture merge), not the one loaded
    ...settingsState(),

    hasPaint: false,
    renderer: markRaw(new Renderer()),
    paintLayer: null, // PaintLayer (markRaw); hasPaint mirrors paintLayer.hasPaint for reactivity
    baseLayer: null,  // the base layer's own pixels: a PaintLayer at grid resolution (markRaw), over the image
    fit: null,        // where the image sits in the grid ({ dx, dy, dw, dh }); fixed while the edit layer has content
    paintScale: null, // the paint layer's scale from a loaded file (its saved paint is at that scale)
    editCells: shallowRef(new Map()), // the edit cells (see document/editCells.js)
    baseRecords: shallowRef(EMPTY_BASE), // the base layer's pinned characters (see document/baseRecords.js)

    filename: null,
    cells: shallowRef([]),          // what the ANSI view shows and exports (renderedCells + edit cells + paint)
    composedCells: shallowRef([]),  // the same before the wide-character layout (what partial updates rebuild from)
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
    // Something to bake: an image, and a Transform, Adjustment or Effect slider off its default.
    canBake: (state) => !!state.image && !slidersAtDefaults(state),
    // The image is still the one loaded, at its own size (the merge dialog says what Into the picture costs).
    pictureIsOriginal: (state) => !state.imageIsWorkingCopy,
    canRedo: (state) => state.historyVersion >= 0 && state.history.canRedo,
    hasEdits: (state) => state.editCells.size > 0 || state.hasPaint, // anything on the edit layer (a grid resize is then a canvas resize)
    isDirty: (state) => settingsJson(state) !== state.savedSettings || state.editVersion !== state.savedEditVersion,
    imageRatio: (state) => {
      if (!state.image) return 1;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      return w / h;
    },
    maxCols: (state) => {
      if (!state.aspectLock || !state.image || state.editCells.size > 0 || state.hasPaint) return MAX_DIMENSION;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      const ratio = w / h;
      return Math.ceil(Math.min(MAX_DIMENSION, MAX_DIMENSION * ratio));
    },
    maxRows: (state) => {
      if (!state.aspectLock || !state.image || state.editCells.size > 0 || state.hasPaint) return MAX_DIMENSION;
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
      fit: state.fit,
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
        fit: null,
        paintScale: null,
        imageIsWorkingCopy: false,
        ...patch,
        image: shallowRef(image),
        imageBuffer,
        paintLayer: null,
        baseLayer: null,
        editCells: new Map(),
        hasPaint: false,
      });
      this.newDocument();
    },

    // The base layer's records, kept in step with the renderer's copy.
    setBaseRecords(records) {
      this.baseRecords = records;
      this.renderer.baseRecords = records;
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
        fit: null,
        filename: null,
        cells: [],
        composedCells: [],
        renderedCells: [],
        paintLayer: null,
        baseLayer: null,
        editCells: new Map(),
        hasPaint: false,
      });
      this.newDocument();
      this.markSaved();
    },

    // A fresh document: no base records or pixels, no history, and the selection (and the Picker's
    // last pick) dropped.
    newDocument() {
      this.setBaseRecords(EMPTY_BASE);
      this.renderer.baseLayer = null;
      this._stroke = null;
      this.clearHistory();
      const workspace = useWorkspaceStore();
      workspace.selection = workspace.selectionOffset = workspace.lastPick = null;
    },

    async saveProject() {
      if (!this.image || !this.imageBuffer) return;
      this.commitPending(); // an open typing run counts as saved, not as an edit made after saving

      const settings = { ...Object.fromEntries([...SAVED_KEYS, 'hasPaint', 'fit', 'imageIsWorkingCopy'].map(key => [key, this[key]])), paintScale: this.paintLayer?.scale ?? null };
      const blob = await writeProject({
        settings,
        imageBuffer: this.imageBuffer,
        paintBlob: this.paintLayer ? await this.paintLayer.toBlob() : null,
        baseBlob: this.baseLayer?.hasPaint ? await this.baseLayer.toBlob() : null,
        editCells: this.editCells,
        baseRecords: this.baseRecords,
      });
      downloadBlob(blob, `${this.filename}${PROJECT_EXTENSION}`);
      this.markSaved();
    },

    async loadProject(file) {
      if (!file || !file.name.endsWith(PROJECT_EXTENSION)) return;

      try {
        const { settings, imageBuffer, paintBuffer, baseBuffer, editCells, baseRecords, erasedCells, migrated } = await readProject(file);
        const image = await loadImage(imageBuffer);
        const paint = paintBuffer && await loadImage(paintBuffer, 'image/png');
        const basePixels = baseBuffer && await loadImage(baseBuffer, 'image/png');

        this.replaceImage(image, imageBuffer, { ...settings, filename: file.name.replace(PROJECT_EXTENSION, '') });
        this.editCells = editCells;
        this.setBaseRecords(baseRecords);
        if (paint) {
          this.ensureLayer();
          // Saved with its scale: the whole layer, reaching past the grid if it was shrunk. Older
          // files: paint at the image's size or the grid's.
          if (settings.paintScale) this.paintLayer.extend(Math.round(paint.width / this.paintLayer.scale), Math.round(paint.height / this.paintLayer.scale));
          this.paintLayer.load(paint, settings.paintScale ? null : { width: image.naturalWidth, height: image.naturalHeight }, this.fit);
          this.hasPaint = this.paintLayer.hasPaint;
          if (migrated) this.keepMigratedLook();
        }
        if (basePixels) {
          this.ensureLayer();
          this.baseLayer.extend(basePixels.width, basePixels.height);
          this.baseLayer.load(basePixels);
        }
        // Both layers reach as far as either was saved (they're extended together from here on).
        if (this.paintLayer) {
          const cols = Math.max(this.paintLayer.cols, this.baseLayer.cols), rows = Math.max(this.paintLayer.rows, this.baseLayer.rows);
          this.paintLayer.extend(cols, rows);
          this.baseLayer.extend(cols, rows);
        }
        // Files from before the base had its own pixels kept erased cells as a record: erase them
        // now (as part of loading, not an edit).
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

    // Bake: the picture as it shows becomes the image and the Transform, Adjustment and Effect
    // sliders go back to neutral, with nothing on the canvas changing. The image is what the
    // preview is made from (the processed image at its processing size; the palette isn't baked,
    // it keeps applying). The colour transforms also tint the drawing when it's shown, so they're
    // burnt into it (paint, the base's own pixels, edit cells) and into the colour pair and the
    // clipboard; recent colours are shared across projects and stay. One undo step; undoing after a
    // second round of slider changes keeps that round for redo.
    async bake() {
      if (!this.canBake || this._baking) return;
      this._baking = true;
      try {
        this.ensureLayer();
        this.commitPending();
        const workspace = useWorkspaceStore();
        const params = this.processParams;

        const canvas = await processedImage(this.image, params);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const image = await loadImage(blob);
        const imageBuffer = await blob.arrayBuffer();
        // Meanwhile: another image means another document, left alone; a stroke begun is part of
        // what's baked (closed now, so its undo isn't recorded against the baked layers).
        if (this.image !== params.image) return;
        this.commitPending();

        const defaults = Object.assign({}, ...RESET_GROUPS.map(groupDefaults));
        const sliders = (from = this) => Object.fromEntries(Object.keys(defaults).map(key => [key, from[key]]));
        const baked = (snapshot) => snapshot && { ...snapshot, canvas: bakedCanvas(snapshot.canvas, params) };
        const clip = toRaw(workspace.clipboard);
        const before = {
          image: this.image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy, sliders: sliders(params), // what it was baked with
          paint: this.paintLayer.snapshot(), base: this.baseLayer.snapshot(), editCells: this.editCells,
          fg: workspace.editFgColor, bg: workspace.editBgColor, clipboard: clip,
        };
        const after = {
          image, imageBuffer, workingCopy: true, sliders: defaults,
          paint: baked(before.paint), base: baked(before.base), editCells: bakeEditCells(this.editCells, params),
          fg: getEffectiveColor(before.fg, params), bg: getEffectiveColor(before.bg, params),
          clipboard: clip && {
            ...clip,
            ...(clip.cells && { cells: clip.cells.map(entry => entry && bakeEntry(entry, params)) }),
            ...(clip.paint && { paint: bakedCanvas(clip.paint, params) }),
            ...(clip.base && { base: { ...clip.base, pixels: bakedCanvas(clip.base.pixels, params) } }),
          },
        };

        // The colour pair and the clipboard swap only while they hold what the other side left: a
        // colour picked or a block copied since is kept.
        const apply = (state, from) => {
          this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy, ...state.sliders });
          this.paintLayer.restore(state.paint);
          this.baseLayer.restore(state.base);
          this.hasPaint = this.paintLayer.hasPaint;
          this.editCells = state.editCells;
          if (workspace.editFgColor === from.fg) workspace.editFgColor = state.fg;
          if (workspace.editBgColor === from.bg) workspace.editBgColor = state.bg;
          if (toRaw(workspace.clipboard) === from.clipboard) workspace.clipboard = state.clipboard;
          this.render();
        };
        apply(after, before);
        this.pushEdit({
          undo: () => {
            after.sliders = sliders(); // a second round of slider changes comes back on redo
            apply(before, after);
          },
          redo: () => apply(after, before),
        });
      } finally {
        this._baking = false;
      }
    },

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
    render() {
      if (this._renderQueued) return;
      this._renderQueued = true;
      requestAnimationFrame(async () => {
        this._renderQueued = false;
        if (!this.image) return;
        this.ensureLayer();
        this.renderedCells = await this.renderer.render(this.image, this.processParams, this.paintLayer, baseParams(this.processParams));
        this.activePalette = this.renderer.palette;
        this.applyEditCells();
      });
    },

    // New composed cells: laid out with their wide characters as what the views show and export.
    setCells(composed) {
      this.composedCells = composed;
      this.cells = layoutWide(composed, this.cols);
    },

    // After the paint or base pixels changed under `pixels`: recomposite and rebuild just those cells.
    refreshCells(pixels) {
      this.renderer.composite(this.paintLayer, this.processParams);
      this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
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

    // The base layer's colour at grid pixel (x, y), as stored (before adjustments): its own pixel
    // over the image as the pipeline shows it.
    baseColorAt(x, y) {
      const own = this.baseLayer?.pixelAt(x, y);
      if (!own || own.a >= 1) return own ? rgb2hex(own) : this.imageColorAt(x, y);
      return rgb2hex(over(hex2rgb(this.imageColorAt(x, y)), own));
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
      this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
    },

    // Typing: one undo entry per keystroke. Typed cells sit above paint (the last edit wins). A
    // two-column character takes the cell to its right too, so there's no room for one in the last
    // column: false, and nothing is typed.
    typeAt(col, row, char, attrs, { insert = false } = {}) {
      const width = cellWidth(char);
      if (width === 2 && col === this.cols - 1) return false;
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
      this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
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
      this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
      this.commitEdit();
    },

    // The base layer's cell (no edits, no paint), as stored colours: the converter's character (or
    // the pinned one) on the base's colours (bg the top half, fg the bottom).
    baseCellAt(col, row) {
      return {
        char: this.baseRecords.pins.get(cellKey(col, row)) ?? this.renderedCells[cellIndex(col, row, this.cols)]?.char ?? ' ',
        bg: this.baseColorAt(col, 2 * row),
        fg: this.baseColorAt(col, 2 * row + 1),
      };
    },

    // Base edits write the base layer's own pixels: exact, over the image as the pipeline shows it,
    // never resampled or put through the effects. Each is part of the current edit; the caller
    // commits it.

    // Erase the base in these cells: black, with a pinned space.
    eraseBase(cells) {
      if (!cells.length) return;
      this.writeBase(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row, hex: BLANK.bg }, { x: col, y: 2 * row + 1, hex: BLANK.bg }]));
      this.setBaseRecords(withPins(this.baseRecords, cells.map(({ col, row }) => ({ col, row, char: ' ' }))));
    },

    // Erase base pixels (the Pixel view): black, the characters left as they are.
    eraseBasePixels(pixels) {
      this.writeBase(pixels.map(({ x, y }) => ({ x, y, hex: BLANK.bg })));
    },

    // Flip the base in these cells: swap each cell's two halves (background and foreground).
    flipBase(cells) {
      this.writeBase(cells.flatMap(({ col, row }) => [
        { x: col, y: 2 * row, hex: this.baseColorAt(col, 2 * row + 1) },
        { x: col, y: 2 * row + 1, hex: this.baseColorAt(col, 2 * row) },
      ]));
    },

    // Set base pixels ({ x, y, hex } in grid pixels; off-grid ones are skipped) and show them.
    writeBase(pixels) {
      const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < this.cols && y < this.rows);
      if (!inGrid.length) return;
      this.ensureLayer();
      this.beginEdit();
      this.baseLayer.erase(inGrid); // so a pixel left part-covered by a merge is replaced, not blended
      this.baseLayer.paint(inGrid.map(({ x, y, hex }) => ({ x, y, ...hex2rgb(hex), alpha: 1 })));
      this.refreshCells(inGrid);
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
    // the base's colours and pins (the converter's own characters belong to their cells and stay).
    // Each layer moves, copies and pastes as itself. Block = { w, h, cells?: (Entry | null)[],
    // paint?: canvas, base?: { pixels: canvas (a grid pixel each), pins: (char | null)[] } }. Each
    // change is one undo step; rects are clipped to the grid.

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
      if (base) block.base = { pixels: this.basePixelsOf(rect), pins: cells.map(({ col, row }) => this.baseRecords.pins.get(cellKey(col, row)) ?? null) };
      return block;
    },

    // The base's stored colours over a cell rect, on a canvas a grid pixel per pixel.
    basePixelsOf({ c0, r0, c1, r1 }) {
      const w = c1 - c0 + 1, h = 2 * (r1 - r0 + 1);
      const own = ctx2d(this.baseLayer.canvas).getImageData(c0, 2 * r0, w, h).data;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = ctx2d(out), pixels = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const { r, g, b } = over(hex2rgb(this.imageColorAt(c0 + x, 2 * r0 + y)), { r: own[o], g: own[o + 1], b: own[o + 2], a: own[o + 3] / 255 });
          pixels.data.set([r, g, b, 255], o);
        }
      }
      ctx.putImageData(pixels, 0, 0);
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
      if (block.paint) this.paintLayer.pasteCells(block.paint, col, row, block.w, block.h, this.gridRect());
      if (block.base) this.pasteBase(block, col, row);
    },

    // A block's base at (col, row): its pixels into the base layer, and its pins (a cell with none
    // takes the converter's character there).
    pasteBase({ w, h, base }, col, row) {
      const rect = this.clipRect({ c0: col, r0: row, c1: col + w - 1, r1: row + h - 1 });
      if (!rect) return;
      this.baseLayer.pasteCells(base.pixels, col, row, w, h, rect);
      const pins = base.pins.map((char, i) => ({ col: col + (i % w), row: row + Math.floor(i / w), char }))
        .filter(({ col: c, row: r }) => c >= rect.c0 && c <= rect.c1 && r >= rect.r0 && r <= rect.r1);
      this.setBaseRecords(withPins(withoutPins(this.baseRecords, pins.filter(p => !p.char)), pins.filter(p => p.char)));
    },

    // One undo step for a selection operation's changes (cells, paint, base pixels, pins); the cells in rects recompose.
    selectionEdit(rects, change) {
      this.ensureLayer();
      this.beginEdit();
      change();
      this.hasPaint = this.paintLayer?.hasPaint ?? false;
      this.renderer.composite(this.paintLayer, this.processParams);
      const pixels = rects.flatMap(rect => rectCells(rect)).map(({ col, row }) => ({ x: col, y: 2 * row }));
      this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
      this.commitEdit();
    },

    // Many cell edits at once ([{ col, row, attrs }], e.g. a shape): one Map copy, one paint erase.
    // A character written over half of a wide character turns its other half into a space, as a
    // terminal does (that space keeps its colours and paint). Part of the current edit; the caller
    // commits it.
    writeEditCells(list, { clearPaint = false } = {}) {
      if (!list.length) return;
      this.ensureLayer();
      this.beginEdit();
      const blanks = overwritesAll(this.cells, this.cols, list.map(({ col, row, attrs }) => ({ col, row, char: attrs.char })));
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
      for (const { col, row } of blanks) {
        next.set(cellKey(col, row), mergeEntry(next.get(cellKey(col, row)), { char: ' ' }));
        pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
      }
      this.editCells = next;
      this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
    },

    // Remove edit cells so the image shows through.
    clearEditCells(cells) {
      const next = withoutCells(this.editCells, cells);
      if (next === this.editCells) return;
      this.ensureLayer();
      this.beginEdit();
      this.editCells = next;
      const pixels = cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
      this.setCells(this.renderer.updateCells(this.composedCells, pixels, this.processParams, this.editCells, this.renderedCells));
    },

    cellHasPaint(col, row) {
      return !!(this.paintLayer?.colorAt(col, 2 * row) || this.paintLayer?.colorAt(col, 2 * row + 1));
    },

    // Flip a cell's colours on the chosen layers. Edit: the paint (as it shows) or the edit cell's
    // own colours; a cell with neither gets the flip as paint, unless the base is flipping it. Base:
    // the base's two halves. The edit side goes first, while the cell still shows unflipped.
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
      this.setCells(this.renderer.composeAll(this.renderedCells, this.editCells, this.processParams));
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
      this.paintLayer.recheckPaint();
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
      this._stroke = markRaw({ editCells: this.editCells, baseRecords: this.baseRecords }); // raw, so commitEdit's identity checks see the same objects
      this.paintLayer.beginStroke();
      this.baseLayer.beginStroke();
    },

    // End of a user edit: one undo entry for its paint and base pixel tiles and its cell-layer and
    // pin changes, and it counts as unsaved.
    commitEdit() {
      const stroke = this._stroke;
      this._stroke = null;
      const patch = this.paintLayer?.endStroke();
      const basePatch = this.baseLayer?.endStroke();
      this.hasPaint = this.paintLayer?.hasPaint ?? false; // an erase may have left none
      if (!stroke || (!patch && !basePatch && stroke.editCells === this.editCells && stroke.baseRecords === this.baseRecords)) return;

      const sides = { before: [stroke.editCells, stroke.baseRecords], after: [this.editCells, this.baseRecords] };
      const apply = (side) => {
        if (patch) this.paintLayer.applyPatch(patch, side);
        if (basePatch) this.baseLayer.applyPatch(basePatch, side);
        this.hasPaint = this.paintLayer.hasPaint;
        [this.editCells] = sides[side];
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

    // Merge down: the whole edit layer goes into the base layer's pixels exactly as it shows: each
    // edit cell as its background (top) and foreground (bottom) pixels with its character pinned (a
    // cell that showed a different character, ▄ for a solid one under paint, as its two half colours
    // with the shown character pinned), then the paint over them, a grid pixel at a time as it
    // shows. Paint over a pinned cell (an erased one's space) pins what it shows too. Nothing is
    // resampled or put through the effects.
    // What merging a cell into the base shows: its two halves (top, bottom) under the paint, and
    // the character to pin. Color ASCII shows only the foreground (on black) and rebuilds it as the
    // halves' average; a cell showing another character than its own (▄ for a solid one under
    // paint) goes in as its two half colours.
    mergeCellOf(col, row) {
      const cell = { ...this.baseCellAt(col, row), ...this.editCellAt(col, row) };
      // Before the wide layout: a wide character's trail pins its own character, not its lead's.
      const char = this.composedCells[cellIndex(col, row, this.cols)]?.char ?? cell.char;
      const [top, bottom] = this.renderStyle === 'colorAscii' ? [hex2rgb(cell.fg), hex2rgb(cell.fg)]
        : char === cell.char ? [hex2rgb(cell.bg), hex2rgb(cell.fg)]
          : halfColors({ char: cell.char, fg: hex2rgb(cell.fg), bg: hex2rgb(cell.bg) });
      return { col, row, top, bottom, char };
    },

    // Merge into the picture: the edit layer (inside rect, or all of it) becomes part of the image,
    // so every effect applies to it, live, like the photo. The image becomes the picture at its
    // working size (m processed pixels per grid pixel) with nothing applied, each picture cell
    // painted in as exact m x m blocks: the converter's own characters go in as they are and come
    // back from the picture; solid characters go in as they show, pinned to ▄; any other character,
    // and anything outside the picture's area (the letterbox), merges exactly (mergeKind). The
    // sliders aren't touched. One undo step.
    async mergeIntoPicture(rect = null) {
      if (!this.image || this._merging) return;
      this._merging = true;
      try {
        this.ensureLayer();
        this.commitPending();
        const params = this.processParams;
        const neutral = { ...params, ...Object.assign({}, ...RESET_GROUPS.map(groupDefaults)) };
        const m = workingScale(this.image, params) ?? Math.max(2, Math.floor(400 / Math.max(this.cols, this.rows)));
        const fitNow = params.fit ?? this.fitFor(this.cols, this.rows);
        const width = this.image.naturalWidth || this.image.width, height = this.image.naturalHeight || this.image.height;
        // Already at its working size (after a Bake or an earlier merge): its own pixels, exactly; a
        // render through the pipeline would round them a level here and there.
        const atSize = width === fitNow.dw * m && height === fitNow.dh * m;
        const canvas = atSize ? copyOf(this.image, width, height) : await processedImage(this.image, neutral, { m });
        // Meanwhile: another image means another document, left alone; a stroke begun is merged too.
        if (this.image !== params.image) return;
        this.commitPending();

        const fit = params.fit ?? this.fitFor(this.cols, this.rows);
        const rows = charRowsOf(this.rows);
        const inRect = (col, row) => !rect || (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1);
        const inPicture = (col, row) => col >= fit.dx && col < fit.dx + fit.dw && 2 * row >= fit.dy && 2 * row + 1 < fit.dy + fit.dh;

        // The paint at grid resolution, as stored (the Renderer draws it this way before adjusting it).
        const paint = document.createElement('canvas');
        paint.width = this.cols;
        paint.height = this.rows;
        const paintCtx = ctx2d(paint);
        paintCtx.imageSmoothingEnabled = false;
        const k = this.paintLayer.scale;
        paintCtx.drawImage(this.paintLayer.canvas, 0, 0, this.cols * k, this.rows * k, 0, 0, this.cols, this.rows);
        const paintData = paintCtx.getImageData(0, 0, this.cols, this.rows).data;
        const paintAt = (x, y) => {
          const o = (y * this.cols + x) * 4;
          return { r: paintData[o], g: paintData[o + 1], b: paintData[o + 2], a: paintData[o + 3] / 255 };
        };

        // The covered cells: edit cells and cells with paint, in the grid (and the rect).
        const covered = new Map();
        for (const key of this.editCells.keys()) {
          const { col, row } = parseKey(key);
          if (col < this.cols && row < rows && inRect(col, row)) covered.set(key, { col, row });
        }
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < this.cols; col++) {
            if (inRect(col, row) && (paintAt(col, 2 * row).a || paintAt(col, 2 * row + 1).a)) covered.set(cellKey(col, row), { col, row });
          }
        }

        const ctx = ctx2d(canvas);
        const exactPixels = [], pictureCells = [], pins = [], unpins = [];
        for (const [key, { col, row }] of covered) {
          const entry = this.editCellAt(col, row);
          const pin = this.baseRecords.pins.get(key);
          const kind = mergeKind({ char: entry?.char ?? pin, renderStyle: this.renderStyle, inPicture: inPicture(col, row) });
          let top, bottom;
          if (kind === 'exact') {
            ({ top, bottom } = this.mergeCellOf(col, row));
            if (entry || pin) pins.push({ col, row, char: entry ? this.mergeCellOf(col, row).char : this.composedCells[cellIndex(col, row, this.cols)]?.char ?? pin });
          } else {
            const cell = { ...this.baseCellAt(col, row), ...entry };
            [top, bottom] = kind === 'picture' ? [hex2rgb(cell.bg), hex2rgb(cell.fg)]
              : halfColors({ char: cell.char, fg: hex2rgb(cell.fg), bg: hex2rgb(cell.bg) });
            if (kind === 'picture-pinned') pins.push({ col, row, char: '▄' });
            else unpins.push({ col, row });
            pictureCells.push({ col, row });
          }
          const shown = [over(top, paintAt(col, 2 * row)), over(bottom, paintAt(col, 2 * row + 1))];
          if (kind === 'exact') {
            exactPixels.push({ x: col, y: 2 * row, ...shown[0], alpha: 1 }, { x: col, y: 2 * row + 1, ...shown[1], alpha: 1 });
          } else {
            shown.forEach(({ r, g, b }, half) => {
              ctx.fillStyle = rgb2hex({ r, g, b });
              ctx.fillRect((col - fit.dx) * m, (2 * row + half - fit.dy) * m, m, m);
            });
          }
        }
        const version = this.editVersion;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const image = await loadImage(blob);
        const imageBuffer = await blob.arrayBuffer();
        // What's merged was read before encoding: an edit since (or one still open) means it's stale.
        if (this.image !== params.image || this.editVersion !== version || this._stroke) return;

        const before = {
          image: this.image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy,
          base: this.baseLayer.snapshot(), paint: this.paintLayer.snapshot(), editCells: this.editCells, baseRecords: this.baseRecords,
        };

        // The base: exact cells written as they show; picture cells' own pixels cleared (they're the
        // picture now). The edit layer keeps what's outside the rect (and past the grid).
        this.baseLayer.erase([...exactPixels, ...pictureCells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }])]);
        this.baseLayer.paint(exactPixels);
        if (rect) this.paintLayer.clearCells(rect);
        const kept = new Map([...this.editCells].filter(([key]) => !covered.has(key)));
        const after = {
          image, imageBuffer, workingCopy: true,
          base: this.baseLayer.snapshot(), paint: rect ? this.paintLayer.snapshot() : null, editCells: kept,
          baseRecords: withPins(withoutPins(this.baseRecords, unpins), pins),
        };
        const apply = (state) => {
          this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy });
          this.baseLayer.restore(state.base);
          this.paintLayer.restore(state.paint);
          this.hasPaint = this.paintLayer.hasPaint;
          this.editCells = state.editCells;
          this.setBaseRecords(state.baseRecords);
          this.render();
        };
        apply(after);
        this.pushEdit({ undo: () => apply(before), redo: () => apply(after) });
      } finally {
        this._merging = false;
      }
    },

    // rect: only the edit layer inside a cell rect (a selection) is merged; the rest stays.
    mergeDown(rect = null) {
      if (!this.image) return;
      this.ensureLayer();
      this.commitPending();

      const rows = charRowsOf(this.rows);
      const inRect = (col, row) => !rect || (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1);
      const shownChar = (col, row) => this.composedCells[cellIndex(col, row, this.cols)]?.char;
      const merged = [];   // { col, row, top, bottom, char }: edit cells, under the paint
      const kept = new Map(); // edit cells past the grid (after a canvas resize shrank it) or outside the rect stay on the edit layer
      for (const [key, entry] of this.editCells) {
        const { col, row } = parseKey(key);
        if (col >= this.cols || row >= rows || !inRect(col, row)) {
          kept.set(key, entry);
          continue;
        }
        merged.push(this.mergeCellOf(col, row));
      }
      const paintedPins = [...this.baseRecords.pins.keys()].map(parseKey)
        .filter(({ col, row }) => inRect(col, row) && !this.editCells.has(cellKey(col, row)) && this.cellHasPaint(col, row))
        .map(({ col, row }) => ({ col, row, char: shownChar(col, row) ?? '▄' }));

      const before = { base: this.baseLayer.snapshot(), paint: this.paintLayer.snapshot(), editCells: this.editCells, baseRecords: this.baseRecords };
      const pixels = merged.flatMap(({ col, row, top, bottom }) => [{ x: col, y: 2 * row, ...top, alpha: 1 }, { x: col, y: 2 * row + 1, ...bottom, alpha: 1 }]);
      this.baseLayer.erase(pixels);
      this.baseLayer.paint(pixels);
      this.baseLayer.drawOver(this.paintLayer, rect);
      if (rect) this.paintLayer.clearCells(rect);
      const pins = [...merged.map(({ col, row, char }) => ({ col, row, char })), ...paintedPins];
      const after = { base: this.baseLayer.snapshot(), paint: rect ? this.paintLayer.snapshot() : null, editCells: kept, baseRecords: withPins(before.baseRecords, pins) };
      const apply = ({ base, paint, editCells, baseRecords }) => {
        this.baseLayer.restore(base);
        this.paintLayer.restore(paint);
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

