// Cell model: one { char, fg, bg } per character cell, built exactly as the pipeline always has
// (export bytes depend on it).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildCells, buildCell, weightedChar, charRowsOf, cellIndex, cellOfPixel, cellAt, layoutWide, layoutWideRows, selectionText } from '../../src/lib/Cells.js';

test('Cell model: one { char, fg, bg } per character cell, built exactly as the pipeline always has (export bytes depend on it)', async () => {
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
  assert.equal(weightedChar(px(0, 0, 0), px(0, 0, 0), ' .#'), ' ');
  assert.equal(weightedChar(px(255, 255, 255), px(255, 255, 255), ' .#'), '#');
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
  assert.equal(weightedChar(px(0, 0, 0), px(0, 0, 0), ' 漢#'), ' ');
  assert.equal(weightedChar(px(255, 255, 255), px(255, 255, 255), ' 漢#'), '#');
  // A full render (buildCells) picks the same character by brightness as a stroke's update
  // (weightedChar), only ever one from the charset: a mid gray is '+', not ',' (undo used to turn
  // a painted '+' into ',').
  const gray = px(128, 128, 128);
  assert.equal(buildCells([gray, gray], 1, 2, { ...opts, charset: ' .+#', charMode: 'brightness' })[0].char, weightedChar(gray, gray, ' .+#'));
  assert.equal(weightedChar(gray, gray, ' .+#'), '+');
  // A wide character takes its cell and the one to its right, the way a terminal lays it out: the
  // covered cell shows the lead's character and colors; one in the last column has no room and
  // shows as a space.
  const C = (char) => ({ char, fg: { hex: '#ffffff' }, bg: { hex: '#000000' } });
  const wideRow = ['a', '漢', 'x', 'b', '字'].map(C);                       // 5 cols, one row
  const laid = layoutWide(wideRow, 5);
  assert.deepEqual(laid.map(c => [c.char, c.wide]), [['a', undefined], ['漢', 'lead'], ['漢', 'trail'], ['b', undefined], [' ', undefined]]);
  assert.equal(laid[2].fg, wideRow[1].fg);                                  // the trail has the lead's colors
  assert.equal(layoutWide(wideRow.slice(0, 1), 1)[0].char, 'a');
  const narrowRow = ['a', 'b'].map(C);
  assert.equal(layoutWide(narrowRow, 2), narrowRow);                              // nothing wide: the same array
  assert.deepEqual(layoutWide(['漢', '漢', '漢', '漢'].map(C), 4).map(c => c.wide), ['lead', 'trail', 'lead', 'trail']); // every other one starts
  assert.deepEqual(layoutWide(['a', '漢', '字', 'b'].map(C), 2).map(c => c.char), ['a', ' ', '字', '字']); // per row
  // A selection as text for the system clipboard: the characters as they show, a line per row, a wide
  // character written once (its trail adds nothing, so the text lines up in a terminal).
  const textGrid = layoutWide(['a', '漢', 'x', 'b', 'c', 'd', 'e', 'f'].map(C), 4); // 4 cols, 2 rows
  assert.equal(selectionText(textGrid, 4, { c0: 0, r0: 0, c1: 3, r1: 1 }), 'a漢b\ncdef');
  assert.equal(selectionText(textGrid, 4, { c0: 1, r0: 0, c1: 2, r1: 0 }), '漢');        // lead and trail
  assert.equal(selectionText(textGrid, 4, { c0: 2, r0: 0, c1: 3, r1: 0 }), 'b');         // starting on a trail: nothing for it
  assert.equal(selectionText([], 4, { c0: 0, r0: 0, c1: 1, r1: 0 }), '  ');           // no cells (yet): spaces
});

test('an edit lays out only its rows again: the other rows keep their layout, and the result is the whole grid\'s', () => {
  const C = (char) => ({ char, fg: { hex: '#fff' }, bg: { hex: '#000' } });
  const before = ['a', '漢', 'b', 'c', '字', 'd', 'e', 'f', '░', 'g', 'h', '漢'].map(C); // 3 rows of 4
  const laid = layoutWide(before, 4);
  const after = before.slice();
  after[5] = C('漢'); // row 1 gets a wide character
  after[8] = C('x');  // row 2 changes too, to nothing wide
  const relaid = layoutWideRows(after, 4, laid, [1, 2]);
  assert.deepEqual(relaid.map(c => [c.char, c.wide]), layoutWide(after, 4).map(c => [c.char, c.wide]));
  assert.equal(relaid[0], laid[0]);                                                          // untouched rows: the same cells
  assert.equal(relaid[11].char, ' ');                                                         // a wide character in the last column, as before
});

test('Color ASCII weighs a cell by intensity, its strongest channel, so pure colors get the heaviest character; Monochrome by brightness', () => {
  const px = (r, g, b) => ({ r, g, b });
  const red = px(255, 0, 0), blue = px(0, 0, 255), white = px(255, 255, 255), darkRed = px(128, 0, 0), black = px(0, 0, 0);
  for (const color of [red, blue, white]) assert.equal(weightedChar(color, color, ' .#', 'intensity'), '#');
  assert.equal(weightedChar(darkRed, darkRed, ' .#', 'intensity'), '.');
  assert.equal(weightedChar(black, black, ' .#', 'intensity'), ' ');
  assert.equal(weightedChar(red, black, ' .#', 'intensity'), '.');                // a cell is its two halves' average
  assert.equal(weightedChar(red, red, ' .#', 'brightness'), ' ');                 // red is dark to the eye: light in Monochrome
  assert.equal(weightedChar(white, white, ' .#', 'brightness'), '#');
  const cells = buildCells([red, blue, red, blue], 2, 2, { charset: ' .#', charMode: 'intensity', renderStyle: 'colorAscii', seed: 's' });
  assert.deepEqual(cells.map((c) => c.char), ['#', '#']);
});
