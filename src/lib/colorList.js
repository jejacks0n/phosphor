// The Custom color list as a list of colors: lowercase '#rrggbb' strings in order. A color is named by its
// place, not its value, so a color the list holds twice is no trouble. None of these changes the list given.
import { parseColorList } from './ColorUtils.js';

export const MOST_COLORS = 256;

// Every color in a typed list (or a .hex file), lowercase; what isn't a color is left out.
export const listColors = (text) => parseColorList(text).map(p => p.hex.toLowerCase());

// The `palette` setting's text for a list: single spaces between.
export const writeList = (colors) => colors.join(' ');

// At most MOST_COLORS of the list, and how many there were when some were cut (null when none were).
export function firstColors(colors) {
  return colors.length > MOST_COLORS
    ? { colors: colors.slice(0, MOST_COLORS), of: colors.length }
    : { colors, of: null };
}

export const withColor = (colors, index, hex) => colors.map((c, i) => (i === index ? hex.toLowerCase() : c));

// A copy of the color at `index` added to the end; null when the list is full.
export const withCopy = (colors, index) => (colors.length >= MOST_COLORS ? null : [...colors, colors[index]]);

// The list without the color at `index`; null when it's the last one, as a list keeps at least one.
export const without = (colors, index) => (colors.length <= 1 ? null : colors.filter((_, i) => i !== index));

// The color at `from` put at `to`, which is held inside the list.
export function moved(colors, from, to) {
  const rest = colors.filter((_, i) => i !== from);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, colors[from]);
  return rest;
}

export const sameColors = (a, b) => a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());

// Lospec's .hex file: six digits a line, no #.
export const hexFile = (colors) => colors.map(c => `${c.slice(1)}\n`).join('');
