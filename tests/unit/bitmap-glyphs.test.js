import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as Font from '@/lib/BitmapFont.js';
import * as Glyphs from '@/lib/BitmapGlyphs.js';

describe('BitmapGlyphs', () => {
  it('loads under plain Node', () => {
    expect(() =>
      execFileSync('node', ['--input-type=module', '-e', "const m = await import('./src/lib/BitmapGlyphs.js'); if (typeof m.findBlocks !== 'function' || typeof m.fontId !== 'function') process.exit(1)"]),
    ).not.toThrow();
  });

  it('is what BitmapFont re-exports', () => {
    for (const name of ['findBlocks', 'fontId', 'maskOf', 'glyphRows', 'BLOCKS', 'CP437_BLOCKS', 'ownWidthOf', 'narrowWidthOf', 'NARROW_WIDTHS']) {
      expect(Font[name]).toBe(Glyphs[name]);
    }
  });

  const fontWith = (lit, h = 8) => {
    const bytes = new Uint8Array(256 * h);
    for (const [slot, row, col] of lit) bytes[slot * h + row] |= 0x80 >> col;
    return { height: h, bytes };
  };
  const widthFont = (col) => fontWith([[65, 0, col]]);

  it('ownWidthOf: the rightmost lit column of any glyph, plus one', () => {
    expect(Glyphs.ownWidthOf(fontWith([[65, 3, 6], [66, 0, 0]]))).toBe(7);
    expect(Glyphs.ownWidthOf(fontWith([[219, 2, 7]], 16))).toBe(8);
  });

  it('ownWidthOf: a blank font is 8', () => {
    expect(Glyphs.ownWidthOf(fontWith([]))).toBe(8);
  });

  it('narrowWidthOf: 4–7 only', () => {
    expect(Glyphs.NARROW_WIDTHS).toEqual([4, 5, 6, 7]);
    expect([2, 3, 6, 7].map((c) => Glyphs.narrowWidthOf(widthFont(c)))).toEqual([null, 4, 7, null]);
  });
});
