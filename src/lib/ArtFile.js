/**
 * Reads a text-art file (.ans, .utf8ans, .asc, .txt) into cells, the way a terminal would show it:
 * a cursor, wrapping at the file's width, and the escape sequences art files use (cursor moves,
 * clear, erase and colors). Nothing here touches the store; the caller decides what to do with the
 * cells.
 */
import { CP437 } from './Cp437.js';
import { cellWidth, graphemes } from './CharWidth.js';
import { PALETTES } from './ColorUtils.js';
import { MAX_CELLS, MAX_COLS, MAX_LINES } from './Cells.js';
import { artEndOf, readSauce } from './Sauce.js';

export const ART_EXTENSIONS = ['ans', 'utf8ans', 'asc', 'txt'];

const extensionOf = (name) => /\.([^./\\]+)$/.exec(name ?? '')?.[1].toLowerCase() ?? '';
export const isArtFile = (name) => ART_EXTENSIONS.includes(extensionOf(name));

const fail = (userMessage) => { throw Object.assign(new Error(userMessage), { userMessage }); };

const CGA = PALETTES.cga.map((c) => c.hex.toLowerCase());
const VGA = PALETTES.vga.map((c) => c.hex.toLowerCase());
const hex2 = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
const DEFAULT_FG = CGA[7], DEFAULT_BG = CGA[0];

// Bytes below 0x20 that are controls; every other byte shows as its CP437 glyph.
const CONTROLS = new Set([7, 8, 9, 10, 13, 26, 27]);

// The text as one string per character: UTF-8 when the file is (a .utf8ans always, another kind when
// it's valid UTF-8 with a multi-byte sequence), else CP437 a byte at a time.
function decode(bytes, name) {
  const utf8 = extensionOf(name) === 'utf8ans';
  let text = null;
  try {
    text = new TextDecoder('utf-8', { fatal: !utf8 }).decode(bytes);
    if (!utf8 && !bytes.some((byte) => byte >= 0x80)) text = null; // valid UTF-8 with a high byte has a multi-byte sequence (a BOM is one)
  } catch { /* not UTF-8 */ }
  if (text !== null) return { items: graphemes(text), cp437: false };
  return { items: Array.from(bytes, (byte) => (CONTROLS.has(byte) ? String.fromCharCode(byte) : CP437[byte])), cp437: true };
}

