// An 8xN bitmap font as data: 256 glyphs of `height` bytes each, one bit per pixel, the leftmost
// pixel in the high bit. Each slot is held in a cell as one character (SLOT_CHARS).
import { CP437, cp437Substitute } from './Cp437.js';
import { graphemes } from './CharWidth.js';
import { t } from '@/i18n';
import { BLOCKS, CP437_BLOCKS, findBlocks, fontId, glyphRows, lit, maskOf } from './BitmapGlyphs.js';

export { BLOCKS, CP437_BLOCKS, findBlocks, fontId, glyphRows, maskOf };

export const MAX_FONT_HEIGHT = 32;

// A half cell's height over its width (8): 1 with no bitmap font or an 8x16 one, 0.5 in 8x8.
export const pixelAspectOf = (font) => (font?.height ?? 16) / 16;

// CP437[i], except slot 0 (CP437 shows it as a space, which slot 32 already is).
export const SLOT_CHARS = Object.freeze([...CP437].map((c, i) => (i === 0 ? '␀' : c)));
const SLOTS = new Map(SLOT_CHARS.map((c, i) => [c, i]));

const BLOCK_CHARS = new Set(BLOCKS.map((b) => b.char));

const memo = (make) => {
  const cache = new WeakMap();
  return (font) => {
    if (!cache.has(font)) cache.set(font, make(font));
    return cache.get(font);
  };
};

export const blocksOf = memo((font) => font.blocks ?? findBlocks(font));

// The character each slot is held as: the block characters at their font's slots, and the characters
// those slots displaced in the slots left over. A slot several blocks share is held as the block whose
// CP437 home it is, else the first of them in BLOCKS order.
export const slotChars = (font) => (font ? fontSlotChars(font) : SLOT_CHARS);
const fontSlotChars = memo((font) => {
  const chars = new Array(256);
  const displaced = [];
  blocksOf(font).forEach((s, i) => {
    if (s === null || (chars[s] && BLOCKS[i].slot !== s)) return;
    if (!chars[s] && !BLOCK_CHARS.has(SLOT_CHARS[s])) displaced.push(SLOT_CHARS[s]);
    chars[s] = BLOCKS[i].char;
  });
  displaced.sort((a, b) => SLOT_CHARS.indexOf(a) - SLOT_CHARS.indexOf(b));
  for (let i = 0; i < 256; i++) if (!chars[i] && !BLOCK_CHARS.has(SLOT_CHARS[i])) chars[i] = SLOT_CHARS[i];
  for (let i = 0; i < 256; i++) if (!chars[i]) chars[i] = displaced.shift() ?? String.fromCodePoint(0xE000 + i);
  return chars;
});

// Each slot's own character, and every block character at its slot (a shared slot's others too).
export const slotsOf = memo((font) => {
  const slots = new Map(slotChars(font).map((c, i) => [c, i]));
  blocksOf(font).forEach((s, i) => s !== null && slots.set(BLOCKS[i].char, s));
  return slots;
});

export const slotOf = (char, font = null) => (font ? slotsOf(font) : SLOTS).get(char.normalize('NFC')) ?? null;
// Whether the font has a slot for each of the ten quadrant characters (no font, a display font, does).
export const hasQuadrants = (font = null) => !font || [...'▘▝▖▗▚▞▛▜▙▟'].every((c) => slotOf(c, font) !== null);
export const fitFont = (char, font = null) => {
  if (slotOf(char, font) !== null) return char;
  const near = cp437Substitute(char);
  return slotOf(near, font) !== null ? near : ' ';
};

export function fontChars(chars, font = null) {
  const seen = new Set();
  for (const g of graphemes(chars)) seen.add(fitFont(g, font));
  return [...seen].join('');
}

export function fitCells(cells, font = null) {
  let out = cells;
  cells.forEach((cell, i) => {
    if (!cell) return; // a hole in the grid, as layoutWide allows
    const char = fitFont(cell.char, font);
    if (char === cell.char) return;
    if (out === cells) out = cells.slice();
    out[i] = { ...cell, char };
  });
  return out;
}

