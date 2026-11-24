// XBin files (16colo.rs, ansilove, Moebius): a header, an optional palette and 8×N font, then the cells,
// optionally run-length compressed. A cell is a character byte (a slot of the file's font) and an attribute.
// BinaryText (.bin) is the cells alone, uncompressed, in CP437 and the 16 colors.
import { CP437 } from './Cp437.js';
import { fitFont, fontId, fontName, slotChars, slotOf } from './BitmapFont.js';
import { MAX_CELLS, MAX_COLS, MAX_LINES } from './Cells.js';
import { linkedFontOf } from './linkedFonts.js';
import { PALETTES, nearestIndex } from './ColorUtils.js';
import { Sauce, readSauce } from './Sauce.js';
import { t } from '@/i18n';
import { formatNumber } from '@/i18n/format';

const MAGIC = [88, 66, 73, 78, 0x1a]; // XBIN, EOF
const PALETTE = 1, FONT = 2, COMPRESS = 4, NON_BLINK = 8, CHARS512 = 16;
// XBin's colors are in DOS order (1 is blue); the editor's CGA list is in ANSI order (1 is red).
export const ANSI_OF_DOS = [0, 4, 2, 6, 1, 5, 3, 7, 8, 12, 10, 14, 9, 13, 11, 15];

const fail = (userMessage) => { throw Object.assign(new Error(userMessage), { userMessage }); };
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

export const isXBin = (bytes) => MAGIC.every((b, i) => bytes[i] === b);

// The data stops where the record or its comments start; a 0x1A is no end here (it's a character byte like any other,
// an XBin's header has one, and a font's bytes may).
const dataOf = (bytes, sauce) => bytes.subarray(0, sauce ? bytes.length - 128 - (sauce.comments.length ? 5 + 64 * sauce.comments.length : 0) : bytes.length);
const checkSize = (cols, rows) => {
  if (cols > MAX_COLS || rows > MAX_LINES || cols * rows > MAX_CELLS) {
    fail(t('document.artTooBig', { cols, rows, maxCols: MAX_COLS, maxLines: formatNumber(MAX_LINES), maxCells: formatNumber(MAX_CELLS) }));
  }
};

// A cell from its character byte and attribute: the foreground the low four bits, the background the high four. Without
// iCE colors the top bit is blink, kept as the bright background it stands for (as an .ans's SGR 5 is), and the file
// says so (iceColors), for the drawing to show it blinking and write it back the same. indexes: the colors are the 16,
// so each keeps its ANSI index.
const cellsOf = (chars, attrs, palette, indexes, table = CP437) => chars.map((byte, n) => {
  const fgIndex = attrs[n] & 15, bgIndex = attrs[n] >> 4;
  return {
    char: table[byte], fg: palette[fgIndex], bg: palette[bgIndex],
    ...(indexes && { fgIndex: ANSI_OF_DOS[fgIndex], bgIndex: ANSI_OF_DOS[bgIndex] }),
  };
});
const DOS_CGA = ANSI_OF_DOS.map((i) => PALETTES.cga[i].hex);

// knownBlocks(fontId): the blocks saved for a font, if any; else they're found from its pixels.
export function readXBin(bytes, name, knownBlocks = () => undefined) {
  const sauce = readSauce(bytes);
  const data = dataOf(bytes, sauce);
  const broken = () => fail(t('document.xbinBroken', { name }));
  if (data.length < 11 || !isXBin(data)) broken();
  const cols = data[5] | (data[6] << 8), rows = data[7] | (data[8] << 8), size = data[9], flags = data[10];
  if (!cols || !rows) broken();
  checkSize(cols, rows);
  if (flags & CHARS512) fail(t('document.xbin512', { name }));

  let at = 11;
  let palette = DOS_CGA;
  if (flags & PALETTE) {
    if (data.length < at + 48) broken();
    palette = Array.from({ length: 16 }, (_, i) => hex(...[0, 1, 2].map((k) => {
      const v = data[at + i * 3 + k] & 63;
      return (v << 2) | (v >> 4);
    })));
    at += 48;
  }
  let font = null;
  if (flags & FONT) {
    if (!size || size > 32 || data.length < at + size * 256) broken();
    const bytes = data.slice(at, at + size * 256);
    font = { name: linkedFontOf(fontId({ height: size, bytes }))?.name ?? fontName(name), height: size, bytes }; // named for the file, or a linked font's own name
    at += size * 256;
  }

  const total = cols * rows, chars = new Array(total), attrs = new Array(total);
  if (flags & COMPRESS) {
    let n = 0;
    while (n < total) {
      if (at >= data.length) broken();
      const type = data[at] >> 6, count = (data[at++] & 63) + 1;
      if (n + count > total) broken();
      const need = [count * 2, 1 + count, 1 + count, 2][type];
      if (data.length < at + need) broken();
      let c = data[at], a = data[at + 1]; // for the types that repeat one of them
      if (type === 1) a = null;
      if (type === 2) { a = data[at]; c = null; }
      for (let k = 0; k < count; k++, n++) {
        if (type === 0) { chars[n] = data[at + k * 2]; attrs[n] = data[at + k * 2 + 1]; }
        else if (type === 1) { chars[n] = c; attrs[n] = data[at + 1 + k]; }
        else if (type === 2) { chars[n] = data[at + 1 + k]; attrs[n] = a; }
        else { chars[n] = c; attrs[n] = a; }
      }
      at += need;
    }
  } else {
    if (data.length < at + total * 2) broken();
    for (let n = 0; n < total; n++) { chars[n] = data[at + n * 2]; attrs[n] = data[at + n * 2 + 1]; }
  }

  const blocks = font && knownBlocks(fontId(font));
  if (blocks) font = { ...font, blocks };
  const table = font ? slotChars(font) : CP437; // a font's slots, its blocks where it keeps them
  const cells = cellsOf(chars, attrs, palette, !(flags & PALETTE), table);
  return { cols, rows, cells, sauce, palette, font, xbin: true, notUtf8: false, iceColors: (flags & NON_BLINK) !== 0 };
}