export function readArtFile(bytes, name) {
  const sauce = readSauce(bytes);
  const { items, cp437 } = decode(bytes.subarray(0, artEndOf(bytes)), name);
  const fixed = sauce && sauce.dataType === 1 && sauce.width > 0 ? sauce.width : extensionOf(name) === 'ans' ? 80 : 0; // 0: no wrapping

  const lines = new Map(); // row -> sparse array of cells
  let widest = 0; // the widest line reached, used when there's no fixed width
  let maxRow = -1; // the last line a character or erase reached
  let wrote = false, deep = false, over = false;
  let col = 0, row = 0, pending = false, saved = [0, 0];
  let bold = false, blink = false, inverse = false, fg = { i: 7 }, bg = { i: 0 };
  let pen = null; // fg and bg as a cell gets them; cleared when the colors change

  const colsNow = () => fixed || widest;
  const tooBig = () => colsNow() > MAX_COLS || maxRow + 1 > MAX_LINES || colsNow() * (maxRow + 1) > MAX_CELLS;
  const failTooBig = () => fail(`This file is ${colsNow()} × ${maxRow + 1}. Phosphor opens at most ${MAX_COLS} columns, ${MAX_LINES.toLocaleString('en-US')} lines and ${MAX_CELLS.toLocaleString('en-US')} cells.`);
  // A file with no width stops at the first limit it passes. One with a width is read to the end for its true size, but stops keeping cells.
  const checkSize = () => {
    if (!tooBig()) return;
    if (!fixed) failTooBig();
    over = true;
  };

  const colors = () => {
    if (pen) return pen;
    const f = fg.hex ? fg : { hex: CGA[bold && fg.i < 8 ? fg.i + 8 : fg.i], deep: false };
    const b = bg.hex ? bg : { hex: CGA[blink && bg.i < 8 ? bg.i + 8 : bg.i], deep: false };
    pen = inverse ? { fg: b.hex, bg: f.hex, deep: !!(f.deep || b.deep) } : { fg: f.hex, bg: b.hex, deep: !!(f.deep || b.deep) };
    return pen;
  };

  const setCell = (c, char, trail = false) => {
    if (over) return;
    const { fg: f, bg: b, deep: d } = colors();
    let line = lines.get(row);
    if (!line) lines.set(row, line = []);
    if (!trail && c > 0 && line[c - 1] && cellWidth(line[c - 1].char) === 2) line[c - 1] = { ...line[c - 1], char: ' ' }; // its trail is gone
    line[c] = { char, fg: f, bg: b };
    if (d) deep = true;
  };

  const put = (char, width) => {
    if (fixed && (pending || (col + width > fixed && col > 0))) { col = 0; row++; }
    pending = false;
    setCell(col, char);
    if (width === 2 && (!fixed || col + 1 < fixed)) setCell(col + 1, ' ', true); // the trail
    wrote = true;
    maxRow = Math.max(maxRow, row);
    widest = Math.max(widest, col + width);
    checkSize();
    col += width;
    if (fixed && col >= fixed) { col = fixed - 1; pending = true; }
  };

  // ESC[K: the cursor to the end of the line; ESC[1K: the start through the cursor; ESC[2K: the whole line.
  const erase = (mode) => {
    const from = mode === 1 || mode === 2 ? 0 : col;
    const to = mode === 1 ? col + 1 : fixed || widest;
    if (!over) for (let c = from; c < to; c++) setCell(c, ' '); // past the limits nothing is kept, so skip the walk
    wrote = true;
    maxRow = Math.max(maxRow, row);
    checkSize();
  };

  const clampCol = (c) => Math.max(0, fixed ? Math.min(fixed - 1, c) : c);

  const sgr = (params) => {
    pen = null;
    for (let k = 0; k < params.length; k++) {
      const p = params[k];
      if (p === 0) { bold = blink = inverse = false; fg = { i: 7 }; bg = { i: 0 }; }
      else if (p === 1) bold = true;
      else if (p === 22) bold = false;
      else if (p === 5 || p === 6) blink = true;
      else if (p === 25) blink = false;
      else if (p === 7) inverse = true;
      else if (p === 27) inverse = false;
      else if (p >= 30 && p <= 37) fg = { i: p - 30 };
      else if (p === 39) fg = { i: 7 };
      else if (p >= 40 && p <= 47) bg = { i: p - 40 };
      else if (p === 49) bg = { i: 0 };
      else if (p >= 90 && p <= 97) fg = { hex: CGA[p - 82] };
      else if (p >= 100 && p <= 107) bg = { hex: CGA[p - 92] };
      else if (p === 38 || p === 48) {
        let color = null;
        if (params[k + 1] === 5) {
          const n = params[k + 2];
          if (n >= 0 && n < 256) color = { hex: VGA[n], deep: n >= 16 };
          k += 2;
        } else if (params[k + 1] === 2) {
          const [r, g, b] = params.slice(k + 2, k + 5);
          if (b !== undefined) color = { hex: '#' + hex2(r) + hex2(g) + hex2(b), deep: true };
          k += 4;
        }
        if (color) { if (p === 38) fg = color; else bg = color; }
      }
    }
  };

  const csi = (params, final) => {
    const n = (params[0] || 1);
    switch (final) {
      case 'A': row = Math.max(0, row - n); pending = false; break;
      case 'B': row += n; pending = false; break;
      case 'C': col = clampCol(col + n); pending = false; break;
      case 'D': col = clampCol(col - n); pending = false; break;
      case 'H': case 'f': row = (params[0] || 1) - 1; col = clampCol((params[1] || 1) - 1); pending = false; break;
      case 's': saved = [col, row]; break;
      case 'u': [col, row] = saved; pending = false; break;
      case 'J':
        if (params[0] === 2) { lines.clear(); maxRow = -1; widest = 0; wrote = deep = over = false; col = row = 0; pending = false; }
        break;
      case 'K': erase(params[0]); break;
      case 'm': sgr(params.length ? params : [0]); break;
    }
  };

  const single = (item) => (item.length === 1 ? item.charCodeAt(0) : -1);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const code = single(item);
    if (code === 27) {
      if (items[i + 1] !== '[') { i++; continue; } // ESC x
      let j = i + 2, text = '';
      while (j < items.length && single(items[j]) >= 0x20 && single(items[j]) <= 0x3f) text += items[j++];
      const final = single(items[j] ?? '');
      if (final < 0x40 || final > 0x7e) { i = j - 1; continue; } // not a sequence after all
      if (!/^[?=<>]/.test(text)) csi(text === '' ? [] : text.split(';').map((s) => parseInt(s, 10) || 0), items[j]);
      i = j;
    } else if (code === 26) break;
    else if (code === 13 || item === '\r\n') { col = 0; pending = false; if (item === '\r\n') { row++; } }
    else if (code === 10) { col = 0; row++; pending = false; }
    else if (code === 9) { col = clampCol((col & ~7) + 8); pending = false; }
    else if (code === 8) { col = Math.max(0, col - 1); pending = false; }
    else if (code === 7) continue;
    else {
      const width = cp437 ? 1 : cellWidth(item);
      if (width) put(item, width);
    }
  }

  const cols = colsNow(), rows = maxRow + 1;
  if (!wrote || !cols) fail("There's no art in this file.");
  if (tooBig()) failTooBig();

  const cells = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const line = lines.get(r);
    for (let c = 0; c < cols; c++) cells[r * cols + c] = line?.[c] ?? { char: ' ', fg: DEFAULT_FG, bg: DEFAULT_BG };
  }
  return { cols, rows, cells, sauce, palette: deep ? 'none' : 'cga' };
}
