import { useLocalStorage } from '@vueuse/core';
import { generateSlug } from 'random-word-slugs';

// Every persisted project setting, declared once. Order within the transform, adjust and effects
// groups is the ControlPanel's on-screen order. Storage keys must never change: they hold users' settings.
export const SETTINGS = [
  { key: 'cols', default: 80, group: 'setup', label: 'Dimensions', help: 'Target output width (columns) and height (rows). Before you draw, resizing re-converts the image at the new size; once the edit layer has content, it adds or removes cells at the right and bottom instead.' },
  { key: 'rows', default: 50, group: 'setup' },
  { key: 'aspectLock', default: true, group: 'setup', pipeline: false },
  { key: 'renderStyle', default: 'ansi', group: 'setup', help: "'ANSI' uses both foreground and background colors for maximum detail. 'Color ASCII' uses characters on a black background. 'ASCII' is monochrome art." },
  { key: 'chars', default: '.*:%░░▒▒▓▓▁▂▃▄▅■■■■■■■▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄', group: 'setup', pipeline: false, help: 'The character set used to represent density and texture. Characters two cells wide (like 漢) are skipped here: generated cells are one column.' },
  { key: 'charsAscii', default: ' .:*%#@', group: 'setup', pipeline: false },
  { key: 'seed', default: () => generateSlug(2), group: 'setup', help: 'A unique value to randomize the character selection.' },
  { key: 'quantize', default: 'none', group: 'setup', help: 'Restricts the final output to specific color standards.' },
  { key: 'colorCount', default: 16, group: 'setup', label: 'Color Count', min: 2, max: 255 },
  { key: 'palette', default: '#FFFFFF #AA5601 #000000', group: 'setup' },
  { key: 'smoothing', default: 'high', group: 'setup', help: 'Determines how details are preserved when downsizing to the grid.' },

  { key: 'colorizeStrength', default: 0, group: 'transform', label: 'Colorize', min: 0, max: 100, unit: '%', ticks: [0], companion: 'colorize', help: 'Tints the image with a color while preserving lightness.' },
  { key: 'colorize', default: '#ff00ff', group: 'transform', reset: false },
  { key: 'hue', default: 0, group: 'transform', label: 'Hue Rotation', min: 0, max: 360, unit: '°', help: 'Shifts all colors around the color wheel.' },
  { key: 'invert', default: 0, group: 'transform', label: 'Invert', min: 0, max: 100, unit: '%', help: 'Flips colors to their negatives (applied last in the color pipeline).' },

  { key: 'brightness', default: 100, group: 'adjust', label: 'Brightness', min: 0, max: 500, unit: '%', ticks: [100], help: 'Adjusts overall light levels.' },
  { key: 'contrast', default: 100, group: 'adjust', label: 'Contrast', min: 0, max: 500, unit: '%', ticks: [100], help: 'Increases or decreases the range between light and dark.' },
  { key: 'saturation', default: 100, group: 'adjust', label: 'Saturation', min: 0, max: 500, unit: '%', ticks: [100], help: 'Controls the intensity and vibrancy of colors.' },

  { key: 'flatten', default: 0, group: 'effects', label: 'Flatten', min: 0, max: 10, ticks: [0], help: 'Groups similar colors to create a painted, simplified look.' },
  { key: 'sharpen', default: 0, group: 'effects', label: 'Sharpen', min: 0, max: 100, ticks: [0], help: 'Enhances local contrast to make details and edges pop.' },
  { key: 'edges', default: 0, group: 'effects', label: 'Edges', min: 0, max: 20, step: 0.01, decimals: 2, ticks: [0], companion: 'edgeColor', help: 'Detects and strokes outlines in the image.' },
  { key: 'edgeColor', default: '#000000', group: 'effects' },
  { key: 'edgeThickness', default: 1, group: 'effects', label: 'Edge Thickness', min: 0, max: 5, step: 0.1, decimals: 1, help: 'Controls the width of the detected edges.' },

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

export function settingsState() {
  return Object.fromEntries(SETTINGS.map(s => [s.key, useLocalStorage(s.storageKey ?? `current_file.${s.key}`, defaultOf(s))]));
}

export function groupDefaults(group) {
  return Object.fromEntries(SETTINGS.filter(s => s.group === group && s.reset !== false).map(s => [s.key, defaultOf(s)]));
}

// Pipeline params with every per-pixel colour adjustment neutral (transform, adjust): rendering with
// these gives the image downsampled exactly as the pipeline does, before adjustments (underlying
// colours), which effectiveColor re-applies per cell. Effects (Flatten, Edges, Sharpen) stay: they
// work on neighbouring pixels, so a cell couldn't re-apply them. CGA/VGA stay: the pipeline snaps
// each pixel to them before downsampling, so the result matches; other palettes are applied after
// downsampling and are dropped.
const NEUTRAL_GROUPS = ['transform', 'adjust'];
export function baseParams(params) {
  const quantize = params.quantize === 'cga' || params.quantize === 'vga' ? params.quantize : 'none';
  return { ...params, ...Object.assign({}, ...NEUTRAL_GROUPS.map(groupDefaults)), quantize };
}
