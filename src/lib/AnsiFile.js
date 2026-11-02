/**
 * Handles exporting the character buffer to various ANSI file formats (.ans, .utf8ans).
 * Supports standard ANSI SGR, legacy iCE colors via SAUCE, and modern 256-color UTF-8 output.
 */
import { Sauce } from './Sauce.js';
import { ansByte, cp437Substitute } from './Cp437.js';

const utf8Encoder = new TextEncoder();

const toBytes = (input) => Array.from(input).map((b) => b.charCodeAt(0));

// A character's UTF-8 bytes, worked out once per character (a file is a character per cell).
const utf8Bytes = new Map();
const utf8Of = (char) => {
  let bytes = utf8Bytes.get(char);
  if (!bytes) utf8Bytes.set(char, bytes = utf8Encoder.encode(char));
  return bytes;
};

// The file's bytes as they're written, in a Uint8Array that doubles as it fills: an export can be
// tens of MB, and an array of numbers would take several times that.
class Bytes {
  #buffer = new Uint8Array(1 << 16);
  length = 0;

  push(...bytes) {
    this.pushAll(bytes);
  }

  pushAll(bytes) {
    if (this.length + bytes.length > this.#buffer.length) {
      const grown = new Uint8Array(Math.max(this.#buffer.length * 2, this.length + bytes.length));
      grown.set(this.#buffer.subarray(0, this.length));
      this.#buffer = grown;
    }
    this.#buffer.set(bytes, this.length);
    this.length += bytes.length;
  }

  get bytes() {
    return this.#buffer.subarray(0, this.length);
  }
}


// Cells as bytes, one after another: an art file's colors, as few as say what changed, and its characters.
export class CellWriter {
  output = new Bytes();
  #utf8;
  #colorMode;
  #active = { fg: { hex: null }, bg: { hex: null }, blink: false, bold: false };
  #leadAsSpace = false;

  constructor({ utf8 = false, colorMode = 'none' } = {}) {
    this.#utf8 = utf8;
    this.#colorMode = colorMode;
    this.sgr = this.sgr.bind(this);
  }

  sgr(...codes) {
    this.output.push(27, 91, ...toBytes(codes.join(';')), 109);
  }

  // After an SGR 0: the next cell says its colors in full.
  forgetColors() {
    this.#active = { fg: { hex: null }, bg: { hex: null }, blink: false, bold: false };
  }

  clear() {
    this.output.push(27, 91, 50, 74);
  }

  moveTo(col, row) {
    this.output.pushAll(toBytes(`\x1b[${row + 1};${col + 1}H`));
  }

  // What's been written since the last time, for a format that keeps frames apart.
  take() {
    const bytes = this.output.bytes.slice();
    this.output = new Bytes();
    return bytes;
  }

  // A wide character's trail: in UTF-8 the terminal has already moved two columns, so it writes
  // nothing, unless its lead went out as a space; in CP437 the lead's stand-in is one column, so
  // the trail is a space (its colors are the lead's: no SGR change).
  cell(cell) {
    const { fg, bg } = cell, utf8 = this.#utf8;
    const trail = cell.wide === 'trail';
    const char = trail ? (utf8 && !this.#leadAsSpace ? '' : ' ') : fg.hex === bg.hex ? ' ' : cell.char;
    this.#leadAsSpace = cell.wide === 'lead' && char === ' ';

    switch (this.#colorMode) {
      case 'cga':
        this.#addCgaBytes(this.sgr, fg, bg, this.#active, utf8);
        break;
      case 'vga':
        this.#addVgaBytes(this.sgr, fg, bg, this.#active);
        break;
      case 'none':
      case 'count':
      case 'palette':
      default:
        this.#addTrueColorBytes(this.sgr, fg, bg, this.#active);
        break;
    }

    if (utf8) this.output.pushAll(utf8Of(char));
    else this.output.push(AnsiFile.unicodeToCP437(char));
  }

  #addTrueColorBytes(add, fg, bg, active) {
    if (fg.hex !== active.fg.hex) {
      const c = (Array.isArray(fg.c)) ? fg.c : [fg.r, fg.g, fg.b];
      add(38, 2, ...c);
      active.fg = fg;
    }

    if (bg.hex !== active.bg.hex) {
      const c = (Array.isArray(bg.c)) ? bg.c : [bg.r, bg.g, bg.b];
      add(48, 2, ...c);
      active.bg = bg;
    }
  }

  #addVgaBytes(add, fg, bg, active) {
    if (fg.hex !== active.fg.hex) {
      const fgCode = Number.isInteger(Number(fg.c)) ? Number(fg.c) : 0;
      add(38, 5, fgCode);
      active.fg = fg;
    }

    if (bg.hex !== active.bg.hex) {
      const bgCode = Number.isInteger(Number(bg.c)) ? Number(bg.c) : 0;
      add(48, 5, bgCode);
      active.bg = bg;
    }
  }

  #addCgaBytes(add, fg, bg, active, utf8) {
    const sgr = [];
    let bold = false;
    let blink = false;
    let fgCode = Number.isInteger(Number(fg.c)) ? Number(fg.c) : 0;
    let bgCode = Number.isInteger(Number(bg.c)) ? Number(bg.c) : 0;

    if (fgCode > 7 && fgCode < 16) {
      bold = true;
      fgCode = fgCode - 8;
    }

    if (bgCode > 7 && bgCode < 16) {
      blink = true;
      bgCode = bgCode - 8;
    }

    // Reset if we need to turn off attributes
    if ((active.bold && !bold) || (active.blink && !blink)) {
      sgr.push(0);
      active.fg = { hex: null };
      active.bg = { hex: null };
      active.bold = false;
      active.blink = false;
    }

    if (utf8) {
      // Modern terminal codes using explicit 256-color indices (0-15)
      if (fg.hex !== active.fg.hex) {
        const fullFgCode = Number.isInteger(Number(fg.c)) ? Number(fg.c) : 0;
        add(38, 5, fullFgCode);
        active.fg = fg;
      }
      if (bg.hex !== active.bg.hex) {
        const fullBgCode = Number.isInteger(Number(bg.c)) ? Number(bg.c) : 0;
        add(48, 5, fullBgCode);
        active.bg = bg;
      }
    } else {
      // Legacy ANSI codes with Bold/Blink hacks
      if (bold && !active.bold) {
        sgr.push(1);
        active.bold = true;
      }
      if (blink && !active.blink) {
        sgr.push(5);
        active.blink = true;
      }
      if (fg.hex !== active.fg.hex) {
        sgr.push(30 + fgCode);
        active.fg = fg;
      }
      if (bg.hex !== active.bg.hex) {
        sgr.push(40 + bgCode);
        active.bg = bg;
      }
    }

    if (sgr.length) add(...sgr);
  }
}

const sameCell = (a, b) => a === b || (a.char === b.char && a.wide === b.wide && a.fg.hex === b.fg.hex && a.bg.hex === b.bg.hex);

// The cells of next that differ from prev (null: nothing's been drawn), a run at a time. A wide character is
// written whole, since a terminal can't take half of one.
export function frameDiffBytes(prev, next, cols, writer) {
  const differs = (i) => !prev || !sameCell(prev[i], next[i]);
  const rows = next.length / cols;
  for (let row = 0; row < rows; row++) {
    const start = row * cols;
    for (let col = 0; col < cols; col++) {
      const i = start + col;
      if (!differs(i)) continue;
      let first = col;
      if (next[i].wide === 'trail' && col > 0) first = col - 1;
      writer.moveTo(first, row);
      let at = first;
      for (; at < cols; at++) {
        const j = start + at;
        if (at > col && !differs(j) && next[j].wide !== 'trail') break;
        writer.cell(next[j]);
      }
      col = at - 1;
    }
  }
}

export class AnsiFile {
  constructor(cols, rows, cells) {
    this.cols = cols;
    this.rows = rows;
    this.cells = cells;
  }

