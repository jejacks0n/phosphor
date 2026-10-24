/**
 * Character palettes for the Text tool: 12 glyphs each, one per F-key ('' is an empty slot).
 * Built-ins are locked (editing one makes your own copy); yours live in the PaletteStore.
 *
 * Palette = { id, name, glyphs: string[12], builtin? }
 */
import { graphemes, usableChar } from './CharWidth.js';

const SLOTS = 12;

export function normalizeGlyphs(input) {
  const glyphs = typeof input === 'string' ? graphemes(input) : [...input];
  return Array.from({ length: SLOTS }, (_, i) => glyphs[i] ?? '');
}

const builtin = (id, name, glyphs) => Object.freeze({ id, name, glyphs: Object.freeze(normalizeGlyphs(glyphs)), builtin: true });

// Everything but Quadrants is plain CP437, so it saves in .ans.
export const BUILTIN_PALETTES = Object.freeze([
  builtin('shades', 'Shades & blocks', '░▒▓█▀▄▌▐■▬·∙'),
  builtin('single', 'Single lines', '┌┐└┘─│┬┴├┤┼·'),
  builtin('double', 'Double lines', '╔╗╚╝═║╦╩╠╣╬·'),
  builtin('single-double', 'Single → double', '╒╕╘╛═│╤╧╞╡╪·'),
  builtin('double-single', 'Double → single', '╓╖╙╜─║╥╨╟╢╫·'),
  builtin('faces', 'Faces & suits', '☺☻♥♦♣♠•◘○◙♪♫'),
  builtin('arrows', 'Arrows', '↑↓→←↕↔▲▼►◄∟⌂'),
  builtin('greek', 'Greek & maths', 'αßΓπΣσµτΦΘΩδ'),
  builtin('quadrants', 'Quadrants', '▖▗▘▝▚▞▙▛▜▟▀▄'),
]);

// The palette layer's Unicode source: [name, first, last] code points.
export const UNICODE_BLOCKS = Object.freeze([
  ['Box drawing', 0x2500, 0x257F],
  ['Blocks', 0x2580, 0x259F],
  ['Legacy computing', 0x1FB00, 0x1FBCA],
  ['Shapes', 0x25A0, 0x25FF],
  ['Braille', 0x2800, 0x28FF],
  ['Arrows', 0x2190, 0x21FF],
  ['Maths', 0x2200, 0x22FF],
  ['Misc symbols', 0x2600, 0x26FF],
  ['Dingbats', 0x2700, 0x27BF],
  ['Latin-1', 0x00A1, 0x00FF],
  ['Greek', 0x0391, 0x03C9],
  ['Misc technical', 0x2300, 0x23FF],
]);

// The name for your copy of a palette: "<name> (mine)", then "(mine 2)", …
export function forkName(name, existingNames) {
  const taken = new Set(existingNames);
  if (!taken.has(`${name} (mine)`)) return `${name} (mine)`;
  let n = 2;
  while (taken.has(`${name} (mine ${n})`)) n++;
  return `${name} (mine ${n})`;
}

// Whether a character can go in a palette: one a cell can hold (one or two columns wide, as a
// terminal lays it out), assigned and not private use.
export function fitsGrid(char) {
  return usableChar(char) && !/\p{Cn}|\p{Co}/u.test(char);
}

// The find field: a code point (U+2605), part of a Unicode block's name, or pasted characters.
export function parseFind(query) {
  const q = query.trim();
  if (!q) return null;
  if (/^u\+[0-9a-f]{2,6}$/i.test(q)) {
    const code = parseInt(q.slice(2), 16);
    return code <= 0x10ffff ? { kind: 'code', chars: [String.fromCodePoint(code)] } : null;
  }
  // A single character is always itself; a word searches block names.
  const name = q.toLowerCase();
  if (graphemes(q).length > 1 && /^[a-z -]+$/.test(name) && UNICODE_BLOCKS.some(([block]) => block.toLowerCase().includes(name))) {
    return { kind: 'block', query: q };
  }
  return { kind: 'paste', chars: [...new Set(graphemes(q).filter(c => c.trim()))] };
}
