import { useLocalStorage } from '@vueuse/core';
import { generateSlug } from 'random-word-slugs';
import { goodBaseScale, goodFit, goodScale } from '@/document/projectIO.js';
import { MAX_COLS, maxRowsBeside } from '@/lib/Cells.js';
import { SAUCE_WIDTHS } from '@/lib/Sauce.js';
import { t } from '@/i18n/index.js';

// A list of characters or colors, in characters: every CP437 character 64 times over, or 2000 colors.
const MOST_LIST = 16 * 1024;
const MOST_TEXT = 1024;   // any other text a setting holds

// Every persisted project setting, declared once. Order within the transform, adjust and effects
// groups is the ControlPanel's on-screen order. Storage keys must never change: they hold users' settings.
export const SETTINGS = [
  { key: 'cols', default: 80, group: 'setup', get label() { return t('settings.cols.label'); }, get help() { return t('settings.cols.help'); } },
  { key: 'rows', default: 50, group: 'setup' },
  { key: 'aspectLock', default: true, group: 'setup', pipeline: false },
  { key: 'renderStyle', default: 'ansi', group: 'setup', get help() { return t('settings.renderStyle.help'); } },
  { key: 'chars', default: '.*:%░░▒▒▓▓▄■■■■■■■▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄', group: 'setup', pipeline: false, most: MOST_LIST, get help() { return t('settings.chars.help'); } },
  { key: 'charsAscii', default: ' .:*%#@', group: 'setup', pipeline: false, most: MOST_LIST },
  { key: 'seed', default: () => generateSlug(2), group: 'setup', get help() { return t('settings.seed.help'); } },
  { key: 'charChoice', default: 'random', group: 'setup', pipeline: false, get help() { return t('settings.charChoice.help'); } },
  { key: 'charChoiceAscii', default: 'weight', group: 'setup', pipeline: false, get help() { return t('settings.charChoiceAscii.help'); } },
  { key: 'solids', default: 25, group: 'setup', pipeline: false, get label() { return t('settings.solids.label'); }, min: 0, max: 100, unit: '%', ticks: [0], get help() { return t('settings.solids.help'); } },
  { key: 'patternLight', default: 100, group: 'setup', pipeline: false, get label() { return t('settings.patternLight.label'); }, min: 0, max: 100, unit: '%', ticks: [0, 100], get help() { return t('settings.patternLight.help'); } },
  { key: 'quantize', default: 'none', group: 'setup', get help() { return t('settings.quantize.help'); } },
  { key: 'colorCount', default: 16, group: 'setup', get label() { return t('settings.colorCount.label'); }, min: 2, max: 255 },
  { key: 'palette', default: '#FFFFFF #AA5601 #000000', group: 'setup', most: MOST_LIST },
  { key: 'ditherStyle', default: 'floyd', group: 'setup', get help() { return t('settings.ditherStyle.help'); } },
  { key: 'dither', default: 0, group: 'setup', get label() { return t('settings.dither.label'); }, min: 0, max: 100, unit: '%', ticks: [0], get help() { return t('settings.dither.help'); } },
  { key: 'smoothing', default: 'high', group: 'setup', get help() { return t('settings.smoothing.help'); } },

  { key: 'colorizeStrength', default: 0, group: 'transform', get label() { return t('settings.colorizeStrength.label'); }, min: 0, max: 100, unit: '%', ticks: [0], companion: 'colorize', get help() { return t('settings.colorizeStrength.help'); } },
  { key: 'colorize', default: '#ff00ff', group: 'transform', reset: false },
  { key: 'hue', default: 0, group: 'transform', get label() { return t('settings.hue.label'); }, min: 0, max: 360, unit: '°', get help() { return t('settings.hue.help'); } },
  { key: 'invert', default: 0, group: 'transform', get label() { return t('settings.invert.label'); }, min: 0, max: 100, unit: '%', get help() { return t('settings.invert.help'); } },

  { key: 'brightness', default: 100, group: 'adjust', get label() { return t('settings.brightness.label'); }, min: 0, max: 500, unit: '%', ticks: [100], get help() { return t('settings.brightness.help'); } },
  { key: 'contrast', default: 100, group: 'adjust', get label() { return t('settings.contrast.label'); }, min: 0, max: 500, unit: '%', ticks: [100], get help() { return t('settings.contrast.help'); } },
  { key: 'levelsBlack', default: 0, group: 'adjust', get label() { return t('settings.levelsBlack.label'); }, min: 0, max: 254, ticks: [0], get help() { return t('settings.levelsBlack.help'); } },
  { key: 'levelsWhite', default: 255, group: 'adjust', get label() { return t('settings.levelsWhite.label'); }, min: 1, max: 255, ticks: [255], get help() { return t('settings.levelsWhite.help'); } },
  { key: 'levelsMid', default: 1, group: 'adjust', get label() { return t('settings.levelsMid.label'); }, min: 0.1, max: 3, step: 0.01, decimals: 2, ticks: [1], get help() { return t('settings.levelsMid.help'); } },
  { key: 'saturation', default: 100, group: 'adjust', get label() { return t('settings.saturation.label'); }, min: 0, max: 500, unit: '%', ticks: [100], get help() { return t('settings.saturation.help'); } },
  { key: 'posterize', default: 1, group: 'adjust', get label() { return t('settings.posterize.label'); }, min: 1, max: 32, off: 1, ticks: [1], get help() { return t('settings.posterize.help'); } },
  { key: 'threshold', default: 0, group: 'adjust', get label() { return t('settings.threshold.label'); }, min: 0, max: 255, off: 0, ticks: [0], companion: ['thresholdDark', 'thresholdLight'], get help() { return t('settings.threshold.help'); } },
  { key: 'thresholdDark', default: '#000000', group: 'adjust', get label() { return t('settings.thresholdDark.label'); } },
  { key: 'thresholdLight', default: '#ffffff', group: 'adjust', get label() { return t('settings.thresholdLight.label'); } },

  { key: 'blur', default: 0, group: 'effects', get label() { return t('settings.blur.label'); }, min: 0, max: 10, ticks: [0], get help() { return t('settings.blur.help'); } },
  { key: 'flatten', default: 0, group: 'effects', get label() { return t('settings.flatten.label'); }, min: 0, max: 10, ticks: [0], get help() { return t('settings.flatten.help'); } },
  { key: 'sharpen', default: 0, group: 'effects', get label() { return t('settings.sharpen.label'); }, min: 0, max: 100, ticks: [0], get help() { return t('settings.sharpen.help'); } },
  { key: 'edges', default: 0, group: 'effects', get label() { return t('settings.edges.label'); }, min: 0, max: 20, step: 0.01, decimals: 2, ticks: [0], companion: 'edgeColor', get help() { return t('settings.edges.help'); } },
  { key: 'edgeColor', default: '#000000', group: 'effects' },
  { key: 'edgeThickness', default: 1, group: 'effects', get label() { return t('settings.edgeThickness.label'); }, min: 0, max: 5, step: 0.1, decimals: 1, get help() { return t('settings.edgeThickness.help'); } },

  { key: 'sauceUse9pxFont', default: false, group: 'sauce', storageKey: 'current_file.sauce.use9pxFont' },
  { key: 'sauceFontName', default: 'IBM VGA', group: 'sauce', most: SAUCE_WIDTHS.fontName, storageKey: 'current_file.sauce.fontName' },
  { key: 'sauceTitle', default: '', group: 'sauce', most: SAUCE_WIDTHS.title, storageKey: 'current_file.sauce.title' },
  { key: 'sauceAuthor', default: '', group: 'sauce', most: SAUCE_WIDTHS.author, storageKey: 'current_file.sauce.author' },
  { key: 'sauceGroup', default: '', group: 'sauce', most: SAUCE_WIDTHS.group, storageKey: 'current_file.sauce.group' },
  { key: 'sauceDate', default: '', group: 'sauce', most: SAUCE_WIDTHS.date, storageKey: 'current_file.sauce.date' },
  { key: 'sauceUserComments', default: '', group: 'sauce', most: SAUCE_WIDTHS.comments, storageKey: 'current_file.sauce.userComments' },
];

