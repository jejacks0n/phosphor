// The ANSI files QA personas bring. They're made when a run needs them (the long one is over 1 MB), by the
// app's own writer, so nothing generated is committed; the files in tests/fixtures are used as they are.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CellWriter } from '../../src/lib/AnsiFile.js';
import { PALETTES } from '../../src/lib/ColorUtils.js';
import { CP437, cp437Byte } from '../../src/lib/Cp437.js';
import { Sauce } from '../../src/lib/Sauce.js';

const { cga, vga } = PALETTES;

// The bytes of a cols by rows file, one cell(x, y) at a time, the way the app writes a .ans: a line feed
// only where a viewer that ignores SAUCE needs one (under 80 columns), and SAUCE after the art.
function ansBytes(cols, rows, cell, { colorMode, sauce }) {
  const writer = new CellWriter({ colorMode });
  writer.sgr(0);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (cols < 80 && x === 0 && y > 0) {
        writer.sgr(0);
        writer.output.push(13, 10);
        writer.forgetColors();
      }
      writer.cell(cell(x, y));
    }
  }
  writer.sgr(0);
  const art = writer.output.bytes;
  return new Sauce({ cols, rows }, { ...sauce, fileType: 1, fileSize: art.length }).appendTo(art);
}

// 480,000 cells with the 256 colors going round as foreground and, offset by the row, as background.
export function makeLongAns({ cols = 300, lines = 1600 } = {}) {
  const cell = (x, y) => {
    const i = y * cols + x;
    return { char: CP437[32 + (i * 31) % 224], fg: vga[i % 256], bg: vga[(i * 7 + y) % 256] };
  };
  return ansBytes(cols, lines, cell, { colorMode: 'vga', sauce: { title: 'QA Long' } });
}

// A 20 by 5 shape on spaces, for merging onto art.
const LOGO = [
  '    ▄▄██████▄▄      ',
  '  ▄██▀▀    ▀▀██▄    ',
  '  ██    ██    ██    ',
  '  ▀██▄▄    ▄▄██▀    ',
  '    ▀▀██████▀▀      ',
];
export function makeLogoAns() {
  const cell = (x, y) => {
    const char = LOGO[y][x] ?? ' ';
    return char === ' ' ? { char, fg: cga[0], bg: cga[0] } : { char, fg: cga[14], bg: cga[1] };
  };
  return ansBytes(20, LOGO.length, cell, { colorMode: 'cga', sauce: { title: 'QA Logo' } });
}

// An 80 column scene with what a real .ans has: CP437 high bytes, a forward move (ESC[nC), a saved and
// restored cursor, a bright background written as blink, and text running past column 80 with no line feed.
// The rows are in tests/unit/qa-files.test.js's terms: Z after ab and ESC[10C; R where the cursor was saved;
// W starting the line after a full one.
export function makeSceneAns() {
  const text = (string) => Array.from(string, (char) => cp437Byte(char));
  const esc = (codes) => text(`\x1b[${codes}`);
  const eol = [13, 10];
  const fullLine = Array.from({ length: 8 }, () => '0123456789').join('');
  const art = [
    ...esc('?33h'), ...esc('0m'),
    ...esc('1;37;44m'), ...text('╔══ QA Scene ══╗ ░▒▓█▀▄ ÉÍ» é'), ...esc('0m'), ...eol,
    ...esc('0;32m'), ...text('ab'), ...esc('10C'), ...esc('1;33m'), ...text('Z'), ...esc('s'),
    ...esc('0;36m'), ...eol, ...text('below'), ...esc('u'), ...esc('0;35m'), ...text('R'), ...eol,
    ...esc('0;5;37;41m'), ...text('!'), ...esc('0m'), ...text(' a bright background'), ...eol,
    ...esc('0;33m'), ...text(fullLine), ...esc('0;31m'), ...text('Wrapped past the edge'), ...eol,
    ...esc('0m'), ...text('└──┘'),
  ];
  const rows = 6;
  return new Sauce({ cols: 80, rows }, { fileType: 1, fileSize: art.length, title: 'QA Scene', author: 'Phosphor QA', group: 'QA' }).appendTo(Uint8Array.from(art));
}

// The three files in a folder (made if it isn't there), and their paths.
export function writeFiles(dir) {
  mkdirSync(dir, { recursive: true });
  const paths = { long: join(dir, 'long.ans'), scene: join(dir, 'scene.ans'), logo: join(dir, 'logo.ans') };
  writeFileSync(paths.long, makeLongAns());
  writeFileSync(paths.scene, makeSceneAns());
  writeFileSync(paths.logo, makeLogoAns());
  return paths;
}
