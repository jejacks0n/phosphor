import { describe, expect, it } from 'vitest';
import { isXBin, readXBin, writeXBin } from '@/lib/XBinFile.js';
import { CP437_BLOCKS, SLOT_CHARS, fontId, withBlock } from '@/lib/BitmapFont.js';
import { cp437Font, lowerAt240 } from '../support/blockFonts.js';
import { readSauce } from '@/lib/Sauce.js';

// Noise glyphs, but for the blocks at CP437's slots (where the reader finds them).
const font = { name: 'f', height: 8, bytes: Uint8Array.from({ length: 2048 }, (_, i) => i & 0xff) };
const rows = (top, bottom) => [...Array(4).fill(top), ...Array(4).fill(bottom)];
const shade = (a, b) => [a, b, a, b, a, b, a, b];
Object.entries({ 219: rows(255, 255), 220: rows(0, 255), 223: rows(255, 0), 221: rows(0xf0, 0xf0), 222: rows(0x0f, 0x0f), 176: shade(0x88, 0x22), 177: shade(0xaa, 0x55), 178: shade(0xdd, 0x77) })
  .forEach(([slot, glyph]) => font.bytes.set(glyph, slot * 8));
const PAL = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
const rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const grid = (cols, rows, at) => Array.from({ length: cols * rows }, (_, i) => at(i % cols, Math.floor(i / cols)));

