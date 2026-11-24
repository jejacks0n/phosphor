import { describe, it, expect } from 'vitest';
import { glyphMask, drawArtCells } from '../../src/lib/glyphPicture.js';
import { slotOf, drawnMaskOf } from '../../src/lib/BitmapFont.js';
import { referenceMask } from '../../src/lib/GlyphCoverage.js';
import { fontWith } from '../support/blockFonts.js';

const canvasOf = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c.getContext('2d');
};
const pixel = (ctx, x, y) => [...ctx.getImageData(x, y, 1, 1).data];

describe('glyphMask', () => {
  it('reads the reference font for blocks, spaces and letters', () => {
    expect([...glyphMask('█', 4, 8)].every((v) => v === 1)).toBe(true);
    expect([...glyphMask(' ', 4, 8)].every((v) => v === 0)).toBe(true);
    const half = glyphMask('▀', 4, 8);
    expect([...half.slice(0, 16)].every((v) => v === 1)).toBe(true);
    expect([...half.slice(16)].every((v) => v === 0)).toBe(true);
    const a = glyphMask('A', 4, 8);
    expect(a.some((v) => v > 0)).toBe(true);
    expect(a.some((v) => v === 0)).toBe(true);
  });

  it('reads the drawing font when it has the character', () => {
    // a font whose 'A' is a left-column bar, nothing like the reference A
    const font = fontWith({ 65: (h) => Array.from({ length: h }, () => 0x80) });
    const slot = slotOf('A', font);
    expect(slot).not.toBeNull();
    const mask = glyphMask('A', 4, 8, font);
    expect([...mask]).toEqual([...drawnMaskOf(font, slot, 4, 8)]);
    expect([...mask]).not.toEqual([...referenceMask('A', 4, 8)]);
  });
});

describe('drawArtCells', () => {
  it('draws a full block in its foreground and a space in its background', () => {
    const ctx = canvasOf(8, 8);
    drawArtCells(ctx, [
      { col: 0, row: 0, char: '█', fg: '#ff0000', bg: '#000000' },
      { col: 1, row: 0, char: ' ', fg: '#ffffff', bg: '#0000ff' },
    ], 4);
    expect(pixel(ctx, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(ctx, 3, 7)).toEqual([255, 0, 0, 255]);
    expect(pixel(ctx, 4, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(ctx, 7, 7)).toEqual([0, 0, 255, 255]);
  });

  it('draws a wide character over both cells and skips the one after it', () => {
    const ctx = canvasOf(12, 8);
    drawArtCells(ctx, [
      { col: 0, row: 0, char: '漢', fg: '#ff0000', bg: '#000000' },
      { col: 1, row: 0, char: '█', fg: '#00ff00', bg: '#000000' },
      { col: 2, row: 0, char: '█', fg: '#00ff00', bg: '#000000' },
    ], 4);
    let left = 0, right = 0, nextCell = 0;
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const [r, g] = pixel(ctx, x, y);
        if (r > 0) (x < 4 ? left++ : right++);
        if (g > 0) nextCell++;
      }
    }
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(nextCell).toBe(0);
    expect(pixel(ctx, 8, 0)).toEqual([0, 255, 0, 255]);
  });

  it('draws a missing foreground and background as black', () => {
    const ctx = canvasOf(4, 8);
    drawArtCells(ctx, [{ col: 0, row: 0, char: '█' }], 4);
    expect(pixel(ctx, 1, 1)).toEqual([0, 0, 0, 255]);
  });
});