const notBitmap = (name) => {
  const userMessage = t('font.errors.notBitmap', { name });
  return Object.assign(new Error(userMessage), { userMessage });
};

const heightOk = (h) => Number.isInteger(h) && h >= 1 && h <= MAX_FONT_HEIGHT;

// A font's name from the file it came in: less a .F##, .png or .xb at its end (once: 'a.F16.png' is 'a.F16').
export const fontName = (fileName) => fileName.replace(/\.(f\d\d|png|xb)$/i, '');

export function parseRawFont(bytes, name) {
  const height = bytes.length / 256;
  if (!heightOk(height)) throw notBitmap(name);
  return { name, height, bytes: Uint8Array.from(bytes) };
}

// The fraction of the top and the bottom half lit; an odd height's middle row counts half to each.
export function inkOf(font, slot) {
  const rows = glyphRows(font, slot);
  const half = font.height / 2;
  let top = 0;
  let bottom = 0;
  for (let y = 0; y < font.height; y++) {
    const n = (rows[y].toString(2).split('1').length - 1) / 8;
    const inTop = Math.max(0, Math.min(y + 1, half) - y);
    top += n * inTop;
    bottom += n * (1 - inTop);
  }
  return [top / half, bottom / half];
}

// A font's id, and its blocks too once they aren't where CP437 puts them.
export function fontKey(font) {
  const blocks = blocksOf(font);
  return blocks.every((s, i) => s === CP437_BLOCKS[i]) ? fontId(font) : `${fontId(font)}-${blocks.map((s) => s ?? 'x').join('.')}`;
}

export const encodeBlocks = (blocks) => blocks.map((s) => s ?? 'x').join('.');

export function decodeBlocks(text) {
  if (typeof text !== 'string') return undefined;
  const parts = text.split('.');
  if (parts.length !== BLOCKS.length) return undefined;
  const blocks = parts.map((p) => (p === 'x' ? null : /^\d{1,3}$/.test(p) && +p < 256 ? +p : undefined));
  return blocks.includes(undefined) ? undefined : blocks;
}

// A copy of blocks with this block at slot (or none); another block there shares it.
export function withBlock(blocks, key, slot) {
  const at = BLOCKS.findIndex((b) => b.key === key);
  return blocks.map((s, i) => (i === at ? slot : s));
}

export const encodeFont = (font) => btoa(String.fromCharCode(...font.bytes));

export function decodeFont(text, name) {
  try {
    const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
    return heightOk(bytes.length / 256) ? { name, height: bytes.length / 256, bytes } : null;
  } catch {
    return null;
  }
}

export function parseFontSheet(image, name) {
  const { width, height, data } = image;
  const gh = height / 16;
  if (width !== 128 || !heightOk(gh)) throw notBitmap(name);
  const bytes = new Uint8Array(256 * gh);
  for (let slot = 0; slot < 256; slot++) {
    for (let r = 0; r < gh; r++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        const i = ((Math.floor(slot / 16) * gh + r) * 128 + (slot % 16) * 8 + x) * 4;
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (data[i + 3] > 127 && luma > 127) byte |= 0x80 >> x;
      }
      bytes[slot * gh + r] = byte;
    }
  }
  return { name, height: gh, bytes };
}

export function fontSheet(font) {
  const height = 16 * font.height;
  const data = new Uint8ClampedArray(128 * height * 4);
  for (let slot = 0; slot < 256; slot++) {
    const rows = glyphRows(font, slot);
    for (let r = 0; r < font.height; r++) {
      for (let x = 0; x < 8; x++) {
        const i = ((Math.floor(slot / 16) * font.height + r) * 128 + (slot % 16) * 8 + x) * 4;
        data.fill(lit(rows, x, r) ? 255 : 0, i, i + 3);
        data[i + 3] = 255;
      }
    }
  }
  return { width: 128, height, data };
}
