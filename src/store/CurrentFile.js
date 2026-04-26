import { shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";
import { rgb2hex } from "@/lib/ColorUtils.js";
import { applyTransforms } from "@/lib/PixelTransforms.js";

export const MAX_DIMENSION = 500;

export const useCurrentFileStore = defineStore('current_file', {
  state: () => ({
    image: shallowRef(null),
    cols: useLocalStorage('current_file.cols', 80),
    rows: useLocalStorage('current_file.rows', 50),
    aspectLock: useLocalStorage('current_file.aspectLock', true),
    chars: useLocalStorage('current_file.chars', '*:|%.░░▒▒▓▓▁▂▃▄▅■■■■■■■▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄'),
    seed: useLocalStorage('current_file.seed', generateSlug(2)),
    smoothing: useLocalStorage('current_file.smoothing', 'low'),

    invert: useLocalStorage('current_file.invert', 0),
    brightness: useLocalStorage('current_file.brightness', 100),
    contrast: useLocalStorage('current_file.contrast', 100),
    saturation: useLocalStorage('current_file.saturation', 100),

    sharpen: useLocalStorage('current_file.sharpen', 0),
    flatten: useLocalStorage('current_file.flatten', 0),
    edges: useLocalStorage('current_file.edges', 0),
    edgeColor: useLocalStorage('current_file.edgeColor', '#000000'),
    edgeThickness: useLocalStorage('current_file.edgeThickness', 1),
    hue: useLocalStorage('current_file.hue', 0),

    quantize: useLocalStorage('current_file.quantize', 'none'),
    palette: useLocalStorage('current_file.palette', '#FFFFFF #AA5601 #000000'),
    colorCount: useLocalStorage('current_file.colorCount', 16),

    alphaMode: new URLSearchParams(window.location.search).get('alpha') === 'true',
    activeTool: 'pencil',
    previousTool: null,
    editFgColor: '#ffffff',
    editZoom: 4,
    editBrushSize: 4,

    // Edit layer: an RGBA canvas (paint strokes with preserved alpha) + a char-override Map.
    // Colors in editCanvas are NOT pre-blended — alpha is retained so compositing against
    // any updated pipeline output always produces correct results (e.g. after invert).
    editCanvas: shallowRef(null),
    charEditMap: shallowRef(new Map()),
    hasPaint: false,
    clearEditsFlag: 0,

    previewTab: 'source',

    sauce: {
      // cols
      // rows
      // filesize
      use9pxFont: useLocalStorage('current_file.sauce.use9pxFont', false),
      fontName: useLocalStorage('current_file.sauce.fontName', 'IBM VGA'),

      title: useLocalStorage('current_file.sauce.title', ''),
      author: useLocalStorage('current_file.sauce.author', ''),
      group: useLocalStorage('current_file.sauce.group', ''),
      date: useLocalStorage('current_file.sauce.date', ''),
      userComments: useLocalStorage('current_file.sauce.userComments', ''),
    },

    filename: null,
    blockData: shallowRef([]),
    pipelineBlockData: shallowRef([]),
    isDirty: false,
    editMode: false,
    isInitializing: false,
    settingsOpen: false,

    // History for undo/redo
    historyStack: [],
    historyIndex: -1,
  }),
  getters: {
    canUndo: (state) => state.historyIndex > 0,
    canRedo: (state) => state.historyIndex < state.historyStack.length - 1,
    hasEdits() {
      return this.charEditMap.size > 0 || this.hasPaint || this.isDirty;
    },
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
  },
  actions: {
    randomizeSeed() {
      this.seed = generateSlug(2);
    },
    // async setImageFromInput(event) {
    //   await this.setImageFromFile(event.target.files[0]);
    // },
    async setImageFromFile(file) {
      if (!file) return;

      const filename = file.name.replace(/\.[^/.]+$/, '');
      const image = new Image();
      image.onload = () => {
        const w = image.naturalWidth || image.width || 1;
        const h = image.naturalHeight || image.height || 1;
        const ratio = w / h;

        let cols = this.cols;
        let rows = Math.ceil(cols / ratio);

        if (rows > MAX_DIMENSION) {
          rows = MAX_DIMENSION;
          cols = Math.floor(rows * ratio);
        } else if (cols > MAX_DIMENSION) {
          cols = MAX_DIMENSION;
          rows = Math.floor(cols / ratio);
        }

        this.$patch({
          image: shallowRef(image),
          editCanvas: null,
          charEditMap: new Map(),
          hasPaint: false,
          cols: Math.max(1, cols),
          rows: Math.max(1, rows),
          filename,
          isDirty: false,
          isInitializing: true,
          previewTab: 'ansi',
          sauce: { ...this.sauce, title: '' },
          historyStack: [],
          historyIndex: -1,
        });
        setTimeout(() => { this.isInitializing = false; }, 0);
      };
      image.src = URL.createObjectURL(file);
    },
    markDirty() {
      if (this.isInitializing) return;
      if (this.image && !this.isDirty) {
        this.isDirty = true;
      }
    },
    clearImage() {
      this.$patch({
        image: null,
        filename: null,
        blockData: [],
        editCanvas: null,
        charEditMap: new Map(),
        hasPaint: false,
        previewTab: 'source',
        isDirty: false
      });
    },
    async exportFile(ext, opts = {}) {
      const settings = [
        `Created with Phosphor`,
        `Params: seed=${this.seed}, smoothing=${this.smoothing}, quantize=${this.quantize}`,
        `Adjust: brightness=${this.brightness}%, contrast=${this.contrast}%, saturation=${this.saturation}%, invert=${this.invert}%`,
        `Effects: sharpen=${this.sharpen}, flatten=${this.flatten}, edges=${this.edges} (${this.edgeColor}), thickness=${this.edgeThickness}`,
      ];

      if (this.sauce.userComments) {
        settings.push(''); // Spacer
        const userLines = this.sauce.userComments.split('\n');
        settings.push(...userLines);
      }

      const file = new AnsiFile(this.cols, Math.floor(this.rows * 0.5), this.blockData);
      await file.exportAs(`${this.filename}.${ext}`, {
        sauce: {
          ...this.sauce,
          comments: settings
        },
        colorMode: this.quantize,
        utf8: ext === 'utf8ans',
        ...opts
      });
    },
    resetSliders() {
      this.resetTransform();
      this.resetAdjust();
      this.resetEffects();
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
      this.markDirty();
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
      this.markDirty();
    },
    resetTransform() {
      this.$patch({
        invert: 0,
        hue: 0,
      });
      this.markDirty();
    },
    resetAdjust() {
      this.$patch({
        brightness: 100,
        contrast: 100,
        saturation: 100,
      });
      this.markDirty();
    },
    resetEffects() {
      this.$patch({
        sharpen: 0,
        flatten: 0,
        edges: 0,
        edgeColor: '#000000',
        edgeThickness: 1,
      });
      this.markDirty();
    },
    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
    },
    setActiveTool(tool) {
      this.activeTool = tool;
    },
    setEditZoom(z) {
      this.editZoom = z;
    },
    setEditBrushSize(size) {
      this.editBrushSize = size;
    },

    // Creates the edit canvas at the given dimensions (first run only).
    initEditCanvas(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, w || 1);
      c.height = Math.max(1, h || 1);
      this.editCanvas = c;
      this.takeSnapshot();
    },

    // Composites pipelineCanvas + editCanvas into outputCanvas.
    // The editCanvas pixels are transformed with the same brightness/contrast/saturation/hue/invert
    // as the pipeline so painted strokes respond to adjustments identically to the base image.
    compositeEditCanvas(pipelineCanvas, outputCanvas) {
      if (!outputCanvas || !pipelineCanvas) return;
      const ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(pipelineCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

      if (!this.editCanvas) return;

      const w = outputCanvas.width, h = outputCanvas.height;

      // 1. Create a tiny temp canvas to downsample the high-res edit layer to current resolution
      const downsampled = document.createElement('canvas');
      downsampled.width = w;
      downsampled.height = h;
      const dsCtx = downsampled.getContext('2d', { willReadFrequently: true });
      dsCtx.drawImage(this.editCanvas, 0, 0, w, h);

      // 2. Run adjustments on the tiny canvas (performance optimized)
      const br = parseFloat(this.brightness) / 100;
      const ct = parseFloat(this.contrast) / 100;
      const sa = parseFloat(this.saturation) / 100;
      const hu = parseFloat(this.hue) / 360;
      const inv = parseFloat(this.invert) / 100;

      const needsTransform = br !== 1 || ct !== 1 || sa !== 1 || hu !== 0 || inv !== 0;

      if (needsTransform) {
        const id = dsCtx.getImageData(0, 0, w, h);
        applyTransforms(id.data, this.brightness, this.contrast, this.saturation, this.hue, this.invert);
        dsCtx.putImageData(id, 0, 0);
      }

      // 3. Composite adjusted edit layer over pipeline
      ctx.drawImage(downsampled, 0, 0);
    },

    // Re-applies all edits (paint and characters) to blockData.
    refreshBlockData(outputCanvas) {
      if (!this.pipelineBlockData.length || !outputCanvas) return;

      const w = this.cols, h = this.rows;
      
      // Optimization: if no paint and no char edits, just use pipelineBlockData
      if (!this.hasPaint && this.charEditMap.size === 0) {
        this.blockData = this.pipelineBlockData;
        return;
      }

      const newBlockData = this.pipelineBlockData.slice();

      // 1. Apply paint from editCanvas if it exists
      if (this.hasPaint && this.editCanvas) {
        const editTemp = document.createElement('canvas');
        editTemp.width = w;
        editTemp.height = h;
        editTemp.getContext('2d', { willReadFrequently: true }).drawImage(this.editCanvas, 0, 0, w, h);

        const editData = editTemp.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        const outData = outputCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;

        for (let i = 0; i < w * h; i++) {
          if (editData[i * 4 + 3] > 0) {
            const i4 = i * 4;
            const r = outData[i4], g = outData[i4 + 1], b = outData[i4 + 2];
            newBlockData[i] = { ...newBlockData[i], r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] };
          }
        }
      }

      // 2. Apply character overrides
      if (this.charEditMap.size > 0) {
        for (const [cellIndex, char] of this.charEditMap.entries()) {
          const col = cellIndex % this.cols;
          const ansiRow = Math.floor(cellIndex / this.cols);
          const bgIdx = ansiRow * this.cols * 2 + col;
          if (newBlockData[bgIdx]) {
            newBlockData[bgIdx] = { ...newBlockData[bgIdx], char };
          }
        }
      }

      this.blockData = newBlockData;
    },

    // Writes pixels to the editCanvas (raw paint color + brush alpha, not pre-blended),
    // composites pipelineCanvas + editCanvas into outputCanvas, then reads back the final
    // composited colors from outputCanvas to update blockData. This ensures adjustments
    // like invert correctly re-blend against the updated pipeline on future re-runs.
    paintEditPixels(pixels, pipelineCanvas, outputCanvas) {
      if (!this.editCanvas || !pixels.length) return;
      this.hasPaint = true;
      const editCtx = this.editCanvas.getContext('2d', { willReadFrequently: true });

      // Calculate scaling factor between ANSI grid and high-res edit canvas
      const wScale = this.editCanvas.width / this.cols;
      const hScale = this.editCanvas.height / this.rows;

      for (const { x, y, r, g, b, alpha } of pixels) {
        editCtx.globalAlpha = alpha;
        editCtx.fillStyle = `rgb(${r},${g},${b})`;
        // Map ANSI cell to a high-res rectangle on the edit canvas
        editCtx.fillRect(
          Math.floor(x * wScale),
          Math.floor(y * hScale),
          Math.ceil(wScale),
          Math.ceil(hScale)
        );
      }
      editCtx.globalAlpha = 1;

      this.compositeEditCanvas(pipelineCanvas, outputCanvas);
      
      const snapshot = outputCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.cols, this.rows);
      const newBlockData = this.blockData.slice();
      for (const { x, y } of pixels) {
        const i = y * this.cols + x;
        if (newBlockData[i]) {
          const i4 = i * 4;
          const r = snapshot.data[i4], g = snapshot.data[i4 + 1], b = snapshot.data[i4 + 2];
          newBlockData[i] = { ...newBlockData[i], r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] };
          
          // Also apply any character override for this cell
          const ansiRow = Math.floor(y / 2);
          const cellIndex = ansiRow * this.cols + x;
          if (this.charEditMap.has(cellIndex)) {
            newBlockData[i].char = this.charEditMap.get(cellIndex);
          }
        }
      }
      this.blockData = newBlockData;
    },

    // Clears pixels on the editCanvas and updates blockData.
    eraseEditPixels(pixels, pipelineCanvas, outputCanvas) {
      if (!this.editCanvas || !pixels.length) return;
      const editCtx = this.editCanvas.getContext('2d', { willReadFrequently: true });
      const wScale = this.editCanvas.width / this.cols;
      const hScale = this.editCanvas.height / this.rows;

      for (const { x, y } of pixels) {
        editCtx.clearRect(
          Math.floor(x * wScale),
          Math.floor(y * hScale),
          Math.ceil(wScale),
          Math.ceil(hScale)
        );
      }

      this.compositeEditCanvas(pipelineCanvas, outputCanvas);

      const snapshot = outputCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.cols, this.rows);
      const newBlockData = this.blockData.slice();
      for (const { x, y } of pixels) {
        const i = y * this.cols + x;
        if (newBlockData[i]) {
          const i4 = i * 4;
          const r = snapshot.data[i4], g = snapshot.data[i4 + 1], b = snapshot.data[i4 + 2];
          newBlockData[i] = { ...newBlockData[i], r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] };
          
          // Also apply any character override for this cell
          const ansiRow = Math.floor(y / 2);
          const cellIndex = ansiRow * this.cols + x;
          if (this.charEditMap.has(cellIndex)) {
            newBlockData[i].char = this.charEditMap.get(cellIndex);
          }
        }
      }
      this.blockData = newBlockData;
    },

    // Sets a character override for a specific ANSI cell and rebuilds blockData.
    setCharEdit(col, ansiRow, char) {
      const cellIndex = ansiRow * this.cols + col;
      const newMap = new Map(this.charEditMap);
      if (char === null) {
        newMap.delete(cellIndex);
      } else {
        newMap.set(cellIndex, char);
      }
      this.charEditMap = newMap;
      
      // Need a way to refresh if we don't have outputCanvas here.
      // But usually this is called from UI components that can trigger a refresh via the store.
      // For now, let's just update blockData with what we have.
      this.applyCharEdits();
    },

    // Removes character overrides for specific ANSI cells.
    clearCharEditsAt(pixels) {
      if (!this.charEditMap.size) return;
      const newMap = new Map(this.charEditMap);
      let changed = false;
      for (const { x, y } of pixels) {
        const col = Math.floor(x);
        const ansiRow = Math.floor(y / 2);
        const cellIndex = ansiRow * this.cols + col;
        if (newMap.delete(cellIndex)) changed = true;
      }
      if (changed) {
        this.charEditMap = newMap;
        this.applyCharEdits();
      }
    },

    // Applies all charEditMap overrides to the CURRENT blockData (keeps paint colors).
    applyCharEdits() {
      if (!this.blockData.length) return;
      const newBlockData = this.blockData.slice();
      if (this.charEditMap.size > 0) {
        for (const [cellIndex, char] of this.charEditMap.entries()) {
          const col = cellIndex % this.cols;
          const ansiRow = Math.floor(cellIndex / this.cols);
          const bgIdx = ansiRow * this.cols * 2 + col;
          if (newBlockData[bgIdx]) {
            newBlockData[bgIdx] = { ...newBlockData[bgIdx], char };
          }
        }
      } else {
        // If map is empty, we need to revert characters but KEEP paint colors.
        // This is tricky. Let's just use pipelineBlockData for characters.
        for (let i = 0; i < newBlockData.length; i++) {
          if (this.pipelineBlockData[i]) {
            newBlockData[i] = { ...newBlockData[i], char: this.pipelineBlockData[i].char };
          }
        }
      }
      this.blockData = newBlockData;
    },

    // Clears all edits. Increments clearEditsFlag so AnsiWorkspace can watch and re-composite.
    clearEditLayer() {
      if (this.editCanvas) {
        this.editCanvas.getContext('2d', { willReadFrequently: true }).clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
      }
      this.charEditMap = new Map();
      this.hasPaint = false;
      this.clearEditsFlag++;
      this.takeSnapshot();
    },

    takeSnapshot() {
      if (!this.editCanvas) return;
      const ctx = this.editCanvas.getContext('2d', { willReadFrequently: true });
      const snapshot = {
        imageData: ctx.getImageData(0, 0, this.editCanvas.width, this.editCanvas.height),
        charMap: new Map(this.charEditMap),
        hasPaint: this.hasPaint,
      };

      // If we're not at the end of the stack, discard the "future"
      if (this.historyIndex < this.historyStack.length - 1) {
        this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
      }

      this.historyStack.push(snapshot);
      if (this.historyStack.length > 50) {
        this.historyStack.shift();
      } else {
        this.historyIndex++;
      }
    },

    undo() {
      if (!this.canUndo) return;
      this.historyIndex--;
      this.restoreSnapshot(this.historyStack[this.historyIndex]);
    },

    redo() {
      if (!this.canRedo) return;
      this.historyIndex++;
      this.restoreSnapshot(this.historyStack[this.historyIndex]);
    },

    flattenEdits() {
      if (!this.editCanvas || !this.image) return;

      const canvas = document.createElement('canvas');
      canvas.width = this.image.naturalWidth || this.image.width;
      canvas.height = this.image.naturalHeight || this.image.height;
      const ctx = canvas.getContext('2d');

      // 1. Draw original image
      ctx.drawImage(this.image, 0, 0);

      // 2. Draw edit canvas (paint) over it
      // Note: We draw the RAW paint here so it continues to be subject to the global sliders.
      ctx.drawImage(this.editCanvas, 0, 0);

      // 3. Update the source image
      const newImage = new Image();
      newImage.onload = () => {
        this.image = shallowRef(newImage);
        
        // 4. Clear the edit layer now that it's baked in
        const editCtx = this.editCanvas.getContext('2d', { willReadFrequently: true });
        editCtx.clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
        this.hasPaint = false;
        
        // 5. Reset history to the new state
        this.historyStack = [];
        this.historyIndex = -1;
        this.takeSnapshot();
        
        // 6. Signal a full pipeline rerun
        this.clearEditsFlag++;
        this.markDirty();
      };
      newImage.src = canvas.toDataURL('image/png');
    },

    restoreSnapshot(snapshot) {
      if (!this.editCanvas || !snapshot) return;
      const ctx = this.editCanvas.getContext('2d', { willReadFrequently: true });
      ctx.putImageData(snapshot.imageData, 0, 0);
      this.charEditMap = new Map(snapshot.charMap);
      this.hasPaint = snapshot.hasPaint;
      this.clearEditsFlag++; // Signal Workspace to refresh
    },
  },
});

export const allKeys = [
  'image',
  'cols',
  'rows',
  'aspectLock',
  'chars',
  'seed',
  'smoothing',
  'invert',
  'brightness',
  'contrast',
  'saturation',
  'sharpen',
  'flatten',
  'edges',
  'edgeColor',
  'edgeThickness',
  'hue',
  'quantize',
  'palette',
  'colorCount',
  'alphaMode',
  'activeTool',
  'previousTool',
  'editFgColor',
  'editZoom',
  'editBrushSize',
  'editCanvas',
  'charEditMap',
  'hasPaint',
  'clearEditsFlag',
  'previewTab',
  'sauce',
  'filename',
  'blockData',
  'pipelineBlockData',
  'isDirty',
  'editMode',
  'settingsOpen',
  'maxCols',
  'maxRows',
];
