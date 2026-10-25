// The ANSI view's canvas renderer: its backing size stays under the browsers' canvas limits, its
// cells snap to whole device pixels (an even height, so the halves match), block characters are
// exact rectangles, and each cell's colors and 16-bit glyph index pack into the data textures.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { backingScale, cellGeometry, blockMask, packCells, packSpills, MAX_BACKING_AREA } from '../../src/lib/CellCanvas.js';

test("The ANSI view's canvas renderer: its backing size stays under the browsers' canvas limits, its cells snap to whole device pixels (an even height, so the halves match), block characters are exact rectangles, and each cell's colors and 16-bit glyph index pack into the data textures", async () => {
  assert.equal(backingScale(800, 600, 2), 2);                                    // small grid: full dpr
  const s = backingScale(2040, 3060, 2);                                         // 200x300 at dpr 2 is 25M px: capped
  assert.ok(s < 2 && s * 2040 * s * 3060 <= MAX_BACKING_AREA + 1);
  assert.equal(backingScale(2040, 3060, 1), 1);                                  // under the cap at dpr 1

  assert.deepEqual(cellGeometry(10.2, 2), { cw: 20, ch: 40, cellWidth: 10, lineHeight: 20 });
  assert.deepEqual(cellGeometry(10.2, 1), { cw: 10, ch: 20, cellWidth: 10, lineHeight: 20 });
  assert.equal(cellGeometry(10.2, 1.601).ch % 2, 0);                            // even at any scale
  const capped = cellGeometry(10.2, backingScale(200 * 10.2, 300 * 20.4, 2), true); // rounded down under the cap
  assert.ok(200 * capped.cw * 300 * capped.ch <= MAX_BACKING_AREA);

  const ink = (m, cw, x, y) => m[y * cw + x] === 255;
  const full = blockMask('█', 4, 4), top = blockMask('▀', 4, 4), bottom = blockMask('▄', 4, 4);
  assert.ok(full.every(v => v === 255));
  assert.ok(ink(top, 4, 0, 0) && ink(top, 4, 3, 1) && !ink(top, 4, 0, 2));
  assert.ok(!ink(bottom, 4, 0, 1) && ink(bottom, 4, 3, 3));
  assert.ok(blockMask(' ', 4, 4).every(v => v === 0));
  const left = blockMask('▌', 5, 2), right = blockMask('▐', 5, 2);               // odd width: they still tile
  assert.ok(left.every((v, i) => (v === 255) !== (right[i] === 255)));
  const q = blockMask('▚', 4, 4);                                                // top-left + bottom-right
  assert.ok(ink(q, 4, 0, 0) && !ink(q, 4, 3, 0) && !ink(q, 4, 0, 3) && ink(q, 4, 3, 3));
  assert.ok(ink(blockMask('▙', 4, 4), 4, 0, 0) && !ink(blockMask('▙', 4, 4), 4, 3, 0)); // all but top-right
  assert.equal(blockMask('A', 4, 4), null);

  const fg = new Uint8Array(12), bg = new Uint8Array(12);
  const glyphOf = (cell) => (cell.wide === 'trail' ? 0x0102 : 0x1234);          // a wide character's halves are separate glyphs
  packCells([{ char: 'x', fg: { r: 1, g: 2, b: 3 }, bg: { r: 4, g: 5, b: 6 } }, undefined, { char: '漢', wide: 'trail', fg: { r: 7, g: 8, b: 9 }, bg: { r: 0, g: 0, b: 0 } }], 3, glyphOf, fg, bg);
  assert.deepEqual([...fg], [1, 2, 3, 0x34, 0, 0, 0, 0, 7, 8, 9, 0x02]);        // index low byte; a missing cell is zeros
  assert.deepEqual([...bg], [4, 5, 6, 0x12, 0, 0, 0, 0, 0, 0, 0, 0x01]);        // index high byte

  // Spills (a character drawing over the cells after it): its fg rgb + the slice's index low byte, and
  // the high byte with a 255 'present' flag; cells nothing spills over are zeros.
  const ov = new Uint8Array(12), ovHi = new Uint8Array(12);
  const src = { char: '﷽', fg: { r: 9, g: 8, b: 7 }, bg: { r: 0, g: 0, b: 0 } };
  const sliceOf = (cell, k) => 0x0300 + k;
  packSpills([src, {}, {}], [null, { from: 0, slice: 1 }, { from: 0, slice: 2 }], 3, sliceOf, ov, ovHi);
  assert.deepEqual([...ov], [0, 0, 0, 0, 9, 8, 7, 0x01, 9, 8, 7, 0x02]);
  assert.deepEqual([...ovHi], [0, 0, 0, 0, 0x03, 255, 0, 0, 0x03, 255, 0, 0]);
});