// A .bin is BinaryText only by its SAUCE record (data type 5, the width in its file type, halved; 0 is 160). With no
// record it's taken for one 160 columns wide, the width BinaryText has with none, only when its data is whole rows of
// that, as a screen saved whole is (said with binNoSauce, iCE colors off); any other .bin is some other kind of file,
// and so is one whose record is another type's. The rows run to the end of the data, a last row cut short filled with
// spaces. The record's own size fields mean nothing here, so the grid's size takes their place, for an export to write.
const BIN_COLS = 160, BLANK = 0x07;
export function readBinaryText(bytes, name) {
  const found = readSauce(bytes);
  const notBin = () => fail(t('document.notBinaryText', { name }));
  if (found && found.dataType !== 5) notBin();
  const data = dataOf(bytes, found);
  const cols = found?.fileType ? found.fileType * 2 : BIN_COLS, total = data.length >> 1; // an odd last byte (an EOF) is no cell
  if (!found && (!total || total % BIN_COLS)) notBin();
  if (!total) fail(t('document.artEmpty'));
  const rows = Math.ceil(total / cols);
  checkSize(cols, rows);
  const chars = new Uint8Array(cols * rows).fill(32), attrs = new Uint8Array(cols * rows).fill(BLANK);
  for (let n = 0; n < total; n++) { chars[n] = data[n * 2]; attrs[n] = data[n * 2 + 1]; }
  const cells = cellsOf(Array.from(chars), attrs, DOS_CGA, true);
  const sauce = found && { ...found, width: cols, height: rows };
  return { cols, rows, cells, sauce, palette: DOS_CGA, font: null, xbin: false, notUtf8: false, binNoSauce: !found, iceColors: !!found?.iceColors };
}

// One row's cells as runs: at each cell the longest of both-same (3), char-same (1), attr-same (2), else a plain run (0).
function compressRow(out, chars, attrs) {
  const end = chars.length;
  const same = (i, key) => {
    let n = 1;
    while (i + n < end && n < 64 && key(i + n) === key(i)) n++;
    return n;
  };
  const sameChar = (i) => chars[i], sameAttr = (i) => attrs[i], sameBoth = (i) => chars[i] * 256 + attrs[i];
  for (let i = 0; i < end;) {
    const runs = [[3, same(i, sameBoth)], [1, same(i, sameChar)], [2, same(i, sameAttr)]];
    const [type, n] = runs.reduce((best, run) => (run[1] > best[1] ? run : best));
    if (n >= 2) {
      out.push((type << 6) | (n - 1));
      if (type === 3) out.push(chars[i], attrs[i]);
      else if (type === 1) { out.push(chars[i]); for (let k = 0; k < n; k++) out.push(attrs[i + k]); }
      else { out.push(attrs[i]); for (let k = 0; k < n; k++) out.push(chars[i + k]); }
      i += n;
      continue;
    }
    let j = i + 1; // a plain run goes on until a run of two or more begins
    while (j < end && j - i < 64 && !(j + 1 < end && (chars[j] === chars[j + 1] || attrs[j] === attrs[j + 1]))) j++;
    out.push(j - i - 1);
    for (let k = i; k < j; k++) out.push(chars[k], attrs[k]);
    i = j;
  }
}

// palette is in XBin's order, DOS: index 1 is blue (PALETTES.cga is in ANSI order, where 1 is red). font is an {name, height, bytes}.
// iceColors false leaves NON_BLINK off: a background of 8 to 15 is then the blink bit, as the drawing showed it.
export function writeXBin({ cols, rows, cells, palette, font, sauce, iceColors = true }) {
  const hexes = Array.from({ length: 16 }, (_, i) => palette[i] ?? '#000000');
  const colors = hexes.map((h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }));
  const out = [...MAGIC, cols & 255, cols >> 8, rows & 255, rows >> 8, font.height, PALETTE | FONT | COMPRESS | (iceColors ? NON_BLINK : 0)];
  for (const { r, g, b } of colors) out.push(r >> 2, g >> 2, b >> 2); // 6 bits a channel
  out.push(...font.bytes);
  for (let y = 0; y < rows; y++) {
    const row = cells.slice(y * cols, (y + 1) * cols);
    // a cell whose colors match is invisible, so it goes out as a space (a space is in every font's slot 32)
    const pairs = row.map((c) => [nearestIndex(c.fg.r, c.fg.g, c.fg.b, colors), nearestIndex(c.bg.r, c.bg.g, c.bg.b, colors)]);
    compressRow(
      out,
      row.map((c, x) => slotOf(pairs[x][0] === pairs[x][1] ? ' ' : fitFont(c.char, font), font)),
      pairs.map(([fg, bg]) => fg | (bg << 4)),
    );
  }
  const bytes = Uint8Array.from(out);
  if (sauce === false) return bytes;
  // XBin's record names no font (TInfoS empty): the font is in the file.
  return new Sauce({ cols, rows }, { ...sauce, dataType: 6, fileType: 0, flags: 0, width: 0, height: 0, fontName: '', fileSize: bytes.length }).appendTo(bytes);
}
