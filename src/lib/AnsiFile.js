import { Buffer } from 'buffer';
import { Sauce } from '@/lib/Sauce';
import { unicodeToCP437 } from '@/lib/encodings';

const toBytes = (input) => Array.from(input).map((b) => b.charCodeAt(0));

export class AnsiFile {
  constructor(cols, rows, data) {
    this.cols = cols;
    this.rows = rows;
    this.data = data;
  }

  exportAs(filename, opts = {}) {
    const link = document.createElement('a');
    const data = this.#asBytes(opts);
    const file = new Blob([data], { type: 'application/octet-stream' });

    link.href = window.URL.createObjectURL(file);
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);

    link.click();
    link.remove();
  }

  #asBytes({ utf8 = false, colorMode = 'truecolor', sauce = null } = {}) {
    const lineFeeds = utf8 // utf8 style ansi should have line feeds
    const output = [];
    const addSgr = (...sgr) => output.push(27, 91, ...toBytes(sgr.join(';')), 109);
    const active = { fg: {}, bg: {}, blink: false, bold: false };

    addSgr(0);

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols * 2 + x;

        if (lineFeeds && i > 0 && i % this.cols === 0) {
          addSgr(0);
          output.push(13, 10);
          active.fg = {};
          active.bg = {};
        }

        let bg = this.data[i];
        let fg = this.data[i + this.cols];
        if (!fg) continue;

        switch (colorMode) {
          case 'none':
            AnsiFile.#addTrueColorBytes(addSgr, fg, bg, active);
            break;
          case 'cga':
            AnsiFile.#addCgaBytes(addSgr, fg, bg, active);
            break;
        }

        let char = (active.fg.hex === active.bg.hex) ? ' ' : bg.char;
        if (utf8) {
          output.push(...Buffer.from(char));
        } else {
          output.push(unicodeToCP437(char));
        }
      }
    }

    addSgr(0);
    if (lineFeeds) output.push(13, 10);

    return this.#appendSauce(output, sauce);
  }

  static #addTrueColorBytes(add, fg, bg, active) {
    if (fg.hex !== active.fg.hex) {
      add(38, 2, ...fg.c);
      active.fg = fg;
    }

    if (bg.hex !== active.bg.hex) {
      add(48, 2, ...bg.c);
      active.bg = bg;
    }

    return active;
  }

  static #addCgaBytes(add, fg, bg, active) {
    const sgr = [];
    let bold = false;
    let blink = false;
    let fgCode = fg.c;
    let bgCode = bg.c;

    if (fg.c > 7 && fg.c < 16) {
      bold = true;
      fgCode = fg.c - 8;
    }

    if (bg.c > 7 && bg.c < 16) {
      blink = true;
      bgCode = bg.c - 8;
    }

    if ((active.bold && !bold) || (active.blink && !blink)) {
      sgr.push(0);
      active.fg = {};
      active.bg = {};
      active.bold = false;
      active.blink = false;
    }

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

    if (sgr.length) add(...sgr);

    return active;
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