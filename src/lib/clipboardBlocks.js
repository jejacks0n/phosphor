/**
 * What a copy puts in the clipboard's HTML slot, and what a paste reads from it: a JSON object in
 * Moebius's block shape ({ columns, rows, data: one cell per character, row by row }), which Moebius
 * pastes with its colors, and Phosphor's own block alongside in a `phosphor` field, which Moebius
 * ignores and another Phosphor tab pastes with everything (cells, paint, base).
 *
 * A Moebius cell is { code, fg, bg, fg_rgb?, bg_rgb?, fg_idx?, bg_idx? }: code a CP437 byte; fg and
 * bg 0 to 15 in the DOS order (1 blue, 4 red, 8 to 15 bright: a bright background is iCE colors,
 * not blink); fg_rgb/bg_rgb ({ r, g, b }) the exact color and fg_idx/bg_idx its xterm 256 number,
 * which Moebius's Advanced Color fork reads (and original Moebius ignores).
 *
 * PhosphorField = { version: 1, id, w, h, cells?: (Entry | null)[], paint?: PNG data URL,
 * base?: { pixels: PNG data URL, scale, colors: PNG data URL, pins: (char | null)[] } }: a Select
 * block (ProjectStore's copySelection) with its canvases as PNGs. id says which copy it was, so the
 * tab that made it can paste its own block instead.
 *
 * ShapesField = { version: 1, id, shapes: Shape[], keys?: string[] } (document/shapes.js), in a `phosphorShapes` field:
 * shapes copied on VECTOR, bottom to top, for another Phosphor tab, and the keys they had there (a follower pasted with
 * its path follows the copy); id as a block's.
 */
import { CP437, cp437Byte, cp437Substitute } from './Cp437.js';
import { CGA, VGA, paletteIndex, rgb2hex } from './ColorUtils.js';
import { MAX_CELLS, cellIndex } from './Cells.js';
import { usableChar } from './CharWidth.js';
import { cleanEntry } from '../document/editCells.js';
import { MOST_SHAPES, isGoodShapeKey, shapeFromStranger } from '../document/shapes.js';

export const VERSION = 1;

// The 16 colors' DOS (Moebius) numbers to Phosphor's ANSI order (CGA, VGA's first 16): blue and red
// trade places, cyan and yellow too. It's its own inverse.
export const DOS_TO_ANSI = [0, 4, 2, 6, 1, 5, 3, 7, 8, 12, 10, 14, 9, 13, 11, 15];

// The CP437 byte for a character: its own, else its .ans lookalike, else '?'.
export const moebiusCode = (char) => cp437Byte(char) ?? cp437Byte(cp437Substitute(char));

const MISSING = { code: 32, fg: 7, bg: 0 };

// What a cell rect shows (project.cells), as Moebius cells. The 16 colors are each color's nearest;
// with the CGA palette they're its own, and nothing more is written. A wide character's lead goes as
// its lookalike and its trail as a space.
export function moebiusData(cells, cols, { c0, r0, c1, r1 }, quantize) {
  const data = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const cell = cells[cellIndex(col, row, cols)];
      if (!cell) {
        data.push({ ...MISSING });
        continue;
      }
      const { fg, bg } = cell;
      const out = {
        code: cell.wide === 'trail' ? 32 : moebiusCode(cell.char),
        fg: DOS_TO_ANSI[paletteIndex(fg.r, fg.g, fg.b, CGA)],
        bg: DOS_TO_ANSI[paletteIndex(bg.r, bg.g, bg.b, CGA)],
      };
      if (quantize !== 'cga') {
        out.fg_rgb = { r: fg.r, g: fg.g, b: fg.b };
        out.bg_rgb = { r: bg.r, g: bg.g, b: bg.b };
        out.fg_idx = paletteIndex(fg.r, fg.g, fg.b, VGA);
        out.bg_idx = paletteIndex(bg.r, bg.g, bg.b, VGA);
      }
      data.push(out);
    }
  }
  return { columns: c1 - c0 + 1, rows: r1 - r0 + 1, data };
}

const byte = (v) => Number.isInteger(v) && v >= 0 && v <= 255;
const isRgb = (v) => !!v && byte(v.r) && byte(v.g) && byte(v.b);

