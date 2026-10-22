import { shallowRef, markRaw } from 'vue';
import { defineStore } from 'pinia';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";
import { rgb2hex, hex2rgb } from "@/lib/ColorUtils.js";
import { getEffectiveColor } from "@/lib/PixelTransforms.js";
import { fitRect, ctx2d } from "@/lib/Canvas.js";
import { cellIndex, cellOfPixel, charRowsOf } from "@/lib/Cells.js";
import EditLayer, { editScaleFor } from "@/document/EditLayer.js";
import Renderer from "@/document/Renderer.js";
import History from "@/document/History.js";
import { migrateCharEdits, parseKey } from "@/document/cellEdits.js";
import { loadImage, readProject, writeProject, saveFile, downloadBlob, PROJECT_EXTENSION } from "@/document/projectIO.js";
import { useWorkspaceStore } from "@/store/WorkspaceStore.js";
import { SETTINGS, SETTING_KEYS, SAUCE_KEYS, RESET_GROUPS, getSetting, settingsState, groupDefaults } from "@/store/settings.js";

const MAX_DIMENSION = 300;
const DEFAULT_COLS = getSetting('cols').default;
const DEFAULT_ROWS = getSetting('rows').default;
const BLANK_CANVAS_SCALE = 10;

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
    charEditMap: shallowRef(new Map()),

    filename: null,
    cells: shallowRef([]),          // what the ANSI view shows and exports (renderedCells + paint + char edits)
    renderedCells: shallowRef([]),  // last full render, before char edits
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
    hasEdits: (state) => state.charEditMap.size > 0 || state.hasPaint,
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
    effectiveColor(state) {
      const workspaceStore = useWorkspaceStore();
      return getEffectiveColor(workspaceStore.editFgColor, state, state.activePalette);
    },
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
        charEditMap: new Map(),
        hasPaint: false,
      });
      this._stroke = null;
      this.clearHistory();
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
        charEditMap: new Map(),
        hasPaint: false,
      });
      this._stroke = null;
      this.clearHistory();
      this.markSaved();
    },

    async saveProject() {
      if (!this.image || !this.imageBuffer) return;

      const settings = Object.fromEntries([...SAVED_KEYS, 'hasPaint'].map(key => [key, this[key]]));
      const blob = await writeProject({
        settings,
        imageBuffer: this.imageBuffer,
        paintBlob: this.layer ? await this.layer.toBlob() : null,
        // Interim until the store holds the cell layer: char edits as char-only entries.
        cellEdits: migrateCharEdits([...this.charEditMap], this.cols),
      });
      downloadBlob(blob, `${this.filename}${PROJECT_EXTENSION}`);
      this.markSaved();
    },

    async loadProject(file) {
      if (!file || !file.name.endsWith(PROJECT_EXTENSION)) return;

      try {
        const { settings, imageBuffer, paintBuffer, cellEdits } = await readProject(file);
        const charEdits = new Map([...cellEdits].flatMap(([key, entry]) => {
          const { col, row } = parseKey(key);
          return entry.char ? [[cellIndex(col, row, settings.cols ?? this.cols), entry.char]] : [];
        }));
        const image = await loadImage(imageBuffer);
        const paint = paintBuffer && await loadImage(paintBuffer, 'image/png');

        this.replaceImage(image, imageBuffer, { ...settings, filename: file.name.replace(PROJECT_EXTENSION, '') });
        this.charEditMap = charEdits;
        if (paint) {
          this.ensureLayer();
          this.layer.load(paint, { width: image.naturalWidth, height: image.naturalHeight }, this.getFitParams(this.cols, this.rows));
          this.hasPaint = this.layer.hasPaint;
        }
        this.render();
        this.markSaved();
      } catch (e) {
        console.error('Failed to load project file', e);
        alert('Failed to load project file: ' + e.message);
      }
    },

    async exportFile(ext, opts = {}) {
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
        this.renderedCells = await this.renderer.render(this.image, this.processParams, this.layer);
        this.activePalette = this.renderer.palette;
        this.applyCharEdits();
      });
    },

    // After the paint layer changed under `pixels`: recomposite and rebuild just those cells.
    refreshCells(pixels) {
      this.renderer.composite(this.layer, this.processParams);
      this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, this.charEditMap, this.renderedCells);
    },

    getRawColorAt(x, y) {
      if (!this.image) return '#000000';

      this.ensureLayer();
      const painted = this.layer?.colorAt(x, y);
      if (painted) return rgb2hex(painted);

      const { dx, dy, dw, dh } = this.getFitParams(this.cols, this.rows);
      const ix_grid = x - dx;
      const iy_grid = y - dy;
      if (ix_grid < 0 || iy_grid < 0 || ix_grid >= dw || iy_grid >= dh) return '#000000';

      // Readable copy of the base image, rebuilt whenever the image changes (load, merge)
      if (this._rawImage !== this.image) {
        this._rawImage = this.image;
        this._rawCanvas = document.createElement('canvas');
        this._rawCanvas.width = this.image.naturalWidth || this.image.width;
        this._rawCanvas.height = this.image.naturalHeight || this.image.height;
        ctx2d(this._rawCanvas).drawImage(this.image, 0, 0);
      }

      const rw = this._rawCanvas.width, rh = this._rawCanvas.height;
      const rx = Math.floor((ix_grid / dw) * rw);
      const ry = Math.floor((iy_grid / dh) * rh);
      const rPixel = ctx2d(this._rawCanvas).getImageData(rx, ry, 1, 1).data;
      return rgb2hex({ r: rPixel[0], g: rPixel[1], b: rPixel[2] });
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

    setCharEdit(col, row, char) {
      this.ensureLayer();
      this.beginEdit();
      const i = cellIndex(col, row, this.cols);
      const newMap = new Map(this.charEditMap);
      if (char === null) newMap.delete(i);
      else newMap.set(i, char);
      this.charEditMap = newMap;
      this.cells = this.renderer.updateCells(this.cells, [{ x: col, y: 2 * row }], this.processParams, newMap, this.renderedCells);
    },

    flipAnsiColors(col, row) {
      const outputCanvas = this.renderer.outputCanvas;
      if (!outputCanvas || !this.cells[cellIndex(col, row, this.cols)]) return;

      // We need the REAL colors from the canvas because cells might be
      // normalized (e.g. background forced to black in ASCII mode).
      // Safari requires explicit sRGB to avoid color space mismatch (P3).
      const ctx = ctx2d(outputCanvas);
      const p1Data = ctx.getImageData(col, 2 * row, 1, 1).data;
      const p2Data = ctx.getImageData(col, 2 * row + 1, 1, 1).data;

      this.paintEditPixels([
        { x: col, y: 2 * row, r: p2Data[0], g: p2Data[1], b: p2Data[2], alpha: 1 },
        { x: col, y: 2 * row + 1, r: p1Data[0], g: p1Data[1], b: p1Data[2], alpha: 1 },
      ]);
    },

    applyCharEdits() {
      if (!this.renderedCells.length) return;
      this.cells = this.renderedCells.map((cell, i) => (this.charEditMap.has(i) ? { ...cell, char: this.charEditMap.get(i) } : cell));
    },

    clearCharEditsAt(pixels) {
      this.ensureLayer();
      if (!this.charEditMap.size) return;
      const newMap = new Map(this.charEditMap);
      let changed = false;
      for (const { x, y } of pixels) {
        const { col, row } = cellOfPixel(Math.floor(x), y);
        if (newMap.delete(cellIndex(col, row, this.cols))) changed = true;
      }
      if (changed) {
        this.beginEdit();
        this.charEditMap = newMap;
        this.cells = this.renderer.updateCells(this.cells, pixels, this.processParams, newMap, this.renderedCells);
      }
    },

    clearEditLayer() {
      this.ensureLayer();
      if (!this.layer) return;
      this.commitPending();
      const before = { layer: this.layer.snapshot(), charEdits: this.charEditMap };
      const after = { layer: null, charEdits: new Map() };
      const apply = ({ layer, charEdits }) => {
        this.layer.restore(layer);
        this.hasPaint = this.layer.hasPaint;
        this.charEditMap = charEdits;
        this.render();
      };
      apply(after);
      this.pushEdit({ undo: () => apply(before), redo: () => apply(after) });
    },

    // An edit (stroke, fill, char pick) records from its first change until commitEdit().
    beginEdit() {
      if (this._stroke || !this.layer) return;
      this._stroke = { charEdits: this.charEditMap };
      this.layer.beginStroke();
    },

    // End of a user edit: one undo entry for its paint tiles and char-edit changes, and it counts as unsaved.
    commitEdit() {
      const stroke = this._stroke;
      this._stroke = null;
      const patch = this.layer?.endStroke();
      if (!stroke || (!patch && stroke.charEdits === this.charEditMap)) return;

      const sides = { before: stroke.charEdits, after: this.charEditMap };
      const apply = (side) => {
        if (patch) this.layer.applyPatch(patch, side);
        this.hasPaint = this.layer.hasPaint;
        this.charEditMap = sides[side];
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
      const before = { image: this.image, imageBuffer: this.imageBuffer, layer: this.layer.snapshot() };
      const baked = this.layer.bake(this.image, this.getFitParams(this.cols, this.rows));
      const blob = await new Promise(resolve => baked.toBlob(resolve, 'image/png'));
      const after = { image: await loadImage(blob), imageBuffer: await blob.arrayBuffer(), layer: null };
      if (this.image !== before.image) return; // a different image was loaded while this merge was encoding
      const apply = ({ image, imageBuffer, layer }) => {
        this.$patch({ image: shallowRef(image), imageBuffer });
        this.layer.restore(layer);
        this.hasPaint = this.layer.hasPaint;
        this.render();
      };
      apply(after);
      this.pushEdit({ undo: () => apply(before), redo: () => apply(after) });
    },
  },
});

