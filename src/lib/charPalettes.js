/**
 * Character palettes for the Text tool: 12 glyphs each, one per F-key ('' is an empty slot).
 * Built-ins are locked (editing one makes your own copy); yours live in the PaletteStore.
 *
 * Palette = { id, name, glyphs: string[12], builtin? }
 */
import { t } from '@/i18n';
import { graphemes, usableChar } from './CharWidth.js';

const SLOTS = 12;

export function normalizeGlyphs(input) {
  const glyphs = typeof input === 'string' ? graphemes(input) : [...input];
  return Array.from({ length: SLOTS }, (_, i) => glyphs[i] ?? '');
}

function builtin(id, glyphs) {
  const entry = { id, glyphs: Object.freeze(normalizeGlyphs(glyphs)), builtin: true };
  Object.defineProperty(entry, 'name', { get: () => t(`palette.builtins.${id}`), enumerable: true });
  return Object.freeze(entry);
}

// Everything but Quadrants is CP437 (• ◘ ○ ◙ ♪ → ← sit on control bytes, so .ans writes lookalikes).
export const BUILTIN_PALETTES = Object.freeze([
  builtin('shades', '░▒▓█▀▄▌▐■▬·∙'),
  builtin('single', '┌┐└┘─│┬┴├┤┼·'),
  builtin('double', '╔╗╚╝═║╦╩╠╣╬·'),
  builtin('single-double', '╒╕╘╛═│╤╧╞╡╪·'),
  builtin('double-single', '╓╖╙╜─║╥╨╟╢╫·'),
  builtin('faces', '☺☻♥♦♣♠•◘○◙♪♪'.replace(/♪♪$/, '♪♫')),
  builtin('arrows', '↑↓→←↕↔▲▼►◄∟⌂'),
  builtin('greek', 'αßΓπΣσµτΦΘΩδ'),
  builtin('quadrants', '▖▗▘▝▚▞▙▛▜▟▀▄'),
]);

const UNICODE_BLOCK_DEFS = [
  ['boxDrawing', 'Box drawing', 0x2500, 0x257F],
  ['blocks', 'Blocks', 0x2580, 0x259F],
  ['shapes', 'Shapes', 0x25A0, 0x25FF],
  ['braille', 'Braille', 0x2800, 0x28FF],
  ['arrows', 'Arrows', 0x2190, 0x21FF],
  ['math', 'Math', 0x2200, 0x22FF],
  ['miscSymbols', 'Misc symbols', 0x2600, 0x26FF],
  ['dingbats', 'Dingbats', 0x2700, 0x27BF],
  ['latin1', 'Latin-1', 0x00A1, 0x00FF],
  ['greek', 'Greek', 0x0391, 0x03C9],
  ['miscTechnical', 'Misc technical', 0x2300, 0x23FF],
];

// The palette layer's Unicode source: [name, first, last] code points, with [0] reactive to the active locale.
export const UNICODE_BLOCKS = Object.freeze(UNICODE_BLOCK_DEFS.map(([key, , first, last]) => {
  const tuple = [null, first, last];
  Object.defineProperty(tuple, 0, { get: () => t(`palette.blocks.${key}`), enumerable: true });
  return Object.freeze(tuple);
}));

// The name for your copy of a palette: "<name> (mine)", then "(mine 2)", …
export function forkName(name, existingNames) {
  const taken = new Set(existingNames);
  const first = t('palette.forkName', { name });
  if (!taken.has(first)) return first;
  let n = 2;
  while (taken.has(t('palette.forkNameNumbered', { name, n }))) n++;
  return t('palette.forkNameNumbered', { name, n });
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
  // A single character is always itself; a word searches block names (localized or canonical English).
  const name = q.toLowerCase();
  if (graphemes(q).length > 1 && !/\d/.test(name)) {
    const matched = UNICODE_BLOCK_DEFS.some(([key, enName]) =>
      t(`palette.blocks.${key}`).toLowerCase().includes(name) || enName.toLowerCase().includes(name));
    if (matched && (/^[a-z -]+$/.test(name) || UNICODE_BLOCK_DEFS.some(([key]) => t(`palette.blocks.${key}`).toLowerCase().includes(name)))) {
      return { kind: 'block', query: q };
    }
  }
  return { kind: 'paste', chars: [...new Set(graphemes(q).filter(c => c.trim()))] };
}
