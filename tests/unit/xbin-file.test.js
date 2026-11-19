import { describe, expect, it } from 'vitest';
import { isXBin, readXBin, writeXBin } from '@/lib/XBinFile.js';
import { SLOT_CHARS } from '@/lib/BitmapFont.js';
import { readSauce } from '@/lib/Sauce.js';

const font = { name: 'f', height: 8, bytes: Uint8Array.from({ length: 2048 }, (_, i) => i & 0xff) };
const PAL = ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'];
const rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const grid = (cols, rows, at) => Array.from({ length: cols * rows }, (_, i) => at(i % cols, Math.floor(i / cols)));

describe('XBin', () => {
  it('round-trips every byte 0–255', () => {
    const cells = grid(16, 16, (x, y) => ({ char: SLOT_CHARS[y * 16 + x], fg: rgb(PAL[x]), bg: rgb(PAL[15 - y]) }));
    const back = readXBin(writeXBin({ cols: 16, rows: 16, cells, palette: PAL, font, sauce: false }), 'a.xb');
    expect(back.cells.map((c) => c.char)).toEqual(cells.map((c) => c.char));
    expect(back.cells.map((c) => [c.fg, c.bg])).toEqual(cells.map((c) => [c.fg.hex, c.bg.hex]));
    expect([...back.font.bytes]).toEqual([...font.bytes]);
    expect(back.palette).toEqual(PAL);
  });
  it('compresses a row of one cell into one run, never across rows', () => {
    const cells = grid(80, 2, () => ({ char: ' ', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }));
    const bytes = writeXBin({ cols: 80, rows: 2, cells, palette: PAL, font, sauce: false });
    const data = bytes.slice(11 + 48 + 2048);
    // 80 = 64 + 16 per row: [0xFF ' ' attr] [0xCF ' ' attr], twice
    expect([...data]).toEqual([0xff, 32, 7, 0xcf, 32, 7, 0xff, 32, 7, 0xcf, 32, 7]);
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
    const bytes = writeXBin({ cols: 1, rows: 1, cells: [{ char: 'A', fg: rgb(PAL[7]), bg: rgb(PAL[0]) }], palette: PAL, font, sauce: { title: 'T' } });
    expect(readSauce(bytes)).toMatchObject({ dataType: 6, fileType: 0, title: 'T' });
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
});