const BY_KEY = new Map(SETTINGS.map(s => [s.key, s]));
const defaultOf = (s) => (typeof s.default === 'function' ? s.default() : s.default);

// Conversion settings: persisted, saved with projects, and edited in the ControlPanel.
export const SETTING_KEYS = SETTINGS.filter(s => s.group !== 'sauce').map(s => s.key);
export const SAUCE_KEYS = SETTINGS.filter(s => s.group === 'sauce').map(s => s.key);
export const RESET_GROUPS = ['transform', 'adjust', 'effects'];
// The character settings each layer has its own of (the bottom's are these fields themselves): how its paint, its
// picture or its shapes become characters, and how they're dithered. The rest are the whole drawing's, or the picture's.
export const CHAR_KEYS = ['chars', 'charsAscii', 'seed', 'charChoice', 'charChoiceAscii', 'solids', 'patternLight', 'ditherStyle', 'dither'];

// Whether every slider a bake (or Reset All) resets is at its default: nothing to bake. A slider
// can hold its value as a numeric string.
export function slidersAtDefaults(state) {
  return RESET_GROUPS.every(group => Object.entries(groupDefaults(group)).every(([key, value]) =>
    (typeof value === 'number' ? Number(state[key]) === value : state[key] === value)));
}

// A value a setting could hold: its default's kind, a slider within its range (a slider can hold a numeric
// string), a color a hex, text no longer than it could be.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const asNumber = (value) => (typeof value === 'string' && value.trim() ? Number(value) : value);
function goodSetting({ default: usual, min = -Infinity, max = Infinity, most = MOST_TEXT }, value) {
  if (typeof usual === 'boolean') return typeof value === 'boolean';
  if (typeof usual === 'number') return typeof asNumber(value) === 'number' && Number.isFinite(asNumber(value)) && asNumber(value) >= min && asNumber(value) <= max;
  return typeof value === 'string' && value.length <= most && (typeof usual !== 'string' || !HEX_COLOR.test(usual) || HEX_COLOR.test(value));
}

