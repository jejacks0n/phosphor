import { describe, expect, it } from 'vitest';
import { SLOT_CHARS, slotOf, fitFont, fontChars, fitCells, fontName, parseRawFont, glyphRows, inkOf, maskOf, fontId, encodeFont, decodeFont, parseFontSheet, fontSheet } from '@/lib/BitmapFont.js';

const solidLowerHalf = (h) => { const b = new Uint8Array(256 * h); for (let r = h / 2; r < h; r++) b[220 * h + r] = 0xff; return b; };

describe('slots', () => {
  it('gives each of the 256 slots its own character', () => {
    expect(new Set(SLOT_CHARS).size).toBe(256);
    expect(SLOT_CHARS[0]).toBe('␀');
    expect(SLOT_CHARS[32]).toBe(' ');
    expect(SLOT_CHARS[219]).toBe('█');
    expect(SLOT_CHARS[255]).toBe(' ');
  });
  it('finds every slot back, control glyphs included', () => {
    for (let i = 0; i < 256; i++) expect(slotOf(SLOT_CHARS[i])).toBe(i);
    expect(slotOf('◘')).toBe(8);
    expect(slotOf('▙')).toBe(null);
  });
  it('fits what the font lacks to its nearest CP437 character', () => {
    expect(fitFont('•')).toBe('•'); // slot 7 stays: XBin holds it
    expect(fitFont('▙')).toBe('▄');
    expect(fitFont('😀')).toBe('?');
    expect(fontChars('▙▄█😀')).toBe('▄█?');
  });
  it('fitCells swaps what the font lacks', () => {
    const cells = [{ char: 'A' }, { char: '▙', fg: 1 }];
    const fitted = fitCells(cells);
    expect(fitted[0]).toBe(cells[0]);
    expect(fitted[1]).toEqual({ char: '▄', fg: 1 });
    const same = [{ char: 'A' }];
    expect(fitCells(same)).toBe(same);
  });
});

describe('raw fonts', () => {
  it('is named for its file, less the one extension a font comes in', () => {
    expect(['My Font.F16', 'SHEET.png', 'ACID-55.XB', 'a.F16.png', 'plain', 'v1.2'].map(fontName)).toEqual(['My Font', 'SHEET', 'ACID-55', 'a.F16', 'plain', 'v1.2']);
  });
  it('takes its height from its size', () => {
    expect(parseRawFont(new Uint8Array(256 * 14), 'X.F14').height).toBe(14);
    expect(parseRawFont(new Uint8Array(256), 'one.F01').height).toBe(1);
  });
  it('refuses sizes that are no font', () => {
    expect(() => parseRawFont(new Uint8Array(1000), 'bad')).toThrow();
    expect(() => parseRawFont(new Uint8Array(256 * 33), 'tall')).toThrow();
    expect(() => parseRawFont(new Uint8Array(0), 'empty')).toThrow();
  });
  it('measures a glyph by its pixels', () => {
    const font = { name: 'f', height: 16, bytes: solidLowerHalf(16) };
    expect(glyphRows(font, 220)[15]).toBe(0xff);
    expect(inkOf(font, 220)).toEqual([0, 1]);
    const mask = maskOf(font, 220, 4, 8);
    expect(mask.slice(0, 16).every((v) => v === 0)).toBe(true);
    expect(mask.slice(16).every((v) => v === 1)).toBe(true);
  });
  it('splits an odd height evenly', () => {
    const bytes = new Uint8Array(256 * 3); bytes[65 * 3 + 1] = 0xff; // the middle row of 3
    expect(inkOf({ name: 'f', height: 3, bytes }, 65)).toEqual([1 / 3, 1 / 3]);
  });
  it('round-trips through its setting', () => {
    const font = { name: 'f', height: 8, bytes: Uint8Array.from({ length: 2048 }, (_, i) => i % 251) };
    const back = decodeFont(encodeFont(font), 'f');
    expect(back.height).toBe(8);
    expect([...back.bytes]).toEqual([...font.bytes]);
    expect(fontId(back)).toBe(fontId(font));
    expect(decodeFont('', 'f')).toBe(null);
  });
  it('round-trips through a PNG sheet', () => {
    const font = { name: 'f', height: 8, bytes: Uint8Array.from({ length: 2048 }, (_, i) => (i * 37) & 0xff) };
    const sheet = fontSheet(font);
    expect([sheet.width, sheet.height]).toEqual([128, 128]);
    expect([...parseFontSheet(sheet, 'f').bytes]).toEqual([...font.bytes]);
    expect(() => parseFontSheet({ width: 100, height: 128, data: new Uint8ClampedArray(100 * 128 * 4) }, 'f')).toThrow();
  });
});
