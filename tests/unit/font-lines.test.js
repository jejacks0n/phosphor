import { describe, it, expect } from 'vitest';
import { CP437_BLOCKS, slotChars, withBlock } from '@/lib/BitmapFont.js';
import {
  encodeLines, decodeLines, encodeSets, decodeSets, lineStylesOf, offeredStyles, styleById, fontSetsOf, showsStockSets, nextId,
} from '@/lib/FontLines.js';
import { drawnStyle, drawnValue } from '@/tools/lineChoice.js';
import { cp437Font } from '../support/blockFonts.js';

const heavy = { id: 'l1', name: 'Heavy', slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const withLines = (lines, extra = {}) => ({ ...cp437Font, lines, ...extra });
const nulls = Array(11).fill(null);

describe('encodeLines and decodeLines', () => {
  it('round-trip a style and a hide', () => {
    const input = { hide: ['double'], styles: [heavy] };
    expect(decodeLines(encodeLines(input))).toEqual(input);
    expect(encodeLines({})).toBe('');
    expect(decodeLines('')).toBeNull();
  });

  it("drop what isn't a style", () => {
    const text = JSON.stringify({
      hide: ['single', 'bogus'],
      styles: [
        { id: 'l1', name: 'ok', slots: nulls },
        { id: 'l2', slots: [1] },
        { id: 3, name: 'x', slots: Array(11).fill(1) },
        { id: 'l4', name: 'y', slots: [300, ...Array(10).fill(1)] },
      ],
    });
    expect(decodeLines(text)).toEqual({ hide: ['single'], styles: [{ id: 'l1', name: 'ok', slots: nulls }] });
    expect(decodeLines('{')).toBeNull();
    expect(decodeLines('[]')).toBeNull();
    const long = decodeLines(encodeLines({ styles: [{ ...heavy, name: 'a'.repeat(100) }] }));
    expect(long.styles[0].name).toHaveLength(40);
  });

  it('drop a style named for Single or Double, or one whose id came before', () => {
    const style = (id, name) => ({ id, name, slots: Array(11).fill(1) });
    const text = JSON.stringify({ styles: [style('single', 'a'), style('double', 'b'), style('l1', 'c'), style('l1', 'd')] });
    expect(decodeLines(text).styles).toEqual([style('l1', 'c')]);
  });
});

describe('decodeSets', () => {
  it('drops bad sets, keeps a new empty one and hideStock', () => {
    const text = encodeSets({ hideStock: true, sets: [{ id: 's1', name: 'Grit', slots: [250, 250, 176] }, { id: 's2', name: 'none', slots: [] }, { id: 's3', name: 'bad', slots: [256] }] });
    expect(decodeSets(text)).toEqual({ hideStock: true, sets: [{ id: 's1', name: 'Grit', slots: [250, 250, 176] }, { id: 's2', name: 'none', slots: [] }] });
    expect(decodeSets('')).toBeNull();
    expect(decodeSets('{')).toBeNull();
  });

  it('drops a set whose id came before', () => {
    const text = encodeSets({ sets: [{ id: 's1', name: 'a', slots: [1] }, { id: 's1', name: 'b', slots: [2] }] });
    expect(decodeSets(text).sets).toEqual([{ id: 's1', name: 'a', slots: [1] }]);
  });
});

describe('lineStylesOf', () => {
  it('offers Single and Double with no font', () => {
    expect(offeredStyles(null).map((s) => s.id)).toEqual(['single', 'double']);
    expect(styleById(null, 'single').chars).toEqual([...'─│┌┐└┘├┤┬┴┼']);
  });

  it('offers a style with every piece set after Single and Double', () => {
    const font = withLines({ hide: [], styles: [heavy] });
    expect(offeredStyles(font).map((s) => s.id)).toEqual(['single', 'double', 'l1']);
    expect(offeredStyles(font)).toBe(offeredStyles(font));
    expect(styleById(font, 'l1').chars).toEqual(slotChars(font).slice(1, 12));
  });

  it('lists a style missing pieces without offering it', () => {
    const font = withLines({ hide: [], styles: [{ id: 'l1', name: 'Half', slots: [250, 249, ...Array(9).fill(null)] }] });
    const s = styleById(font, 'l1');
    expect(s.offered).toBe(false);
    expect(s.problems).toEqual(Array.from({ length: 9 }, (_, i) => ({ piece: i + 2, reason: 'missing' })));
  });

  it("doesn't offer a hidden Single", () => {
    const s = styleById(withLines({ hide: ['single'], styles: [] }), 'single');
    expect(s.offered).toBe(false);
    expect(s.hidden).toBe(true);
  });

  it('leaves Single unoffered when a block sits on one of its slots', () => {
    const font = { ...cp437Font, blocks: withBlock(CP437_BLOCKS, 'lower', 196) };
    const single = styleById(font, 'single');
    expect(single.offered).toBe(false);
    expect(single.problems).toContainEqual({ piece: 0, reason: 'block', block: 'lower' });
    const custom = withLines({ hide: [], styles: [{ id: 'l1', name: 'x', slots: [220, ...Array(10).fill(null).map((_, i) => 1 + i)] }] });
    expect(styleById(custom, 'l1').problems).toContainEqual({ piece: 0, reason: 'block', block: 'lower' });
  });

  it('is the same list for the same font', () => {
    expect(lineStylesOf(cp437Font)).toBe(lineStylesOf(cp437Font));
  });
});

describe('sets', () => {
  it("gives each set's characters in the font", () => {
    const font = { ...cp437Font, sets: { hideStock: false, sets: [{ id: 's1', name: 'G', slots: [65, 66] }] } };
    expect(fontSetsOf(font)).toEqual([{ id: 's1', name: 'G', chars: slotChars(font)[65] + slotChars(font)[66] }]);
  });

  it('offers no set until it has a slot, and shows the stock sets while only empty ones are hidden behind', () => {
    const font = { ...cp437Font, sets: { hideStock: true, sets: [{ id: 's1', name: 'New', slots: [] }] } };
    expect(fontSetsOf(font)).toEqual([]);
    expect(showsStockSets(font)).toBe(true);
  });

  it('shows stock sets when there are no sets even when hidden', () => {
    expect(showsStockSets({ sets: { hideStock: true, sets: [] } })).toBe(true);
    expect(showsStockSets({ sets: { hideStock: true, sets: [{ id: 's1', name: 'G', slots: [1] }] } })).toBe(false);
    expect(showsStockSets(null)).toBe(true);
  });
});

describe('nextId', () => {
  it('skips past the highest', () => {
    expect(nextId([{ id: 'l1' }, { id: 'l4' }], 'l')).toBe('l5');
    expect(nextId([], 's')).toBe('s1');
  });
});

describe('drawnStyle and drawnValue', () => {
  const none = withLines({ hide: ['single', 'double'], styles: [] });
  it('give nothing of a line for what isn\'t a line style', () => {
    expect(drawnStyle('half', null)).toBeNull();
    expect(drawnValue('half', none, 'normal')).toBe('half');
  });

  it('give the first offered style for one the font doesn\'t offer, and the fallback when it offers none', () => {
    const font = withLines({ hide: ['single'], styles: [heavy] });
    expect(drawnStyle('line:l9', font).id).toBe('double');
    expect(drawnValue('single', font, 'half')).toBe('double');
    expect(drawnValue('line:l1', font, 'half')).toBe('line:l1');
    expect(drawnStyle('double', none)).toBeNull();
    expect(drawnValue('double', none, 'half')).toBe('half');
    expect(drawnValue('line:l1', none, 'normal')).toBe('normal');
  });
});
