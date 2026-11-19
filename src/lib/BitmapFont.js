// An 8xN bitmap font as data: 256 glyphs of `height` bytes each, one bit per pixel, the leftmost
// pixel in the high bit. Each slot is held in a cell as one character (SLOT_CHARS).
import { CP437, cp437Substitute } from './Cp437.js';
import { graphemes } from './CharWidth.js';
import { t } from '@/i18n';

export const MAX_FONT_HEIGHT = 32;

// CP437[i], except slot 0 (CP437 shows it as a space, which slot 32 already is).
export const SLOT_CHARS = Object.freeze([...CP437].map((c, i) => (i === 0 ? '␀' : c)));
const SLOTS = new Map(SLOT_CHARS.map((c, i) => [c, i]));

export const slotOf = (char) => SLOTS.get(char.normalize('NFC')) ?? null;
export const fitFont = (char) => (slotOf(char) !== null ? char : cp437Substitute(char));

export function fontChars(chars) {
  const seen = new Set();
  for (const g of graphemes(chars)) seen.add(fitFont(g));
  return [...seen].join('');
}

export function fitCells(cells) {
  let out = cells;
  cells.forEach((cell, i) => {
    if (!cell) return; // a hole in the grid, as layoutWide allows
    const char = fitFont(cell.char);
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

export const glyphRows = (font, slot) => font.bytes.subarray(slot * font.height, (slot + 1) * font.height);

const lit = (rows, x, y) => (rows[y] >> (7 - x)) & 1;

// The box-averaged ink fraction over an sw x sh grid, row-major; boxes that cut pixels weigh by area.
export function maskOf(font, slot, sw, sh) {
  const rows = glyphRows(font, slot);
  const out = new Float32Array(sw * sh);
  const bw = 8 / sw;
  const bh = font.height / sh;
  for (let gy = 0; gy < sh; gy++) {
    for (let gx = 0; gx < sw; gx++) {
      let sum = 0;
      for (let y = Math.floor(gy * bh); y < Math.min(font.height, Math.ceil((gy + 1) * bh)); y++) {
        const oy = Math.min(y + 1, (gy + 1) * bh) - Math.max(y, gy * bh);
        if (oy <= 0) continue;
        for (let x = Math.floor(gx * bw); x < Math.min(8, Math.ceil((gx + 1) * bw)); x++) {
          const ox = Math.min(x + 1, (gx + 1) * bw) - Math.max(x, gx * bw);
          if (ox > 0 && lit(rows, x, y)) sum += ox * oy;
        }
      }
      out[gy * sw + gx] = sum / (bw * bh);
    }
  }
  return out;
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

export function fontId(font) {
  let h = 0x811c9dc5;
  for (const b of [font.height, ...font.bytes]) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return `bitmap-${h.toString(16).padStart(8, '0')}`;
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
