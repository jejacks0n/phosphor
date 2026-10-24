import { shallowRef, markRaw } from 'vue';
import { defineStore } from 'pinia';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";
import { rgb2hex } from "@/lib/ColorUtils.js";
import { ctx2d } from "@/lib/Canvas.js";
import { charRowsOf } from "@/lib/Cells.js";
import { EMPTY_BASE } from "@/document/baseRecords.js";
import Renderer from "@/document/Renderer.js";
import History from "@/document/History.js";
import { parseKey, withCellEdit } from "@/document/editCells.js";
import { loadImage, readProject, writeProject, downloadBlob, PROJECT_EXTENSION } from "@/document/projectIO.js";
import { useWorkspaceStore } from "@/store/WorkspaceStore.js";
import { settingsState, slidersAtDefaults } from "@/store/settings.js";
import { combineActions } from "@/store/project/combineActions.js";
import { mergingActions } from "@/store/project/merging.js";
import { selectionActions } from "@/store/project/selection.js";
import { editLayerActions } from "@/store/project/editLayer.js";
import { renderingActions } from "@/store/project/rendering.js";
import { readingActions } from "@/store/project/reading.js";
import { baseLayerActions } from "@/store/project/baseLayer.js";
import { sliderActions } from "@/store/project/sliders.js";
import { historyActions } from "@/store/project/history.js";
import { MAX_DIMENSION, DEFAULT_COLS, DEFAULT_ROWS, BLANK_CANVAS_SCALE, PIPELINE_KEYS, SAVED_KEYS, settingsJson } from "@/store/project/shared.js";

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

  actions: combineActions(historyActions, sliderActions, baseLayerActions, readingActions, renderingActions, editLayerActions, selectionActions, mergingActions, {
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

    // Save and export take the name typed in the save dialog (fileStem: without the extension); it
    // renames the document, so the next save starts from it.
    rename(filename) {
      if (filename?.trim()) this.filename = filename.trim();
    },

    async saveProject(filename = this.filename) {
      if (!this.image || !this.imageBuffer) return;
      this.rename(filename);
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

    // .ans is CP437: the save dialog lists the characters it can't keep (AnsiFile.unmappable) first.
    async exportFile(ext, { filename = this.filename, ...opts } = {}) {
      this.rename(filename);

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
      downloadBlob(blob, `${this.filename}.${ext}`);
    },

    // --- Selection: each operation is one undo step, and none at all when nothing changes.

    // Base edits write the base layer's own pixels: exact, over the image as the pipeline shows it,
    // never resampled or put through the effects. Each is part of the current edit; the caller
    // commits it.

    // Selection operations on the Select tool's layers: Layers = { base, edit }, where Edit is
    // everything drawn (edit cells and paint, stored apart but one thing to the user), and Base is
    // the base's colors and pins (the converter's own characters belong to their cells and stay).
    // Each layer moves, copies and pastes as itself. Block = { w, h, cells?: (Entry | null)[],
    // paint?: canvas, base?: { pixels: canvas (a grid pixel each), pins: (char | null)[] } }. Each
    // change is one undo step; rects are clipped to the grid.

    // Files from before the cell layer drew char edits over paint; now paint draws over edit
    // cells. A migrated char edit on paint takes that paint's colors and the paint is removed, so
    // the file looks as it did. Runs on load, before it's marked saved; not undoable.
    keepMigratedLook() {
      let next = this.editCells;
      const pixels = [];
      for (const [key, entry] of this.editCells) {
        const { col, row } = parseKey(key);
        if (!this.cellHasPaint(col, row)) continue;
        // Only painted halves take the paint's color; an unpainted half keeps showing the image.
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

  }),
});