// A Moebius color: rgb, else the xterm number, else the 16 (DOS order), else `fallback` (Moebius's own
// default, 7 on 0).
function moebiusColor(rgb, idx, dos, fallback) {
  if (isRgb(rgb)) return rgb2hex(rgb);
  if (byte(idx)) return VGA[idx].hex.toLowerCase();
  return CGA[DOS_TO_ANSI[Number.isInteger(dos) && dos >= 0 && dos < 16 ? dos : fallback]].hex;
}

// A Moebius block as a Select block of edit cells. As Moebius pastes it: a null cell leaves what's
// there, and so does a space on black (bg 0) when the block is transparent.
export function blockFromMoebius({ columns, rows, data, transparent }) {
  const cells = data.map((cell) => {
    if (cell === null) return null;
    const { code, fg, bg, fg_rgb, bg_rgb, fg_idx, bg_idx } = cell && typeof cell === 'object' ? cell : {};
    if (transparent && code === 32 && bg === 0) return null;
    const char = byte(code) ? CP437[code] : ' ';
    return Object.freeze({ char: usableChar(char) ? char : ' ', fg: moebiusColor(fg_rgb, fg_idx, fg, 7), bg: moebiusColor(bg_rgb, bg_idx, bg, 0) });
  });
  return { w: columns, h: rows, cells };
}

// An object as JSON in plain printable ASCII: everything else, and < > &, as \uXXXX. Browsers write
// the HTML slot as HTML (escaping, a charset), and plain text with no markup comes through any of
// them as it went in; JSON.parse reads it the same.
export function clipboardHtml(object) {
  return JSON.stringify(object).replace(/[^\x20-\x7e]|[<>&]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const size = (v) => Number.isInteger(v) && v > 0;
const isPng = (v) => typeof v === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v);

// A `phosphor` field, with only what a block can hold, or null when it isn't one this version reads.
function phosphorField(p) {
  if (!p || p.version !== VERSION || typeof p.id !== 'string' || !size(p.w) || !size(p.h) || p.w * p.h > MAX_CELLS) return null;
  const n = p.w * p.h, list = (v) => Array.isArray(v) && v.length === n;
  const out = { version: VERSION, id: p.id, w: p.w, h: p.h };
  if (p.cells !== undefined) {
    if (!list(p.cells)) return null;
    out.cells = p.cells.map(cleanEntry);
  }
  if (p.paint !== undefined) {
    if (!isPng(p.paint)) return null;
    out.paint = p.paint;
  }
  if (p.base !== undefined) {
    const { pixels, scale, colors, pins } = p.base ?? {};
    if (!isPng(pixels) || !isPng(colors) || !size(scale) || !list(pins)) return null;
    out.base = { pixels, scale, colors, pins: pins.map((char) => (usableChar(char) ? char : null)) };
  }
  return out;
}

// A `phosphorShapes` field with the shapes that are shapes, and their keys when it has one for each, or null when it
// isn't one this version reads or none of them is.
function shapesField(p) {
  if (!p || p.version !== VERSION || typeof p.id !== 'string' || !Array.isArray(p.shapes) || p.shapes.length > MOST_SHAPES) return null;
  const keyed = Array.isArray(p.keys) && p.keys.length === p.shapes.length && p.keys.every(isGoodShapeKey);
  const pairs = p.shapes.map((shape, i) => [keyed ? p.keys[i] : null, shapeFromStranger(shape)]).filter(([, shape]) => shape);
  if (!pairs.length) return null;
  const out = { version: VERSION, id: p.id, shapes: pairs.map(([, shape]) => shape) };
  if (keyed) out.keys = pairs.map(([key]) => key);
  return out;
}

// What the HTML slot holds: { phosphor: PhosphorField }, { shapes: ShapesField }, { moebius: Block }, or null (empty, a web
// page's HTML, a block this version can't read). Tags and comments are dropped first: browsers add a
// <meta charset> before it, and Windows wraps it in <html><body><!--StartFragment-->.
export function readClipboardHtml(html) {
  const text = (html ?? '').replace(/<!--[\s\S]*?-->|<[^>]*>/g, '').trim();
  if (!text.startsWith('{')) return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const phosphor = phosphorField(json?.phosphor);
  if (phosphor) return { phosphor };
  const shapes = shapesField(json?.phosphorShapes);
  if (shapes) return { shapes };
  const { columns, rows, data } = json ?? {};
  if (!size(columns) || !size(rows) || columns * rows > MAX_CELLS || !Array.isArray(data) || data.length !== columns * rows) return null;
  return { moebius: blockFromMoebius(json) };
}
