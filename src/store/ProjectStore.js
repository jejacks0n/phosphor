import { shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";
import { rgb2hex } from "@/lib/ColorUtils.js";
import { applyTransforms } from "@/lib/PixelTransforms.js";
import { applyQuantization } from "@/lib/ImageProcessor.js";
import Canvas from "@/lib/Canvas.js";
import { bundleProject, unbundleProject, PROJECT_EXTENSION } from "@/lib/SaveFormat.js";

export const MAX_DIMENSION = 500;

export const useProjectStore = defineStore('project', {
  state: () => ({
    image: shallowRef(null),
    originalFileBuffer: null,
    cols: useLocalStorage('current_file.cols', 80),
    rows: useLocalStorage('current_file.rows', 50),
    aspectLock: useLocalStorage('current_file.aspectLock', true),
    chars: useLocalStorage('current_file.chars', '*:|%.░░▒▒▓▓▁▂▃▄▅■■■■■■■▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄'),
    seed: useLocalStorage('current_file.seed', generateSlug(2)),
    smoothing: useLocalStorage('current_file.smoothing', 'low'),
    quantize: useLocalStorage('current_file.quantize', 'none'),
    palette: useLocalStorage('current_file.palette', '#FFFFFF #AA5601 #000000'),
    colorCount: useLocalStorage('current_file.colorCount', 16),

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

    sauceUse9pxFont: useLocalStorage('current_file.sauce.use9pxFont', false),
    sauceFontName: useLocalStorage('current_file.sauce.fontName', 'IBM VGA'),
    sauceTitle: useLocalStorage('current_file.sauce.title', ''),
    sauceAuthor: useLocalStorage('current_file.sauce.author', ''),
    sauceGroup: useLocalStorage('current_file.sauce.group', ''),
    sauceDate: useLocalStorage('current_file.sauce.date', ''),
    sauceUserComments: useLocalStorage('current_file.sauce.userComments', ''),

    hasPaint: false,
    clearEditsFlag: 0,
    editCanvas: shallowRef(null),
    charEditMap: shallowRef(new Map()),

    filename: null,
    blockData: shallowRef([]),
    pipelineBlockData: shallowRef([]),
    activePalette: shallowRef([]),
    isDirty: false,
    isInitializing: false,

    // History for undo/redo
    historyStack: [],
    historyIndex: -1,
  }),

  getters: {
    canUndo: (state) => state.historyIndex > 0,
    canRedo: (state) => state.historyIndex < state.historyStack.length - 1,
    hasEdits() {
      return this.charEditMap.size > 0 || this.hasPaint || this.historyStack.length > 1;
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
    async setImageFromFile(file) {
      if (!file) return;

      const filename = file.name.replace(/\.[^/.]+$/, '');
      const buffer = await file.arrayBuffer();
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
          originalFileBuffer: buffer,
          editCanvas: null,
          charEditMap: new Map(),
          hasPaint: false,
          cols: Math.max(1, cols),
          rows: Math.max(1, rows),
          filename,
          isDirty: false,
          isInitializing: true,
          sauceTitle: '',
          historyStack: [],
          historyIndex: -1,
        });
        this._rawCanvas = null;
        setTimeout(() => { this.isInitializing = false; }, 0);
      };
      image.src = URL.createObjectURL(new Blob([buffer], { type: file.type }));
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
        isDirty: false
      });
    },

    async saveProject() {
      if (!this.image || !this.originalFileBuffer) return;

      const settings = {};
      
      // We'll manually list keys or just filter state.
      // For now, let's just grab the relevant document state.
      const stateKeys = [
        'cols', 'rows', 'aspectLock', 'chars', 'seed', 'smoothing', 'quantize', 'palette', 'colorCount',
        'invert', 'brightness', 'contrast', 'saturation', 'hue', 'sharpen', 'flatten', 'edges', 'edgeColor', 'edgeThickness',
        'sauceUse9pxFont', 'sauceFontName', 'sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceDate', 'sauceUserComments'
      ];

      for (const key of stateKeys) {
        settings[key] = this[key];
      }
      settings.charEditMap = Array.from(this.charEditMap.entries());

      let paintBuffer = new ArrayBuffer(0);
      if (this.editCanvas) {
        const blob = await new Promise(resolve => this.editCanvas.toBlob(resolve, 'image/png'));
        paintBuffer = await blob.arrayBuffer();
      }

      const totalBlob = await bundleProject(settings, this.originalFileBuffer, paintBuffer);

      const link = document.createElement('a');
      link.download = `${this.filename}${PROJECT_EXTENSION}`;
      link.href = URL.createObjectURL(totalBlob);
      link.click();
    },

    async loadProject(file) {
      if (!file || !file.name.endsWith(PROJECT_EXTENSION)) return;

      try {
        const { settings, originalBuffer, paintBuffer, hasPaint } = await unbundleProject(file);
        
        const charMap = new Map(settings.charEditMap || []);
        delete settings.charEditMap;

        const image = new Image();
        image.onload = () => {
          this.$patch({
            ...settings,
            image: shallowRef(image),
            originalFileBuffer: originalBuffer,
            charEditMap: charMap,
            hasPaint,
            isInitializing: true,
            historyStack: [],
            historyIndex: -1,
          });

          if (hasPaint) {
            const paintImg = new Image();
            paintImg.onload = () => {
              const c = document.createElement('canvas');
              c.width = paintImg.width;
              c.height = paintImg.height;
              const ctx = c.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(paintImg, 0, 0);
              this.editCanvas = c;
              this.clearEditsFlag++;
              this.applyCharEdits();
              this.takeSnapshot();
              this.isInitializing = false;
            };
            paintImg.src = URL.createObjectURL(new Blob([paintBuffer], { type: 'image/png' }));
          } else {
            this.editCanvas = null;
            this.applyCharEdits();
            this.takeSnapshot();
            this.isInitializing = false;
          }
        };
        image.src = URL.createObjectURL(new Blob([originalBuffer]));
      } catch (e) {
        console.error('Failed to load project file', e);
        alert('Failed to load project file: ' + e.message);
      }
    },

    async exportFile(ext, opts = {}) {
      const settings = [
        `Created with Phosphor`,
        `Params: seed=${this.seed}, smoothing=${this.smoothing}, quantize=${this.quantize}`,
        `Adjust: brightness=${this.brightness}%, contrast=${this.contrast}%, saturation=${this.saturation}%, invert=${this.invert}%`,
        `Effects: sharpen=${this.sharpen}, flatten=${this.flatten}, edges=${this.edges} (${this.edgeColor}), thickness=${this.edgeThickness}`,
      ];

      if (this.sauceUserComments) {
        settings.push(''); // Spacer
        const userLines = this.sauceUserComments.split('\n');
        settings.push(...userLines);
      }

      const file = new AnsiFile(this.cols, Math.floor(this.rows * 0.5), this.blockData);
      await file.exportAs(`${this.filename}.${ext}`, {
        sauce: {
          use9pxFont: this.sauceUse9pxFont,
          fontName: this.sauceFontName,
          title: this.sauceTitle,
          author: this.sauceAuthor,
          group: this.sauceGroup,
          date: this.sauceDate,
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

    // Edit canvas initialization
    initEditCanvas(w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, w || 1);
      c.height = Math.max(1, h || 1);
      this.editCanvas = c;
      this.takeSnapshot();
    },

    getFitParams(w, h) {
      if (!this.image) return { dx: 0, dy: 0, dw: w, dh: h };
      const sw = this.image.naturalWidth || this.image.width;
      const sh = this.image.naturalHeight || this.image.height;
      const sa = sw / sh;
      const ta = w / h;
      let dw, dh;
      if (sa > ta) {
        dw = w;
        dh = w / sa;
      } else {
        dw = h * sa;
        dh = h;
      }
      const dx = Math.floor((w - dw) * 0.5);
      const dy = Math.floor((h - dh) * 0.5);
      return { dx, dy, dw: Math.floor(dw), dh: Math.floor(dh) };
    },

    compositeEditCanvas(pipelineCanvas, outputCanvas) {
      if (!outputCanvas || !pipelineCanvas) return;
      const ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
      const w = outputCanvas.width, h = outputCanvas.height;

      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(pipelineCanvas, 0, 0, w, h);

      if (!this.editCanvas || !this.image) return;

      const { dx, dy, dw, dh } = this.getFitParams(w, h);
      const downsampled = document.createElement('canvas');
      downsampled.width = dw;
      downsampled.height = dh;
      const dsCtx = downsampled.getContext('2d', { willReadFrequently: true });

      dsCtx.imageSmoothingEnabled = false;
      dsCtx.drawImage(this.editCanvas, 0, 0, dw, dh);

      const br = parseFloat(this.brightness) / 100;
      const ct = parseFloat(this.contrast) / 100;
      const sa_val = parseFloat(this.saturation) / 100;
      const hu = parseFloat(this.hue) / 360;
      const inv = parseFloat(this.invert) / 100;

      const needsTransform = br !== 1 || ct !== 1 || sa_val !== 1 || hu !== 0 || inv !== 0;

      if (needsTransform) {
        const id = dsCtx.getImageData(0, 0, dw, dh);
        applyTransforms(id.data, this.brightness, this.contrast, this.saturation, this.hue, this.invert);
        dsCtx.putImageData(id, 0, 0);
      }

      ctx.drawImage(downsampled, dx, dy);

      if (this.activePalette && this.activePalette.length > 0) {
        const wrapper = new Canvas(outputCanvas);
        applyQuantization(wrapper, this.activePalette);
      }
    },

    refreshBlockData(outputCanvas) {
      if (!this.pipelineBlockData.length || !outputCanvas) return;

      const w = this.cols, h = this.rows;
      if (!this.hasPaint && this.charEditMap.size === 0) {
        this.blockData = this.pipelineBlockData;
        return;
      }

      const newBlockData = this.pipelineBlockData.slice();
      const { dx, dy, dw, dh } = this.getFitParams(w, h);

      if (this.hasPaint && this.editCanvas) {
        const editTemp = document.createElement('canvas');
        editTemp.width = dw;
        editTemp.height = dh;
        const etCtx = editTemp.getContext('2d', { willReadFrequently: true });
        etCtx.drawImage(this.editCanvas, 0, 0, dw, dh);

        const editData = etCtx.getImageData(0, 0, dw, dh).data;
        const outData = outputCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;

        for (let y = 0; y < dh; y++) {
          const ty = y + dy;
          if (ty < 0 || ty >= h) continue;
          for (let x = 0; x < dw; x++) {
            const tx = x + dx;
            if (tx < 0 || tx >= w) continue;

            const iEdit = (y * dw + x) * 4;
            if (editData[iEdit + 3] > 0) {
              const iOut = ty * w + tx;
              const iOut4 = iOut * 4;
              const r = outData[iOut4], g = outData[iOut4 + 1], b = outData[iOut4 + 2];
              newBlockData[iOut] = { ...newBlockData[iOut], r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] };
            }
          }
        }
      }

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

    getRawColorAt(x, y) {
      if (!this.image) return '#000000';
      const { dx, dy, dw, dh } = this.getFitParams(this.cols, this.rows);
      const ix_grid = x - dx;
      const iy_grid = y - dy;
      if (ix_grid < 0 || iy_grid < 0 || ix_grid >= dw || iy_grid >= dh) return '#000000';
      
      if (this.editCanvas) {
        const wScale = this.editCanvas.width / dw;
        const hScale = this.editCanvas.height / dh;
        const ctx = this.editCanvas.getContext('2d', { willReadFrequently: true });
        const px = Math.floor(ix_grid * wScale);
        const py = Math.floor(iy_grid * hScale);
        const pixel = ctx.getImageData(px, py, 1, 1).data;
        if (pixel[3] > 0) {
          return rgb2hex({ r: pixel[0], g: pixel[1], b: pixel[2] });
        }
      }
      
      if (!this._rawCanvas) {
        this._rawCanvas = document.createElement('canvas');
        this._rawCanvas.width = this.image.naturalWidth || this.image.width;
        this._rawCanvas.height = this.image.naturalHeight || this.image.height;
        this._rawCanvas.getContext('2d', { willReadFrequently: true }).drawImage(this.image, 0, 0);
      }
      
      const rw = this._rawCanvas.width, rh = this._rawCanvas.height;
      const rx = Math.floor((ix_grid / dw) * rw);
      const ry = Math.floor((iy_grid / dh) * rh);
      const rCtx = this._rawCanvas.getContext('2d', { willReadFrequently: true });
      const rPixel = rCtx.getImageData(rx, ry, 1, 1).data;
      return rgb2hex({ r: rPixel[0], g: rPixel[1], b: rPixel[2] });
    },

    paintEditPixels(pixels, pipelineCanvas, outputCanvas, opacity = 100) {
      if (!this.editCanvas || !pixels.length) return;
      this.hasPaint = true;
      const editCtx = this.editCanvas.getContext('2d', { willReadFrequently: true });
      const { dx, dy, dw, dh } = this.getFitParams(this.cols, this.rows);
      const wScale = this.editCanvas.width / dw;
      const hScale = this.editCanvas.height / dh;

      const rects = [];
      for (const { x, y, r, g, b, alpha } of pixels) {
        const ix = x - dx;
        const iy = y - dy;
        if (ix < 0 || iy < 0 || ix >= dw || iy >= dh) continue;
        const cx = Math.round(ix * wScale);
        const cy = Math.round(iy * hScale);
        rects.push({
          cx, cy,
          cw: Math.max(1, Math.round((ix + 1) * wScale) - cx),
          ch: Math.max(1, Math.round((iy + 1) * hScale) - cy),
          r, g, b,
          a: Math.round(alpha * 255),
        });
      }

      if (rects.length) {
        let minX = rects[0].cx, minY = rects[0].cy;
        let maxX = rects[0].cx + rects[0].cw, maxY = rects[0].cy + rects[0].ch;
        for (const { cx, cy, cw, ch } of rects) {
          if (cx < minX) minX = cx;
          if (cy < minY) minY = cy;
          if (cx + cw > maxX) maxX = cx + cw;
          if (cy + ch > maxY) maxY = cy + ch;
        }

        const regionW = maxX - minX;
        const regionH = maxY - minY;
        const imageData = editCtx.getImageData(minX, minY, regionW, regionH);
        const data = imageData.data;
        const maxA = Math.round((opacity / 100) * 255);

        for (const { cx, cy, cw, ch, r, g, b, a } of rects) {
          if (a === 0) continue;
          for (let py = cy; py < cy + ch; py++) {
            for (let px = cx; px < cx + cw; px++) {
              const idx = ((py - minY) * regionW + (px - minX)) * 4;
              const existingA = data[idx + 3];
              if (existingA >= maxA) {
                const blend = Math.min(1, a / 255);
                data[idx]     = Math.round(data[idx]     + (r - data[idx])     * blend);
                data[idx + 1] = Math.round(data[idx + 1] + (g - data[idx + 1]) * blend);
                data[idx + 2] = Math.round(data[idx + 2] + (b - data[idx + 2]) * blend);
              } else {
                data[idx + 3] = Math.min(maxA, existingA + a);
                data[idx]     = Math.round((data[idx]     * existingA + r * a) / (existingA + a));
                data[idx + 1] = Math.round((data[idx + 1] * existingA + g * a) / (existingA + a));
                data[idx + 2] = Math.round((data[idx + 2] * existingA + b * a) / (existingA + a));
              }
            }
          }
        }
        editCtx.putImageData(imageData, minX, minY);
      }

      this.compositeEditCanvas(pipelineCanvas, outputCanvas);
      this.syncBlockData(pixels, outputCanvas, dx, dy, dw, dh);
    },

    eraseEditPixels(pixels, pipelineCanvas, outputCanvas) {
      if (!this.editCanvas || !pixels.length) return;
      const editCtx = this.editCanvas.getContext('2d', { willReadFrequently: true });
      const { dx, dy, dw, dh } = this.getFitParams(this.cols, this.rows);
      const wScale = this.editCanvas.width / dw;
      const hScale = this.editCanvas.height / dh;

      for (const { x, y } of pixels) {
        const ix = x - dx;
        const iy = y - dy;
        if (ix < 0 || iy < 0 || ix >= dw || iy >= dh) continue;
        editCtx.clearRect(Math.floor(ix * wScale), Math.floor(iy * hScale), Math.ceil(wScale), Math.ceil(hScale));
      }

      this.compositeEditCanvas(pipelineCanvas, outputCanvas);
      this.syncBlockData(pixels, outputCanvas, dx, dy, dw, dh);
    },

    syncBlockData(pixels, outputCanvas, dx, dy, dw, dh) {
      const snapshot = outputCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, this.cols, this.rows);
      const newBlockData = this.blockData.slice();
      for (const { x, y } of pixels) {
        const i = y * this.cols + x;
        if (newBlockData[i]) {
          if (x >= dx && x < dx + dw && y >= dy && y < dy + dh) {
            const i4 = i * 4;
            const r = snapshot.data[i4], g = snapshot.data[i4 + 1], b = snapshot.data[i4 + 2];
            newBlockData[i] = { ...newBlockData[i], r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] };
          }
          const ansiRow = Math.floor(y / 2);
          const cellIndex = ansiRow * this.cols + x;
          if (this.charEditMap.has(cellIndex)) {
            newBlockData[i].char = this.charEditMap.get(cellIndex);
          }
        }
      }
      this.blockData = newBlockData;
    },

    setCharEdit(col, ansiRow, char) {
      const cellIndex = ansiRow * this.cols + col;
      const newMap = new Map(this.charEditMap);
      if (char === null) newMap.delete(cellIndex);
      else newMap.set(cellIndex, char);
      this.charEditMap = newMap;
      this.applyCharEdits();
    },

    flipAnsiColors(col, ansiRow, pipelineCanvas, outputCanvas) {
      if (!this.editCanvas) return;
      const bgIdx = ansiRow * this.cols * 2 + col;
      const fgIdx = bgIdx + this.cols;

      if (!this.blockData[bgIdx] || !this.blockData[fgIdx]) return;

      const bg = this.blockData[bgIdx];
      const fg = this.blockData[fgIdx];

      this.paintEditPixels([
        { x: col, y: ansiRow * 2, r: fg.r, g: fg.g, b: fg.b, alpha: 1 },
        { x: col, y: ansiRow * 2 + 1, r: bg.r, g: bg.g, b: bg.b, alpha: 1 },
      ], pipelineCanvas, outputCanvas);
    },

    applyCharEdits() {
      if (!this.blockData.length) return;
      const newBlockData = this.blockData.slice();
      if (this.charEditMap.size > 0) {
        for (const [cellIndex, char] of this.charEditMap.entries()) {
          const col = cellIndex % this.cols;
          const ansiRow = Math.floor(cellIndex / this.cols);
          const bgIdx = ansiRow * this.cols * 2 + col;
          if (newBlockData[bgIdx]) newBlockData[bgIdx] = { ...newBlockData[bgIdx], char };
        }
      } else {
        for (let i = 0; i < newBlockData.length; i++) {
          if (this.pipelineBlockData[i]) newBlockData[i] = { ...newBlockData[i], char: this.pipelineBlockData[i].char };
        }
      }
      this.blockData = newBlockData;
    },

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

    clearEditLayer() {
      if (this.editCanvas) this.editCanvas.getContext('2d', { willReadFrequently: true }).clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
      this.charEditMap = new Map();
      this.hasPaint = false;
      this.clearEditsFlag++;
      this.historyStack = [];
      this.historyIndex = -1;
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
      if (this.historyIndex < this.historyStack.length - 1) this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
      this.historyStack.push(snapshot);
      if (this.historyStack.length > 50) this.historyStack.shift();
      else this.historyIndex++;
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

    restoreSnapshot(snapshot) {
      if (!this.editCanvas || !snapshot) return;
      this.editCanvas.getContext('2d', { willReadFrequently: true }).putImageData(snapshot.imageData, 0, 0);
      this.charEditMap = new Map(snapshot.charMap);
      this.hasPaint = snapshot.hasPaint;
      this.clearEditsFlag++;
    },

    flattenEdits() {
      if (!this.editCanvas || !this.image) return;
      const canvas = document.createElement('canvas');
      canvas.width = this.image.naturalWidth || this.image.width;
      canvas.height = this.image.naturalHeight || this.image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this.image, 0, 0);
      ctx.drawImage(this.editCanvas, 0, 0);
      const newImage = new Image();
      newImage.onload = () => {
        this.image = shallowRef(newImage);
        const editCtx = this.editCanvas.getContext('2d', { willReadFrequently: true });
        editCtx.clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
        this.hasPaint = false;
        this.historyStack = [];
        this.historyIndex = -1;
        this.takeSnapshot();
        this.clearEditsFlag++;
        this.markDirty();
      };
      newImage.src = canvas.toDataURL('image/png');
    },
  },
});

export const projectStateKeys = [
  'cols', 'rows', 'aspectLock', 'chars', 'seed', 'smoothing', 'quantize', 'palette', 'colorCount',
  'invert', 'brightness', 'contrast', 'saturation', 'hue', 'sharpen', 'flatten', 'edges', 'edgeColor', 'edgeThickness',
  'sauceUse9pxFont', 'sauceFontName', 'sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceDate', 'sauceUserComments',
  'filename', 'isDirty'
];
