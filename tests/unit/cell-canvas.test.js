// The ANSI view's canvas renderer: its backing size stays under the browsers' canvas limits, its
// cells snap to whole device pixels (an even height, so the halves match; an odd bitmap font's own), block characters are
// exact rectangles, and each cell's colors and 16-bit glyph index pack into the data textures.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { backingScale, cellGeometry, gridYAt, gridAt, splitOf, blockMask, packCells, packSpills, MAX_BACKING_AREA } from '../../src/lib/CellCanvas.js';

test("The ANSI view's canvas renderer: its backing size stays under the browsers' canvas limits, its cells snap to whole device pixels (an even height, so the halves match; an odd bitmap font's own), block characters are exact rectangles, and each cell's colors and 16-bit glyph index pack into the data textures", async () => {
  assert.equal(backingScale(800, 600, 2), 2);                                    // small grid: full dpr
  const s = backingScale(2040, 3060, 2);                                         // 200x300 at dpr 2 is 25M px: capped
  assert.ok(s < 2 && s * 2040 * s * 3060 <= MAX_BACKING_AREA + 1);
  assert.equal(backingScale(2040, 3060, 1), 1);                                  // under the cap at dpr 1
  assert.equal(backingScale(800, 20400, 2, 16384), 16384 / 20400);               // 1000 lines tall: no side past the GPU's largest buffer

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

test('an odd-height bitmap font is its own height; an even one and a TrueType font keep an even cell', () => {
  const eleven = { size: 11, lineHeight: 1, bitmap: true, height: 11 }, sixteen = { size: 16, lineHeight: 1, bitmap: true, height: 16 };
  assert.equal(cellGeometry(8, 1, false, eleven).ch, 11);
  assert.equal(cellGeometry(8, 2, false, eleven).ch, 22);
  assert.equal(cellGeometry(8, 1.03, false, sixteen).ch, 16);   // 16.48 still evens to 16
  assert.equal(cellGeometry(8, 1.04, false, sixteen).ch, 16);   // 16.64: even (today's rounding), not 17
  const vga = { size: 16, lineHeight: 1 };                       // a TrueType-style spec: no bitmap, no height
  for (let s = 0.5; s <= 4; s += 0.01) assert.equal(cellGeometry(8, s, false, vga).ch, Math.round((16 * s) / 2) * 2);
});

test('a capped cell rounds its height down, so a window of lines stays under the largest side', () => {
  // JetBrains Mono's 20.4 px line (no font given) and a 16 px TrueType spec, in windows 40 columns wide and 500 to 5000 lines tall at dpr 2:
  // every one stays at or under 16384 device px. 513 lines was 32 px a cell (16416 px) when the height rounded up.
  assert.equal(cellGeometry(10.2, backingScale(40 * 10.2, 513 * 20.4, 2, 16384), true).ch, 30);
  for (const [font, line] of [[undefined, 20.4], [{ size: 16, lineHeight: 1 }, 16]]) {
    for (let rows = 500; rows <= 5000; rows++) {
      const scale = backingScale(40 * 10.2, rows * line, 2, 16384);
      assert.ok(rows * cellGeometry(10.2, scale, true, font).ch <= 16384, `${rows} lines of ${line} px`);
    }
  }
});

test('gridYAt: an even cell is y over half its height; an odd one splits where its halves meet', () => {
  assert.equal(gridYAt(7.3, { lineHeight: 16, odd: false }), 7.3 / 8);
  const m = { lineHeight: 11, odd: true, upper: 5 };
  assert.equal(gridYAt(0, m), 0);
  assert.equal(gridYAt(5, m), 1);
  assert.equal(gridYAt(8, m), 1.5);
  assert.equal(gridYAt(11, m), 2);
  assert.equal(gridYAt(16, m), 3);
  assert.equal(gridYAt(22, m), 4);
});

test("an odd font's split follows its rows at any scale, whatever the device parity; others say nothing", () => {
  const eleven = { size: 11, lineHeight: 1, bitmap: true, height: 11 };
  assert.deepEqual(splitOf(eleven, 11), { odd: true, upper: 5 });            // scale 1: ch 11
  assert.deepEqual(splitOf(eleven, 11), { odd: true, upper: 5 });            // scale 2: ch 22 is 11 CSS px, the split still 5
  const m = { lineHeight: 11, ...splitOf(eleven, 11) };
  assert.equal(gridYAt(5, m), 1);
  assert.equal(gridYAt(11, m), 2);
  assert.equal(cellGeometry(8, 1.5, false, eleven).ch, 17);                  // scale 1.5: 17 device px, 11.333 CSS px
  assert.ok(Math.abs(splitOf(eleven, 17 / 1.5).upper - 5.151515151515151) < 1e-12); // 5/11 of it
  assert.deepEqual(splitOf({ size: 16, lineHeight: 1, bitmap: true, height: 16 }, 16), {});
  assert.deepEqual(splitOf({ size: 16, lineHeight: 1 }, 16), {});
});

test('gridAt: the pointer conversions share the cell split; an even unit is a plain division', () => {
  const even = { x: 8, y: 8 }, odd = { x: 8, y: 5.5, lineHeight: 11, odd: true, upper: 5 };
  assert.deepEqual(gridAt({ x: 16, y: 12 }, even), { x: 2, y: 1.5 });
  assert.deepEqual(gridAt({ x: 16, y: 5 }, odd), { x: 2, y: 1 });             // where an 8x11 cell's halves meet
  assert.deepEqual(gridAt({ x: 4, y: 16 }, odd), { x: 0.5, y: 3 });             // the second cell's bottom pixel starts at 16
});
