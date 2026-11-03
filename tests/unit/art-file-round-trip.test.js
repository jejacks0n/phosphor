// What Phosphor exports as .ans or .utf8ans opens back the way it was exported: every cell's character
// and colors (a cell whose colors match is written as a space, so it reads back as one), in each color
// mode, at a narrow and a wide width, and an animated export as its last frame.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { readArtFile } from '../../src/lib/ArtFile.js';
import { buildCell, layoutWide } from '../../src/lib/Cells.js';
import { PALETTES, rgb2hex } from '../../src/lib/ColorUtils.js';

const SAUCE = { title: 'Round trip', author: 'Test Author', group: '', date: '20261102', fontName: 'IBM VGA', use9pxFont: false, comments: [] };

const plain = (hex) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return { r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] }; };
// Colors that are not in any palette (24-bit), and CGA entries; the last two are the same color, so some cells match.
const COLORS = {
  none: ['#ffee00', '#0044aa', '#aa0044', '#101010', '#12ab34', '#0044aa'].map(plain),
  cga: [14, 1, 4, 0, 10, 1].map((i) => PALETTES.cga[i]),
};
const PLAIN = ['a', 'Z', '7', '█', '▀', 'é', '░', '╬', ' ', '~'];
// An .ans also gets characters CP437 lacks: lookalikes (a control byte's glyph, a block) and one with none.
const STAND_INS = { '•': '∙', '▅': '▄', '→': '>', '漢': '?' }; // written literally, not through the writer's own table
const CHARS = { ans: [...PLAIN, ...Object.keys(STAND_INS)], utf8ans: [...PLAIN, '漢', 'ж'] };

// A cols x rows grid; shift moves which character and colors each cell gets (for a second frame).
const build = (cols, rows, mode, chars, shift = 0) => layoutWide(Array.from({ length: cols * rows }, (_, i) => {
  const n = i + shift;
  return buildCell(COLORS[mode][(n * 3 + (n >> 3)) % 6], COLORS[mode][(n * 5 + 1) % 6], chars[(n * 7 + (n >> 2)) % chars.length], 'ansi');
}), cols);

// The cell a reader should give for an exported one: a hidden cell (matching colors) or a wide trail is a space.
const shows = (cell, utf8) => ({
  char: cell.fg.hex === cell.bg.hex || cell.wide === 'trail' ? ' ' : utf8 ? cell.char : STAND_INS[cell.char] ?? cell.char,
  fg: cell.fg.hex.toLowerCase(),
  bg: cell.bg.hex.toLowerCase(),
});

const expectCells = (art, cells, cols, rows, utf8) => {
  assert.equal(art.cols, cols);
  assert.equal(art.rows, rows);
  assert.equal(art.cells.length, cols * rows);
  cells.forEach((cell, i) => assert.deepEqual(art.cells[i], shows(cell, utf8), `cell ${i} (${JSON.stringify(cell.char)})`));
};

describe('an export reads back as it was exported', () => {
  for (const kind of ['ans', 'utf8ans']) {
    for (const mode of ['cga', 'none']) {
      for (const cols of [8, 80]) {
        test(`.${kind}, ${mode} colors, ${cols} columns`, async () => {
          const rows = 5;
          const cells = build(cols, rows, mode, CHARS[kind]);
          if (kind === 'utf8ans') assert.ok(cells.some((c) => c.wide === 'lead'), 'the grid has wide characters');
          else for (const char of Object.keys(STAND_INS)) assert.ok(cells.some((c) => c.char === char && c.fg.hex !== c.bg.hex), `the grid shows ${char}`);
          assert.ok(cells.some((c) => c.fg.hex === c.bg.hex), 'the grid has cells whose colors match');
          const blob = new AnsiFile(cols, rows, cells).toBlob({ colorMode: mode, utf8: kind === 'utf8ans', sauce: SAUCE });
          const art = readArtFile(new Uint8Array(await blob.arrayBuffer()), `drawing.${kind}`);
          expectCells(art, cells, cols, rows, kind === 'utf8ans');
          assert.equal(art.palette, mode);
        });
      }
    }
  }

  test('an animated export reads as its last frame', () => {
    const cols = 8, rows = 3;
    const frames = [build(cols, rows, 'none', CHARS.ans, 0), build(cols, rows, 'none', CHARS.ans, 11)];
    const bytes = AnsiFile.animationBytes(cols, rows, frames, { colorMode: 'none', sauce: SAUCE });
    const art = readArtFile(bytes, 'movie.ans');
    expectCells(art, frames[1], cols, rows, false);
    assert.equal(art.palette, 'none');
  });

  test('an animated .utf8ans reads as its last frame', () => {
    const cols = 8, rows = 3;
    const frames = [build(cols, rows, 'cga', CHARS.utf8ans, 0), build(cols, rows, 'cga', CHARS.utf8ans, 11)];
    const bytes = AnsiFile.animationBytes(cols, rows, frames, { utf8: true, colorMode: 'cga', sauce: SAUCE });
    const art = readArtFile(bytes, 'movie.utf8ans');
    expectCells(art, frames[1], cols, rows, true);
    assert.equal(art.palette, 'cga');
  });
});
