// A headless terminal for the exports: play a .ans, .utf8ans or .cast in it and read the screen it ends
// with, to compare with the cells the app shows.
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
import { CP437 } from '../../src/lib/Cp437.js';
import { PALETTES } from '../../src/lib/ColorUtils.js';
import { artEndOf } from '../../src/lib/Sauce.js';

const { Terminal } = xterm;
const { Unicode11Addon } = unicode11;
const VGA = PALETTES.vga.map((color) => color.hex.toLowerCase());
const hex2 = (n) => n.toString(16).padStart(2, '0');

// Bytes below 0x20 the terminal acts on; every other byte is its CP437 glyph (as the app's reader has it).
const CONTROLS = new Set([7, 8, 9, 10, 13, 26, 27]);
const textOf = (bytes, encoding) => {
  const art = bytes.subarray(0, artEndOf(bytes));
  if (encoding === 'utf8') return new TextDecoder().decode(art);
  if (encoding === 'cp437') return Array.from(art, (byte) => (CONTROLS.has(byte) ? String.fromCharCode(byte) : CP437[byte])).join('');
  throw new Error(`encoding must be "cp437" or "utf8", not "${encoding}"`);
};

// A color as lowercase hex. Assumes the app writer's way of saying a bright color in CGA .ans: a bright
// foreground is bold (1) over color 0 to 7, and a bright background is blink (5) over color 0 to 7, which
// SAUCE's iCE flag (and ESC[?33h) says to show bright. So any palette color under 8 is brightened when the
// cell is bold (a foreground) or blinking (a background), whichever way it was written, 30 to 37 or 38;5;n;
// a palette color of 8 or more, the default colors and RGB are read as they stand.
const colorOf = ({ isDefault, isPalette, isRGB, value }, defaultIndex, bright) => {
  if (isRGB) return `#${hex2(value >> 16 & 255)}${hex2(value >> 8 & 255)}${hex2(value & 255)}`;
  if (isDefault) return VGA[bright ? defaultIndex + 8 : defaultIndex]; // a bare bold or blink brightens the default, as the app reads it
  return VGA[isPalette && value < 8 && bright ? value + 8 : value];
};

async function screenOf(chunks, cols, rows) {
  const terminal = new Terminal({ cols, rows, scrollback: 0, allowProposedApi: true });
  terminal.loadAddon(new Unicode11Addon());
  terminal.unicode.activeVersion = '11';
  try {
    for (const chunk of chunks) terminal.write(chunk);
    await new Promise((done) => terminal.write('', done));
    const buffer = terminal.buffer.active, cells = [];
    for (let row = 0; row < rows; row++) {
      const line = buffer.getLine(row);
      for (let col = 0; col < cols; col++) {
        const c = line.getCell(col);
        cells.push({
          char: c.getChars() || ' ',
          fg: colorOf({ isDefault: c.isFgDefault(), isPalette: c.isFgPalette(), isRGB: c.isFgRGB(), value: c.getFgColor() }, 7, c.isBold()),
          bg: colorOf({ isDefault: c.isBgDefault(), isPalette: c.isBgPalette(), isRGB: c.isBgRGB(), value: c.getBgColor() }, 0, c.isBlink()),
        });
      }
    }
    return { cols, rows, cells };
  } finally {
    terminal.dispose();
  }
}

// Unicode 11 widths are on, so the terminal models a modern one: wide characters and most emoji take two
// columns, as the app's cells have them. What still differs from the app (pinned in tests/unit/qa-terminal.test.js,
// and a real finding when QA sees it on a screen): an emoji with a variation selector (a heart, then U+FE0F)
// is one column here and two in the app; a skin tone modifier or a joiner sequence (a family) is split into
// several cells here and is one two-column cell in the app; a flag is two one-column cells here and one
// two-column cell in the app.
//
// The app's writer writes a space where a cell's foreground equals its background (AnsiFile.js), so a
// hidden character in the app's cells comes back as a space by design: compare against
// normalizeHidden(appScreen).
//
// The screen a .ans (encoding 'cp437') or .utf8ans ('utf8') leaves in a terminal cols by rows. A wide
// character's second column is a space, as the app's cells have it. A .utf8ans ends with a line feed, so
// give the terminal a row more than the art has, or it scrolls the first row away.
export const terminalCells = (bytes, { cols, rows, encoding }) => screenOf([textOf(bytes, encoding)], cols, rows);

// The screen an asciicast v2 ends with: every "o" event written in order. The terminal is cols by rows,
// or the cast's own size when they aren't given.
export function castFinalCells(text, { cols, rows } = {}) {
  const [header, ...events] = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const output = events.filter(([, kind]) => kind === 'o').map(([, , data]) => data);
  return screenOf(output, cols ?? header.width, rows ?? header.height);
}

// The screen with every cell whose foreground equals its background blanked to a space, which is what the
// app's writer writes for it (AnsiFile.js), so an app screen can be compared with an export's.
export const normalizeHidden = (screen) => ({ ...screen, cells: screen.cells.map((cell) => (cell.fg === cell.bg ? { ...cell, char: ' ' } : cell)) });

// The cells two screens (as the functions above return them) differ at, by column and row. A character
// hidden by matching colors differs by design (the writer writes a space): normalizeHidden the app's side first.
export function diffCells(a, b) {
  if (a.cols !== b.cols || a.rows !== b.rows) throw new Error(`the screens are ${a.cols} x ${a.rows} and ${b.cols} x ${b.rows}`);
  const different = [];
  a.cells.forEach((cell, i) => {
    const other = b.cells[i];
    if (cell.char !== other.char || cell.fg !== other.fg || cell.bg !== other.bg) different.push({ col: i % a.cols, row: Math.floor(i / a.cols), a: cell, b: other });
  });
  return different;
}
