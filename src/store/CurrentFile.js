import { shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { useLocalStorage } from '@vueuse/core';
import { generateSlug } from "random-word-slugs";
import { AnsiFile } from "@/lib/AnsiFile.js";

export const useCurrentFileStore = defineStore({
  id: 'currentFile',
  state: () => ({
    image: null,
    seed: useLocalStorage('current_file.seed', generateSlug(2)),
    cols: useLocalStorage('current_file.cols', 80),
    rows: useLocalStorage('current_file.rows', 25),
    chars: useLocalStorage('current_file.chars', '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄■■■■■■■*:|%.░░▒▒▓▓'), // ▄■.░▒▓▀▌▐ █▅▃▂▁▖▗
    smoothing: useLocalStorage('current_file.smoothing', 'none'),
    invert: useLocalStorage('current_file.invert', 0), // 0% - 100%
    brightness: useLocalStorage('current_file.brightness', 100), // 0% - 200%
    contrast: useLocalStorage('current_file.contrast', 100), // 0% - 200%
    saturation: useLocalStorage('current_file.saturation', 100), // 0% - 200%
    hue: useLocalStorage('current_file.hue', 0), // 0deg - 360deg
    quantize: useLocalStorage('current_file.quantize', 'none'),
    palette: useLocalStorage('current_file.palette', ''),
    colorCount: useLocalStorage('current_file.colorCount', 16),

    filename: null,
    blockData: shallowRef([]),

    sauce: {
      // cols
      // rows
      // filesize
      iceColor: useLocalStorage('current_file.sauce.iceColor', false),
      // iceColor = (colorMode !== 'cga' || !blink)
      use9pxFont: useLocalStorage('current_file.sauce.use9pxFont', false),
      fontName: useLocalStorage('current_file.sauce.fontName', 'IBM VGA'),

      title: useLocalStorage('current_file.sauce.title', ''),
      author: useLocalStorage('current_file.sauce.author', ''),
      group: useLocalStorage('current_file.sauce.group', ''),
      date: useLocalStorage('current_file.sauce.date', ''),
      comments: useLocalStorage('current_file.sauce.comments', ''),
    },
  }),
  getters: {},
  actions: {
    randomizeSeed() {
      this.seed = generateSlug(2);
    },
    async setImageFromInput(event) {
      await this.setImageFromFile(event.target.files[0]);
    },
    async setImageFromFile(file) {
      if (!file) return;

      const filename = file.name.replace(/\.[^/.]+$/, '')
      const image = new Image();
      image.onload = () => {
        const rows = Math.ceil(image.height / (image.width / this.cols));
        this.$patch({ image, rows, filename });
      };
      image.src = URL.createObjectURL(file);
    },
    exportFile(ext, opts = {}) {
      const file = new AnsiFile(this.cols, Math.floor(this.rows * 0.5), this.blockData);
      file.exportAs(`${this.filename}.${ext}`, { sauce: this.sauce, ...opts });
    },
  },
  undo: {
    omit: ['image', 'blockData'],
  },
});

export const allKeys = [
  'image',
  'seed',
  'cols',
  'rows',
  'chars',
  'smoothing',
  'invert',
  'brightness',
  'contrast',
  'saturation',
  'hue',
  'quantize',
  'palette',
  'colorCount',
  'filename',
  'blockData',
];
