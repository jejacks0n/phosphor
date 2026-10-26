// Constants and small helpers the project store's action groups (this folder) and its getters share.
import { getSetting, SETTINGS, SETTING_KEYS, SAUCE_KEYS, RESET_GROUPS } from '@/store/settings.js';
import { ctx2d } from '@/lib/Canvas.js';

export const DEFAULT_COLS = getSetting('cols').default;
export const DEFAULT_ROWS = getSetting('rows').default;
export const BLANK_CANVAS_SCALE = 10;
export const TYPING_PAUSE_MS = 1000; // a pause this long ends a typing run (one undo step)

// Settings that feed the image pipeline (processParams); the rest only affect editing, saving or export.
export const PIPELINE_KEYS = SETTINGS.filter(s => s.group !== 'sauce' && s.pipeline !== false).map(s => s.key);
export const SAVED_KEYS = [...SETTING_KEYS, ...SAUCE_KEYS];
export const settingsJson = (state) => JSON.stringify(SAVED_KEYS.map(key => state[key]));
// An image's pixels on a canvas of its own.
export const copyOf = (image, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  ctx2d(canvas).drawImage(image, 0, 0);
  return canvas;
};
// A color ({ r, g, b, a }, a in 0..1) laid over another ({ r, g, b }).
export const over = (under, { r, g, b, a }) => ({ r: Math.round(under.r + (r - under.r) * a), g: Math.round(under.g + (g - under.g) * a), b: Math.round(under.b + (b - under.b) * a) });

// The Transforms, Adjustments and Image Filters settings (sliders and their colors): what a slider
// undo step records. Keyboard nudges on one slider this close together are one step.
export const SLIDER_KEYS = SETTINGS.filter(s => RESET_GROUPS.includes(s.group)).map(s => s.key);
export const NUDGE_MS = 1000;

// The rect of grid pixels ({ x, y }[]) as { x, y, w, h }, whole cells (both pixel rows of each).
export function boundsOf(pixels) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { x, y } of pixels) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  y0 &= ~1; // the cell's top pixel row
  y1 |= 1;  // and its bottom one
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
