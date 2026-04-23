import { shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";

export const useCurrentFileStore = defineStore('current_file', {
  undo: {
    omit: ['image', 'blockData', 'outputCanvas'],
  },
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
    palette: useLocalStorage('current_file.palette', ''),
    colorCount: useLocalStorage('current_file.colorCount', 16),

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
  }),
  getters: {
    imageRatio: (state) => {
      if (!state.image) return null;
      return (state.image.naturalWidth || state.image.width) / (state.image.naturalHeight || state.image.height);
    },
  },
  actions: {
    randomizeSeed() {
      this.seed = generateSlug(2);
    },
    async setImageFromInput(event) {
      await this.setImageFromFile(event.target.files[0]);
    },
    async setImageFromFile(file) {
      if (!file) return;

      const filename = file.name.replace(/\.[^/.]+$/, '');
      const image = new Image();
      image.onload = () => {
        this.$patch({ image, filename, previewTab: 'ansi' });
        this.sauce.title = '';
        this.rows = Math.ceil(this.cols / this.imageRatio);
      };
      image.src = URL.createObjectURL(file);
    },
    clearImage() {
      this.$patch({
        image: null,
        filename: null,
        blockData: [],
        previewTab: 'source'
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
      if (isNaN(val)) return;
      this.cols = val;
      if (this.aspectLock && this.imageRatio) {
        this.rows = Math.ceil(val / this.imageRatio);
      }
    },
    updateRows(val) {
      if (isNaN(val)) return;
      this.rows = val;
      if (this.aspectLock && this.imageRatio) {
        this.cols = Math.round(val * this.imageRatio);
      }
    },
    resetTransform() {
      this.$patch({
        invert: 0,
        hue: 0,
      });
    },
    resetAdjust() {
      this.$patch({
        brightness: 100,
        contrast: 100,
        saturation: 100,
      });
    },
    resetEffects() {
      this.$patch({
        sharpen: 0,
        flatten: 0,
        edges: 0,
        edgeColor: '#000000',
        edgeThickness: 1,
      });
    }
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
  'previewTab',
  'sauce',
  'filename',
  'blockData',
];
