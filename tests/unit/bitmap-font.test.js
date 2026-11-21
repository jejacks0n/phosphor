import { describe, expect, it } from 'vitest';
import { SLOT_CHARS, slotOf, fitFont, fontChars, fitCells, fontName, parseRawFont, glyphRows, inkOf, maskOf, fontId, encodeFont, decodeFont, parseFontSheet, fontSheet, CP437_BLOCKS, findBlocks, slotChars, fontKey, encodeBlocks, decodeBlocks, withBlock, hasQuadrants } from '@/lib/BitmapFont.js';
import { cp437Font, font8, lowerAt240, noLowerHalf, solidAt220, lightAt240, slantedLike, nineRowFontWithLowerHalfRows4to8, nineRowFontWithLowerHalfRows5to8 } from '../support/blockFonts.js';

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
    expect(fitCells([undefined, { char: '▙' }])).toEqual([undefined, { char: '▄' }]); // a hole in the grid stays one, as layoutWide leaves it
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

describe('blocks', () => {
  it('a bitmap font has no quadrants; no font (the display fonts) has them all', () => {
    expect(hasQuadrants(null)).toBe(true);
    expect(hasQuadrants(cp437Font)).toBe(false);
    expect(hasQuadrants(font8)).toBe(false);
  });
  it('finds the eight blocks where CP437 puts them', () => {
    expect(findBlocks(cp437Font)).toEqual([219, 220, 223, 221, 222, 176, 177, 178]);
  });
  it('finds a block that moved, and blocks offset a pixel or a row long', () => {
    expect(findBlocks(lowerAt240)[1]).toBe(240); // slot 220 holds a mark
    expect(findBlocks(slantedLike)).toEqual(CP437_BLOCKS);
  });
  it('finds nothing for a block the font lacks', () => { expect(findBlocks(noLowerHalf)[1]).toBeNull(); });
  it('gives a slot to one block at most, in BLOCKS order', () => {
    expect(findBlocks(solidAt220)).toEqual([220, null, 223, 221, 222, 176, 177, 178]);
  });
  it('takes no other slot for a shade', () => { expect(findBlocks(lightAt240)[5]).toBeNull(); });
  it('finds the lower half of an odd-height font', () => {
    expect(findBlocks(nineRowFontWithLowerHalfRows4to8)[1]).toBe(220);
    expect(findBlocks(nineRowFontWithLowerHalfRows5to8)[1]).toBe(220);
  });
  it('maps the block characters to the font\u2019s block slots, and the characters they displace to the slots left', () => {
    const chars = slotChars(lowerAt240);
    expect(chars[240]).toBe('▄');
    expect(chars[220]).toBe('≡'); // CP437's character at 240
    expect(slotOf('▄', lowerAt240)).toBe(240);
    expect(new Set(chars).size).toBe(256);
  });
  it('holds a slot no character is left for as a private-use character', () => {
    expect(slotChars(noLowerHalf)[220]).toBe(String.fromCodePoint(0xE000 + 220));
    expect(slotOf('▄', noLowerHalf)).toBeNull();
  });
  it('draws a character with no slot in the font blank', () => {
    expect(fitFont('▄', noLowerHalf)).toBe(' ');
    expect(fitFont('é', null)).toBe('é');
  });
  it('keys a font by its bytes, and by its blocks once they differ from CP437', () => {
    expect(fontKey(cp437Font)).toBe(fontId(cp437Font));
    expect(fontKey(lowerAt240)).toBe(`${fontId(lowerAt240)}-219.240.223.221.222.176.177.178`);
    expect(fontKey({ ...cp437Font, blocks: withBlock(CP437_BLOCKS, 'dark', null) })).toMatch(/\.x$/);
  });
  it('round-trips blocks as text, a slot shared by blocks too', () => {
    const blocks = [219, 240, 223, 221, 222, 176, 177, null];
    expect(encodeBlocks(CP437_BLOCKS)).toBe('219.220.223.221.222.176.177.178');
    expect(decodeBlocks(encodeBlocks(blocks))).toEqual(blocks);
    expect(decodeBlocks('219.220.223.221.222.176.176.176')).toEqual([219, 220, 223, 221, 222, 176, 176, 176]);
    expect(decodeBlocks('')).toBeUndefined();
    expect(decodeBlocks(undefined)).toBeUndefined();
    expect(decodeBlocks('219.220')).toBeUndefined();
    expect(decodeBlocks('219.256.223.221.222.176.177.178')).toBeUndefined();
  });
  it('gives a block a slot another block has, and leaves that block on it', () => {
    expect(withBlock(CP437_BLOCKS, 'dark', 176)).toEqual([219, 220, 223, 221, 222, 176, 177, 176]);
  });
  it('draws every block at a shared slot from it, and holds the slot as its CP437 home\u2019s block, else the first', () => {
    const shades = { ...cp437Font, blocks: [219, 220, 223, 221, 222, 177, 177, 177] }; // all three at ▒'s home
    expect(['░', '▒', '▓'].map((c) => slotOf(c, shades))).toEqual([177, 177, 177]);
    expect(slotChars(shades)[177]).toBe('▒');
    expect(fitFont('▓', shades)).toBe('▓'); // a slot, so not a stand-in
    const away = { ...cp437Font, blocks: [219, 220, 223, 221, 222, 240, 240, 240] }; // at nobody's home
    expect(slotChars(away)[240]).toBe('░');
    expect(new Set(slotChars(shades)).size).toBe(256);
    expect(new Set(slotChars(away)).size).toBe(256);
  });
});
