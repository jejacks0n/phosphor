import { describe, it, expect } from 'vitest';
import { writePaletteFile, readPaletteFile, paletteFileName } from '../../src/lib/PaletteFile.js';
import { t } from '../../src/i18n/index.js';

const glyphs = ['☺', '', '♥', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', ''];

describe('palette files', () => {
  it('writes and reads back names, glyphs with their empty slots, and ties', () => {
    const list = [
      { name: 'Frogs', glyphs, font: { id: 'f1', name: 'TEST', height: 16 } },
      { name: 'Plain', glyphs: Array(12).fill(''), font: null },
    ];
    expect(readPaletteFile(writePaletteFile(list), 'x')).toEqual(list);
  });

  it('normalizes what it can', () => {
    const text = JSON.stringify({
      phosphor: 'palettes',
      version: 1,
      palettes: [
        { name: 'A', glyphs: [...glyphs, 'z'], font: { id: 'f', name: 'N', height: 8 } },
        { glyphs: [5, null, 'x'], font: { name: 'no id', height: 8 } },
        { name: 'C', glyphs: [], font: { id: 'f', name: 'N', height: 40 } },
      ],
    });
    const [a, b, c] = readPaletteFile(text, 'x');
    expect(a.glyphs).toEqual(glyphs);
    expect(b.glyphs).toEqual(['', '', 'x', ...Array(9).fill('')]);
    expect(b.name).toBe(t('palette.untitled'));
    expect(b.font).toBeNull();
    expect(c.font).toBeNull();
  });

  it("refuses what isn't a palette file", () => {
    for (const text of [
      'not json',
      '{}',
      '{"phosphor":"palettes","version":2,"palettes":[{}]}',
      '{"phosphor":"palettes","version":1,"palettes":[]}',
    ]) {
      expect(() => readPaletteFile(text, 'bad.json')).toThrow(/bad\.json/);
    }
  });

  it('names the file', () => {
    expect(paletteFileName('My Frogs')).toBe('My Frogs.palettes.json');
    expect(paletteFileName('')).toBe('palettes.palettes.json');
  });
});