// Settings from another browser, only what a document saves and how its layers sit (null for those of a document
// with no layers yet), or null if any of it is bad: a host is a stranger, and these reach the store, the render and
// local settings. It isn't half applied.
export function settingsFromStranger(values) {
  if (!values || typeof values !== 'object') return null;
  const taken = {};
  for (const setting of SETTINGS) {
    if (!(setting.key in values)) continue;
    if (!goodSetting(setting, values[setting.key])) return null;
    taken[setting.key] = values[setting.key];
  }
  const cols = asNumber(taken.cols ?? 1), rows = asNumber(taken.rows ?? 1);
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > MAX_COLS || rows > maxRowsBeside(cols)) return null;
  const size = Math.max(cols, rows);
  for (const [key, good] of [['paintScale', goodScale], ['baseScale', goodBaseScale]]) {
    if (values[key] === null || values[key] === undefined) continue;
    if (!good(values[key], size)) return null;
    taken[key] = values[key];
  }
  if (values.fit !== null && values.fit !== undefined) {
    if (!goodFit(values.fit)) return null;
    taken.fit = values.fit;
  }
  if (values.imageIsWorkingCopy !== undefined) {
    if (typeof values.imageIsWorkingCopy !== 'boolean') return null;
    taken.imageIsWorkingCopy = values.imageIsWorkingCopy;
  }
  return taken;
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
