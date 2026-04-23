/**
 * Handles exporting the character buffer to various ANSI file formats (.ans, .utf8ans).
 * Supports standard ANSI SGR, legacy iCE colors via SAUCE, and modern 256-color UTF-8 output.
 */
import { Buffer } from 'buffer';
import { Sauce } from '@/lib/Sauce';

const toBytes = (input) => Array.from(input).map((b) => b.charCodeAt(0));

const CP437_MAP = {
  0x263A: 1, 0x263B: 2, 0x2665: 3, 0x2666: 4, 0x2663: 5, 0x2660: 6, 0x2022: 7, 0x25D8: 8,
  0x25CB: 9, 0x25D9: 10, 0x2642: 11, 0x2640: 12, 0x266A: 13, 0x266B: 14, 0x263C: 15, 0x25BA: 16,
  0x25C4: 17, 0x2195: 18, 0x203C: 19, 0x00B6: 20, 0x00A7: 21, 0x25AC: 22, 0x21A8: 23, 0x2191: 24,
  0x2193: 25, 0x2192: 26, 0x2190: 27, 0x221F: 28, 0x2194: 29, 0x25B2: 30, 0x25BC: 31, 0x2302: 127,
  0x00C7: 128, 0x00FC: 129, 0x00E9: 130, 0x00E2: 131, 0x00E4: 132, 0x00E0: 133, 0x00E5: 134, 0x00E7: 135,
  0x00EA: 136, 0x00EB: 137, 0x00E8: 138, 0x00EF: 139, 0x00EE: 140, 0x00EC: 141, 0x00C4: 142, 0x00C5: 143,
  0x00C9: 144, 0x00E6: 145, 0x00C6: 146, 0x00F4: 147, 0x00F6: 148, 0x00F2: 149, 0x00FB: 150, 0x00F9: 151,
  0x00FF: 152, 0x00D6: 153, 0x00DC: 154, 0x00A2: 155, 0x00A3: 156, 0x00A5: 157, 0x20A7: 158, 0x0192: 159,
  0x00E1: 160, 0x00ED: 161, 0x00F3: 162, 0x00FA: 163, 0x00F1: 164, 0x00D1: 165, 0x00AA: 166, 0x00BA: 167,
  0x00BF: 168, 0x2310: 169, 0x00AC: 170, 0x00BD: 171, 0x00BC: 172, 0x00A1: 173, 0x00AB: 174, 0x00BB: 175,
  0x2591: 176, 0x2592: 177, 0x2593: 178, 0x2502: 179, 0x2524: 180, 0x2561: 181, 0x2562: 182, 0x2556: 183,
  0x2555: 184, 0x2563: 185, 0x2551: 186, 0x2557: 187, 0x255D: 188, 0x255C: 189, 0x255B: 190, 0x2510: 191,
  0x2514: 192, 0x2534: 193, 0x252C: 194, 0x251C: 195, 0x2500: 196, 0x253C: 197, 0x255E: 198, 0x255F: 199,
  0x255A: 200, 0x2554: 201, 0x2569: 202, 0x2566: 203, 0x2560: 204, 0x2550: 205, 0x256C: 206, 0x2567: 207,
  0x2568: 208, 0x2564: 209, 0x2565: 210, 0x2559: 211, 0x2558: 212, 0x2552: 213, 0x2553: 214, 0x256B: 215,
  0x256A: 216, 0x2518: 217, 0x250C: 218, 0x2588: 219, 0x2584: 220, 0x258C: 221, 0x2590: 222, 0x2580: 223,
  0x03B1: 224, 0x00DF: 225, 0x0393: 226, 0x03C0: 227, 0x03A3: 228, 0x03C3: 229, 0x00B5: 230, 0x03C4: 231,
  0x03A6: 232, 0x0398: 233, 0x03A9: 234, 0x03B4: 235, 0x221E: 236, 0x03C6: 237, 0x03B5: 238, 0x2229: 239,
  0x2261: 240, 0x00B1: 241, 0x2265: 242, 0x2264: 243, 0x2320: 244, 0x2321: 245, 0x00B0: 248, 0x00F7: 246,
  0x2248: 247, 0x2219: 249, 0x00B7: 250, 0x221A: 251, 0x207F: 252, 0x00B2: 253, 0x25A0: 254, 0x00A0: 255
};

export class AnsiFile {
  constructor(cols, rows, data) {
    this.cols = cols;
    this.rows = rows;
    this.data = data;
  }

  static unicodeToCP437(char) {
    const code = char.charCodeAt(0);
    return CP437_MAP[code] || (code <= 127 ? code : 0);
  }

  async exportAs(filename, opts = {}) {
    const data = this.#asBytes(opts);
    const file = new Blob([data], { type: 'application/octet-stream' });

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: filename.endsWith('.ans') ? 'ANSI Art File' : 'UTF8 ANSI Art File',
            accept: { 'application/octet-stream': [filename.slice(filename.lastIndexOf('.'))] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Save File Picker failed, falling back to download:', err);
      }
    }

    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(file);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  #asBytes({ utf8 = false, colorMode = 'none', sauce = null } = {}) {
    const lineFeeds = utf8;
    const output = [];
    const addSgr = (...sgr) => output.push(27, 91, ...toBytes(sgr.join(';')), 109);
    const active = { fg: { hex: null }, bg: { hex: null }, blink: false, bold: false };

    addSgr(0);

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols * 2 + x;

        if (lineFeeds && i > 0 && i % this.cols === 0) {
          addSgr(0);
          output.push(13, 10);
          active.fg = { hex: null };
          active.bg = { hex: null };
          active.bold = false;
          active.blink = false;
        }

        let bg = this.data[i];
        let fg = this.data[i + this.cols];
        if (!fg) continue;

        let char = bg.char;
        if (fg.hex === bg.hex) char = ' ';

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
          output.push(...Buffer.from(char));
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
      add(38, 5, fg.c);
      active.fg = fg;
    }

    if (bg.hex !== active.bg.hex) {
      add(48, 5, bg.c);
      active.bg = bg;
    }
  }

  #addCgaBytes(add, fg, bg, active, utf8) {
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
        add(38, 5, fg.c);
        active.fg = fg;
      }
      if (bg.hex !== active.bg.hex) {
        add(48, 5, bg.c);
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
