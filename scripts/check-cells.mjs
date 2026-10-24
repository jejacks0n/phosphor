// Cell model: one { char, fg, bg } per character cell, built exactly as the pipeline always has
// (export bytes depend on it). Run: node scripts/check-cells.mjs
import assert from 'node:assert/strict';
import { buildCells, buildCell, brightnessChar, charRowsOf, cellIndex, cellOfPixel, cellAt, layoutWide } from '../src/lib/Cells.js';

const px = (r, g, b, c) => (c === undefined ? { r, g, b } : { r, g, b, c });
const opts = { charset: 'ab', charMode: 'random', renderStyle: 'ansi', seed: 's' };

// 2x2 grid of pixels = 2 cols, 1 cell row
const pixels = [px(255, 0, 0), px(0, 0, 255), px(0, 255, 0), px(255, 255, 255)];
const ansi = buildCells(pixels, 2, 2, opts);
assert.equal(ansi.length, 2);
assert.deepEqual(ansi[0].bg, { r: 255, g: 0, b: 0, hex: '#ff0000', c: [255, 0, 0] });
assert.deepEqual(ansi[0].fg, { r: 0, g: 255, b: 0, hex: '#00ff00', c: [0, 255, 0] });

const ascii = buildCell(px(0, 0, 0), px(255, 255, 255, 7), 'x', 'ascii');
assert.deepEqual(ascii.bg, { r: 0, g: 0, b: 0, hex: '#000000', c: 0 });
assert.deepEqual(ascii.fg, { r: 255, g: 255, b: 255, hex: '#FFFFFF', c: 7 });
const colorAscii = buildCell(px(0, 0, 0), px(100, 200, 50), 'x', 'colorAscii');
assert.deepEqual(colorAscii.fg, { r: 50, g: 100, b: 25, hex: '#326419', c: [50, 100, 25] });
assert.equal(buildCell(px(0, 0, 0), px(0, 0, 0, 3), 'x', 'colorAscii').fg.c, 3); // palette index kept for CGA/VGA export
assert.equal(buildCell(px(1, 2, 3, 5), px(0, 0, 0), 'x', 'ansi').bg.c, 5);

assert.equal(buildCells(pixels, 2, 3, opts).length, 2); // odd final pixel row dropped
assert.equal(brightnessChar(px(0, 0, 0), px(0, 0, 0), ' .#'), ' ');
assert.equal(brightnessChar(px(255, 255, 255), px(255, 255, 255), ' .#'), '#');
assert.deepEqual(ansi.map(c => c.char), buildCells(pixels, 2, 2, opts).map(c => c.char)); // seeded
// draw order pinned against the pre-Cells pipeline: one draw per cell, row-major (4 cols x 2 cell rows)
// A cell's random character depends on the seed and its own position, so it survives any change
// of the grid's width or height (no rewrapping), and different seeds and cells differ.
const charsAt = (cols, rows, seed = opts.seed) => buildCells(Array(cols * rows).fill(px(0, 0, 0)), cols, rows, { ...opts, seed, charset: 'abcdefgh' });
const wide = charsAt(9, 8), narrow = charsAt(5, 12);
for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) assert.equal(narrow[cellIndex(col, row, 5)].char, wide[cellIndex(col, row, 9)].char);
assert.ok(new Set(wide.map(c => c.char)).size > 4);                                       // spread over the set
assert.notEqual(charsAt(9, 8, 'other').map(c => c.char).join(''), wide.map(c => c.char).join(''));
assert.ok(buildCells(pixels, 2, 2, { ...opts, charset: '' }).every(c => c.char === '▄'));

assert.equal(charRowsOf(167), 83);
assert.equal(cellIndex(3, 2, 80), 163);
assert.deepEqual(cellOfPixel(3, 5), { col: 3, row: 2 });
// grid pixel position -> character cell, or null off the grid (an odd final pixel row has no cell)
assert.deepEqual(cellAt(3.7, 5.2, 80, 167), { col: 3, row: 2 });
assert.equal(cellAt(80.5, 0, 80, 167), null);
assert.equal(cellAt(-0.5, 0, 80, 167), null);
assert.equal(cellAt(0, 166.5, 80, 167), null); // row 83 doesn't exist with 167 pixel rows
// Generated characters stay one column: the charset is split into whole characters (an astral one
// isn't two UTF-16 halves) and two-column ones are skipped, falling back to ▄ when nothing's left.
const grid = (charset) => buildCells(Array.from({ length: 32 }, () => px(9, 9, 9)), 4, 8, { ...opts, charset }).map(c => c.char);
assert.ok(grid('a漢b').every(c => c === 'a' || c === 'b'));
assert.ok(grid('𝔸').every(c => c === '𝔸'));
assert.ok(grid('漢').every(c => c === '▄'));
assert.equal(brightnessChar(px(0, 0, 0), px(0, 0, 0), ' 漢#'), ' ');
assert.equal(brightnessChar(px(255, 255, 255), px(255, 255, 255), ' 漢#'), '#');
// A wide character takes its cell and the one to its right, the way a terminal lays it out: the
// covered cell shows the lead's character and colours; one in the last column has no room and
// shows as a space.
const C = (char) => ({ char, fg: { hex: '#ffffff' }, bg: { hex: '#000000' } });
const wideRow = ['a', '漢', 'x', 'b', '字'].map(C);                       // 5 cols, one row
const laid = layoutWide(wideRow, 5);
assert.deepEqual(laid.map(c => [c.char, c.wide]), [['a', undefined], ['漢', 'lead'], ['漢', 'trail'], ['b', undefined], [' ', undefined]]);
assert.equal(laid[2].fg, wideRow[1].fg);                                  // the trail has the lead's colours
assert.equal(layoutWide(wideRow.slice(0, 1), 1)[0].char, 'a');
const narrowRow = ['a', 'b'].map(C);
assert.equal(layoutWide(narrowRow, 2), narrowRow);                              // nothing wide: the same array
assert.deepEqual(layoutWide(['漢', '漢', '漢', '漢'].map(C), 4).map(c => c.wide), ['lead', 'trail', 'lead', 'trail']); // every other one starts
assert.deepEqual(layoutWide(['a', '漢', '字', 'b'].map(C), 2).map(c => c.char), ['a', ' ', '字', '字']); // per row
const big = Array.from({ length: 30000 }, (_, i) => C(i % 97 ? '▄' : '漢'));
const t0 = performance.now(); layoutWide(big, 200); const ms = performance.now() - t0;
assert.ok(ms < 15, `layoutWide 30k cells: ${ms.toFixed(1)} ms`);          // runs on every brush move; generous for noise
console.log('cells ok');