describe('XBin', () => {
  it('round-trips every byte 0–255', () => {
    // a cell whose colors match goes out as a space, so none here does
    const cells = grid(16, 16, (x, y) => ({ char: SLOT_CHARS[y * 16 + x], fg: rgb(PAL[x]), bg: rgb(PAL[15 - y === x ? (x + 1) % 16 : 15 - y]) }));
    const back = readXBin(writeXBin({ cols: 16, rows: 16, cells, palette: PAL, font, sauce: false }), 'a.xb');
    expect(back.cells.map((c) => c.char)).toEqual(cells.map((c) => c.char));
    expect(back.cells.map((c) => [c.fg, c.bg])).toEqual(cells.map((c) => [c.fg.hex, c.bg.hex]));
    expect([...back.font.bytes]).toEqual([...font.bytes]);
    expect(back.palette).toEqual(PAL);
  });
  it('writes the blocks of a shared slot as that slot, and reads it back as the slot\u2019s own block', () => {
    const shared = { ...font, blocks: [219, 220, 223, 221, 222, 177, 177, 177] };
    const cells = ['░', '▒', '▓'].map((char) => ({ char, fg: rgb(PAL[7]), bg: rgb(PAL[0]) }));
    const back = readXBin(writeXBin({ cols: 3, rows: 1, cells, palette: PAL, font: shared, sauce: false }), 'a.xb');
    expect(back.cells.map((c) => c.char)).toEqual(['▒', '▒', '▒']);
  });
  it('writes a cell whose colors are the same palette color as a space, whatever its character', () => {
    const cells = [
      { char: '▓', fg: rgb(PAL[0]), bg: rgb(PAL[0]) },
      { char: '%', fg: rgb('#010101'), bg: rgb(PAL[0]) }, // a different color, the same one in the file's palette
      { char: '▓', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }, // shows: kept
    ];
    const back = readXBin(writeXBin({ cols: 3, rows: 1, cells, palette: PAL, font, sauce: false }), 'a.xb');
    expect(back.cells.map((c) => c.char)).toEqual([' ', ' ', '▓']);
    expect(back.cells.map((c) => [c.fg, c.bg])).toEqual([[PAL[0], PAL[0]], [PAL[0], PAL[0]], [PAL[7], PAL[0]]]);
  });
  it('compresses a row of one cell into one run, never across rows', () => {
    const cells = grid(80, 2, () => ({ char: ' ', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }));
    const bytes = writeXBin({ cols: 80, rows: 2, cells, palette: PAL, font, sauce: false });
    const data = bytes.slice(11 + 48 + 2048);
    // 80 = 64 + 16 per row: [0xFF ' ' attr] [0xCF ' ' attr], twice
    expect([...data]).toEqual([0xff, 32, 7, 0xcf, 32, 7, 0xff, 32, 7, 0xcf, 32, 7]);
  });
  it('writes a block in the slot its font draws it from', () => {
    const bytes = writeXBin({ cols: 1, rows: 1, cells: [{ char: '▄', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }], palette: PAL, font: lowerAt240, sauce: false });
    expect(bytes[11 + 48 + 256 * 16 + 1]).toBe(240);
  });
  it('reads an XBin through blocks you set for its font', () => {
    const blocks = withBlock(CP437_BLOCKS, 'lower', 254);
    const cell = { char: '▄', fg: rgb(PAL[7]), bg: rgb(PAL[0]) };
    const bytes = writeXBin({ cols: 1, rows: 1, cells: [cell], palette: PAL, font: { ...cp437Font, blocks }, sauce: false });
    expect(bytes[11 + 48 + 256 * 16 + 1]).toBe(254);
    const art = readXBin(bytes, 'a.xb', (id) => (id === fontId(cp437Font) ? blocks : undefined));
    expect(art.cells[0].char).toBe('▄');
    expect(art.font.blocks).toEqual(blocks);
    expect(readXBin(bytes, 'a.xb').font.blocks).toBeUndefined();
  });
  it('fits characters the font lacks', () => {
    const bytes = writeXBin({ cols: 1, rows: 1, cells: [{ char: '▙', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }], palette: PAL, font, sauce: false });
    expect(readXBin(bytes, 'a.xb').cells[0].char).toBe('▄');
  });
  it('reads a file with no palette or font as CGA and CP437', () => {
    const bytes = new Uint8Array([...'XBIN'].map((c) => c.charCodeAt(0)).concat([0x1a, 1, 0, 1, 0, 16, 0, 0, 0x1f]));
    const art = readXBin(bytes, 'a.xb');
    expect(art.font).toBe(null);
    expect(art.cells[0]).toMatchObject({ char: ' ', fg: '#ffffff', bg: '#0000aa' });
  });
  it('writes SAUCE as XBin', () => {
    const bytes = writeXBin({ cols: 1, rows: 1, cells: [{ char: 'A', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }], palette: PAL, font, sauce: { title: 'T', fontName: 'IBM VGA50' } });
    expect(readSauce(bytes)).toMatchObject({ dataType: 6, fileType: 0, title: 'T', fontName: '' }); // the font is in the file: XBin's TInfoS is empty
    expect(readXBin(bytes, 'a.xb').cells[0].char).toBe('A');
  });
  it('refuses broken files', () => {
    const head = (w, h, flags = 0) => new Uint8Array([88, 66, 73, 78, 0x1a, w & 255, w >> 8, h & 255, h >> 8, 16, flags]);
    for (const bytes of [head(1, 1).slice(0, 8), head(0, 1), head(301, 1), head(2, 1), head(1, 1, 0b10000)]) {
      expect(() => readXBin(bytes, 'bad.xb')).toThrow(expect.objectContaining({ userMessage: expect.any(String) }));
    }
    const truncated = writeXBin({ cols: 4, rows: 1, cells: grid(4, 1, () => ({ char: 'A', fg: rgb(PAL[1]), bg: rgb(PAL[2]) })), palette: PAL, font, sauce: false });
    expect(() => readXBin(truncated.slice(0, -1), 'bad.xb')).toThrow(expect.objectContaining({ userMessage: expect.any(String) }));
    expect(isXBin(head(1, 1))).toBe(true);
  });

  // Hand-built files: header, then optional palette (48 bytes) and font, then the cells.
  const file = (cols, rows, flags, ...parts) => Uint8Array.from([88, 66, 73, 78, 0x1a, cols & 255, cols >> 8, rows & 255, rows >> 8, 8, flags, ...parts.flat()]);
  const asc = (text) => [...text].map((c) => c.charCodeAt(0));
  const chars = (art) => art.cells.map((c) => c.char).join('');

  it('reads a run of one character with its own attributes (type 1)', () => {
    const art = readXBin(file(3, 1, 4, [0x42, 65, 0x07, 0x1f, 0x70]), 'a.xb');
    expect(chars(art)).toBe('AAA');
    // blink on: the background is 3 bits
    expect(art.cells.map((c) => [c.fg, c.bg])).toEqual([['#aaaaaa', '#000000'], ['#ffffff', '#0000aa'], ['#000000', '#aaaaaa']]);
  });
  it('reads a run of one attribute with its own characters (type 2)', () => {
    const art = readXBin(file(3, 1, 4, [0x82, 0x1f, ...asc('ABC')]), 'a.xb');
    expect(chars(art)).toBe('ABC');
    expect(art.cells.every((c) => c.fg === '#ffffff' && c.bg === '#0000aa')).toBe(true);
  });
  it('reads a plain run and a run of both (types 0 and 3)', () => {
    const art = readXBin(file(5, 1, 4, [0x02, 65, 7, 66, 7, 67, 0x1f], [0xc1, 68, 0x1f]), 'a.xb');
    expect(chars(art)).toBe('ABCDD');
    expect(art.cells[2].bg).toBe('#0000aa');
  });
  it('expands a 6-bit channel to 8 bits and ignores the two bits above it', () => {
    const art = readXBin(file(1, 1, 1, [0x3f, 0x01, 0xc1], new Array(45).fill(0), [65, 0x00]), 'a.xb');
    expect(art.palette[0]).toBe('#ff0404'); // 0x3f -> ff, 0x01 -> 04, 0xc1 is 0x01 with two bits above it
  });
  it('reads an uncompressed file with a palette and a font', () => {
    const pal = new Array(48).fill(0);
    pal.splice(45, 3, 63, 63, 63); // color 15
    const fontBytes = Array.from({ length: 2048 }, (_, i) => (i * 7) & 0xff);
    const art = readXBin(file(2, 1, 1 | 2 | 8, pal, fontBytes, [0, 0xf0, 65, 0x0f]), 'a.xb');
    expect(chars(art)).toBe('␀A');
    expect([...art.font.bytes]).toEqual(fontBytes);
    expect(art.font.height).toBe(8);
    expect(readXBin(file(2, 1, 2, fontBytes, [65, 7, 66, 7]), 'ACID-55.XB').font.name).toBe('ACID-55'); // named for the file, less its .xb
    // non-blink: the background is 4 bits
    expect(art.cells[0]).toMatchObject({ fg: '#000000', bg: '#ffffff' });
    expect(art.cells[1]).toMatchObject({ fg: '#ffffff', bg: '#000000' });
  });
  it('refuses a run that goes past the last cell', () => {
    expect(() => readXBin(file(2, 1, 4, [0xc2, 65, 7]), 'a.xb')).toThrow(expect.objectContaining({ userMessage: expect.any(String) }));
  });

  const put = (cols, items) => writeXBin({ cols, rows: 1, cells: items.map(([char, k]) => ({ char, fg: rgb(PAL[k]), bg: rgb(PAL[0]) })), palette: PAL, font, sauce: false }).slice(11 + 48 + 2048);
  it('writes a row of mixed run kinds', () => {
    const data = put(12, [['X', 1], ['X', 2], ['X', 3], ['Y', 5], ['Z', 5], ['W', 5], ['P', 1], ['Q', 2], ['R', 7], ['R', 7], ['R', 7], ['R', 7]]);
    expect([...data]).toEqual([0x42, 88, 1, 2, 3, 0x82, 5, 89, 90, 87, 0x01, 80, 1, 81, 2, 0xc3, 82, 7]);
    expect(chars(readXBin(Uint8Array.from([88, 66, 73, 78, 0x1a, 12, 0, 1, 0, 8, 4, ...data]), 'a.xb'))).toBe('XXXYZWPQRRRR');
  });
  it('splits a run of more than 64, and a plain run at 64', () => {
    expect([...put(100, Array.from({ length: 100 }, () => [' ', 7]))]).toEqual([0xff, 32, 7, 0xe3, 32, 7]);
    const data = put(70, Array.from({ length: 70 }, (_, i) => [i % 2 ? 'B' : 'A', i % 2 ? 2 : 1]));
    expect(data.length).toBe(1 + 128 + 1 + 12);
    expect([data[0], data[129]]).toEqual([63, 5]);
  });
  it('writes a 6-bit palette as the channel shifted two bits', () => {
    const pal = [...PAL]; pal[0] = '#ff0483';
    const bytes = writeXBin({ cols: 1, rows: 1, cells: [{ char: 'A', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }], palette: pal, font, sauce: false });
    expect([...bytes.slice(11, 14)]).toEqual([63, 1, 32]);
  });
  it('writes the size of the art in SAUCE, not one an opened file had', () => {
    const bytes = writeXBin({ cols: 1, rows: 1, cells: [{ char: 'A', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }], palette: PAL, font, sauce: { fileSize: 999 } });
    const record = bytes.length - 128;
    expect(bytes[record + 90] | (bytes[record + 91] << 8)).toBe(11 + 48 + 2048 + 3);
  });
});
