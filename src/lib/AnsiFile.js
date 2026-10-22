/**
 * Handles exporting the character buffer to various ANSI file formats (.ans, .utf8ans).
 * Supports standard ANSI SGR, legacy iCE colors via SAUCE, and modern 256-color UTF-8 output.
 */
import { Sauce } from './Sauce.js';
import { cp437Byte, cp437Substitute } from './Cp437.js';

const utf8Encoder = new TextEncoder();

const toBytes = (input) => Array.from(input).map((b) => b.charCodeAt(0));


export class AnsiFile {
  constructor(cols, rows, cells) {
    this.cols = cols;
    this.rows = rows;
    this.cells = cells;
  }

  // .ans is CP437: a character it can't encode is written as its closest lookalike, or '?'
  // (exportFile lists them first).
  static unicodeToCP437(char) {
    return cp437Byte(char) ?? cp437Byte(cp437Substitute(char));
  }

  // Characters in cells that CP437 can't encode: how often each appears and what's written instead
  // (most frequent first). A cell whose colours match is written as a space, so it doesn't count.
  static unmappable(cells) {
    const found = new Map();
    for (const cell of cells) {
      if (!cell || cell.fg.hex === cell.bg.hex || cp437Byte(cell.char) !== null) continue;
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
    const lineFeeds = utf8;
    const output = [];
    const addSgr = (...sgr) => output.push(27, 91, ...toBytes(sgr.join(';')), 109);
    const active = { fg: { hex: null }, bg: { hex: null }, blink: false, bold: false };

    addSgr(0);

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (lineFeeds && x === 0 && y > 0) {
          addSgr(0);
          output.push(13, 10);
          active.fg = { hex: null };
          active.bg = { hex: null };
          active.bold = false;
          active.blink = false;
        }

        const cell = this.cells[y * this.cols + x];
        if (!cell) continue;

        const { fg, bg } = cell;
        const char = fg.hex === bg.hex ? ' ' : cell.char;

        switch (colorMode) {
          case 'cga':
            this.#addCgaBytes(addSgr, fg, bg, active, utf8);
            break;
          case 'vga':
            this.#addVgaBytes(addSgr, fg, bg, active);
            break;
          case 'none':
          case 'count':
          case 'palette':
          default:
            this.#addTrueColorBytes(addSgr, fg, bg, active);
            break;
        }

        if (utf8) {
          output.push(...utf8Encoder.encode(char));
        } else {
          output.push(AnsiFile.unicodeToCP437(char));
        }
      }
    }

    addSgr(0);
    if (lineFeeds) output.push(13, 10);

    return this.#appendSauce(output, sauce);
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

  #appendSauce(output, details) {
    return new Sauce(this, {
      ...details,
      dataType: 1,
      fileType: 1,
      fileSize: output.length,
    }).appendTo(output);
  }
}
