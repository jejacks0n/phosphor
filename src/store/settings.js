import { useLocalStorage } from '@vueuse/core';
import { generateSlug } from 'random-word-slugs';

// Every persisted project setting, declared once. Order within the transform, adjust and effects
// groups is the ControlPanel's on-screen order. Storage keys must never change: they hold users' settings.
export const SETTINGS = [
  { key: 'cols', default: 80, group: 'setup', label: 'Dimensions', help: 'The art\'s width in columns and height in rows (two pixel rows per character row). Before you draw, a new size converts the image again; once the edit layer has something on it, cells are added or removed at the right and bottom instead.' },
  { key: 'rows', default: 50, group: 'setup' },
  { key: 'aspectLock', default: true, group: 'setup', pipeline: false },
  { key: 'renderStyle', default: 'ansi', group: 'setup', help: 'ANSI colors both the character and its background. Color ASCII puts colored characters on black. Monochrome ASCII is one color.' },
  { key: 'chars', default: '.*:%░░▒▒▓▓▄■■■■■■■▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄', group: 'setup', pipeline: false, help: 'The characters the converter picks from, at random for ANSI and by brightness for ASCII. Repeat a character to get more of it. Two-column characters (like 漢) are skipped: converted cells are one column wide.' },
  { key: 'charsAscii', default: ' .:*%#@', group: 'setup', pipeline: false },
  { key: 'seed', default: () => generateSlug(2), group: 'setup', help: 'Decides which character goes in each cell. The same seed gives the same result; the dice picks a new one.' },
  { key: 'quantize', default: 'none', group: 'setup', help: 'Full color keeps every color. VGA and CGA snap to those palettes. Color count picks that many colors from your picture, and Color list uses only the colors you type.' },
  { key: 'colorCount', default: 16, group: 'setup', label: 'Color Count', min: 2, max: 255 },
  { key: 'palette', default: '#FFFFFF #AA5601 #000000', group: 'setup' },
  { key: 'smoothing', default: 'high', group: 'setup', help: 'How the image is scaled down to the grid. High is smoother; Low keeps harder edges and more noise.' },

  { key: 'colorizeStrength', default: 0, group: 'transform', label: 'Colorize', min: 0, max: 100, unit: '%', ticks: [0], companion: 'colorize', help: 'Tints the image with a color, keeping its lightness.' },
  { key: 'colorize', default: '#ff00ff', group: 'transform', reset: false },
  { key: 'hue', default: 0, group: 'transform', label: 'Hue Rotation', min: 0, max: 360, unit: '°', help: 'Shifts all colors around the color wheel.' },
  { key: 'invert', default: 0, group: 'transform', label: 'Invert', min: 0, max: 100, unit: '%', help: 'Turns colors into their negatives (applied after the other color changes).' },

  { key: 'brightness', default: 100, group: 'adjust', label: 'Brightness', min: 0, max: 500, unit: '%', ticks: [100], help: 'Makes the whole image lighter or darker.' },
  { key: 'contrast', default: 100, group: 'adjust', label: 'Contrast', min: 0, max: 500, unit: '%', ticks: [100], help: 'Widens or narrows the range between light and dark.' },
  { key: 'saturation', default: 100, group: 'adjust', label: 'Saturation', min: 0, max: 500, unit: '%', ticks: [100], help: 'How strong the colors are.' },

  { key: 'flatten', default: 0, group: 'effects', label: 'Flatten', min: 0, max: 10, ticks: [0], help: 'Merges similar colors into flat areas, for a simpler, painted look.' },
  { key: 'sharpen', default: 0, group: 'effects', label: 'Sharpen', min: 0, max: 100, ticks: [0], help: 'Sharpens edges and fine detail.' },
  { key: 'edges', default: 0, group: 'effects', label: 'Edges', min: 0, max: 20, step: 0.01, decimals: 2, ticks: [0], companion: 'edgeColor', help: 'Finds outlines in the image and draws them in the Edges color.' },
  { key: 'edgeColor', default: '#000000', group: 'effects' },
  { key: 'edgeThickness', default: 1, group: 'effects', label: 'Edge Thickness', min: 0, max: 5, step: 0.1, decimals: 1, help: 'How thick the outlines are.' },

  { key: 'sauceUse9pxFont', default: false, group: 'sauce', storageKey: 'current_file.sauce.use9pxFont' },
  { key: 'sauceFontName', default: 'IBM VGA', group: 'sauce', storageKey: 'current_file.sauce.fontName' },
  { key: 'sauceTitle', default: '', group: 'sauce', storageKey: 'current_file.sauce.title' },
  { key: 'sauceAuthor', default: '', group: 'sauce', storageKey: 'current_file.sauce.author' },
  { key: 'sauceGroup', default: '', group: 'sauce', storageKey: 'current_file.sauce.group' },
  { key: 'sauceDate', default: '', group: 'sauce', storageKey: 'current_file.sauce.date' },
  { key: 'sauceUserComments', default: '', group: 'sauce', storageKey: 'current_file.sauce.userComments' },
];

const BY_KEY = new Map(SETTINGS.map(s => [s.key, s]));
const defaultOf = (s) => (typeof s.default === 'function' ? s.default() : s.default);

// Conversion settings: persisted, saved with projects, and edited in the ControlPanel.
export const SETTING_KEYS = SETTINGS.filter(s => s.group !== 'sauce').map(s => s.key);
export const SAUCE_KEYS = SETTINGS.filter(s => s.group === 'sauce').map(s => s.key);
export const RESET_GROUPS = ['transform', 'adjust', 'effects'];

// Whether every slider a bake (or Reset All) resets is at its default: nothing to bake. A slider
// can hold its value as a numeric string.
export function slidersAtDefaults(state) {
  return RESET_GROUPS.every(group => Object.entries(groupDefaults(group)).every(([key, value]) =>
    (typeof value === 'number' ? Number(state[key]) === value : state[key] === value)));
}

export function getSetting(key) {
  return BY_KEY.get(key);
}

// Each tab keeps its own document: another tab's changes reach this one only on reload.
export function settingsState() {
  return Object.fromEntries(SETTINGS.map(s => [s.key, useLocalStorage(s.storageKey ?? `current_file.${s.key}`, defaultOf(s), { listenToStorageChanges: false })]));
}

export const settingDefaults = () => Object.fromEntries(SETTINGS.map(s => [s.key, defaultOf(s)]));

export function groupDefaults(group) {
  return Object.fromEntries(SETTINGS.filter(s => s.group === group && s.reset !== false).map(s => [s.key, defaultOf(s)]));
}

// Pipeline params with every per-pixel color adjustment neutral (transform, adjust): rendering with
// these gives the image downsampled exactly as the pipeline does, before adjustments (underlying
// colors), which effectiveColor re-applies per cell. Effects (Flatten, Edges, Sharpen) stay: they
// work on neighboring pixels, so a cell couldn't re-apply them. CGA/VGA stay: the pipeline snaps
// each pixel to them before downsampling, so the result matches; other palettes are applied after
// downsampling and are dropped.
const NEUTRAL_GROUPS = ['transform', 'adjust'];
export function baseParams(params) {
  const quantize = params.quantize === 'cga' || params.quantize === 'vga' ? params.quantize : 'none';
  return { ...params, ...Object.assign({}, ...NEUTRAL_GROUPS.map(groupDefaults)), quantize };
}