  // .ans is CP437: a character it can't encode is written as its closest lookalike, or '?'
  // (exportFile lists them first).
  static unicodeToCP437(char) {
    return ansByte(char) ?? ansByte(cp437Substitute(char));
  }

  // Characters in cells that CP437 can't encode: how often each appears and what's written instead
  // (most frequent first). A cell whose colors match is written as a space, so it doesn't count; a
  // wide character counts once (its trail is written as a space).
  static unmappable(cells) {
    const found = new Map();
    for (const cell of cells) {
      if (!cell || cell.wide === 'trail' || cell.fg.hex === cell.bg.hex || ansByte(cell.char) !== null) continue;
      const entry = found.get(cell.char) ?? { count: 0, as: cp437Substitute(cell.char) };
      entry.count++;
      found.set(cell.char, entry);
    }
    return new Map([...found].sort((a, b) => b[1].count - a[1].count));
  }

  toBlob(opts = {}) {
    return new Blob([this.#asBytes(opts)], { type: 'application/octet-stream' });
  }

  #asBytes({ utf8 = false, colorMode = 'none', sauce = null } = {}) {
    // A viewer that ignores SAUCE wraps at 80 columns, so narrower .ans rows end in CR LF too.
    const lineFeeds = utf8 || this.cols < 80;
    const writer = new CellWriter({ utf8, colorMode });
    writer.sgr(0);

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (lineFeeds && x === 0 && y > 0) {
          writer.sgr(0);
          writer.output.push(13, 10);
          writer.forgetColors();
        }
        const cell = this.cells[y * this.cols + x];
        if (cell) writer.cell(cell);
      }
    }

    writer.sgr(0);
    if (utf8) writer.output.push(13, 10);

    return this.#appendSauce(writer.output.bytes, { ...sauce, fileType: 1 });
  }

  // An ANSiMation: a screen cleared once, then each frame as only the cells that differ from the one before, so a
  // viewer shows the art moving as the bytes arrive. Every run starts with a cursor move, so nothing can scroll.
  // Timing is the viewer's: a file has none.
  static animationBytes(cols, rows, frames, { utf8 = false, colorMode = 'none', sauce = null } = {}) {
    const writer = new CellWriter({ utf8, colorMode });
    writer.sgr(0);
    writer.clear();
    frames.forEach((frame, i) => frameDiffBytes(frames[i - 1] ?? null, frame, cols, writer));
    writer.sgr(0);
    return new AnsiFile(cols, rows, null).#appendSauce(writer.output.bytes, { ...sauce, fileType: 2 });
  }

  #appendSauce(output, details) {
    return new Sauce(this, {
      ...details,
      dataType: 1,
      fileSize: output.length,
    }).appendTo(output);
  }
}
