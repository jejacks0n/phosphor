import { describe, it, expect } from 'vitest';
import { charsetPresetsFor } from '@/lib/charsetPresets.js';
import { cp437Font } from '../support/blockFonts.js';

const STOCK = [{ name: 'Shades', chars: '░▒' }, { name: 'Halves', chars: '▀▄' }];
const withSets = (hideStock, sets) => ({ ...cp437Font, name: 'NELL', sets: { hideStock, sets } });
const own = [{ id: 's1', name: 'Pipes', slots: [65, 66] }];

describe('charsetPresetsFor', () => {
  it('is the stock list, ungrouped, with no font or a font without sets', () => {
    expect(charsetPresetsFor(null, STOCK, 'Stock')).toBe(STOCK);
    expect(charsetPresetsFor(withSets(false, []), STOCK, 'Stock')).toBe(STOCK);
  });

  it("puts the font's sets first, grouped by its name, then the stock sets", () => {
    const list = charsetPresetsFor(withSets(false, own), STOCK, 'Stock');
    expect(list.map((p) => [p.name, p.chars, p.group])).toEqual([
      ['Pipes', 'AB', 'NELL'], ['Shades', '░▒', 'Stock'], ['Halves', '▀▄', 'Stock'],
    ]);
  });

  it("offers only the font's sets when it hides the stock ones", () => {
    expect(charsetPresetsFor(withSets(true, own), STOCK, 'Stock').map((p) => p.name)).toEqual(['Pipes']);
  });

  it('offers the stock sets when it hides them but has none of its own', () => {
    expect(charsetPresetsFor(withSets(true, []), STOCK, 'Stock')).toBe(STOCK);
  });
});
