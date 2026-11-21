import { expect, it } from 'vitest';
import { ttfOf } from '@/lib/BitmapTtf.js';
import { fontKey } from '@/lib/BitmapFont.js';
import { cp437Font, lowerAt240 } from '../support/blockFonts.js';

const font = (h) => ({ name: 'Test', height: h, bytes: new Uint8Array(256 * h).fill(0x81) });
const tables = (buf) => {
  const v = new DataView(buf), n = v.getUint16(4);
  return Object.fromEntries(Array.from({ length: n }, (_, i) => {
    const at = 12 + i * 16;
    return [String.fromCharCode(...new Uint8Array(buf, at, 4)), { offset: v.getUint32(at + 8), length: v.getUint32(at + 12) }];
  }));
};

it('has the tables a browser needs', () => {
  expect(Object.keys(tables(ttfOf(font(16)))).sort()).toEqual(['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']);
});
it('puts 257 glyphs in it, one per slot and .notdef', () => {
  const buf = ttfOf(font(16)), { maxp } = tables(buf);
  expect(new DataView(buf).getUint16(maxp.offset + 4)).toBe(257);
});
it('sums the whole file to 0xB1B0AFBA', () => {
  const buf = ttfOf(font(14)), v = new DataView(buf.byteLength % 4 ? buf.slice(0, buf.byteLength + 4 - (buf.byteLength % 4)) : buf);
  let sum = 0; for (let i = 0; i < v.byteLength; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  expect(sum).toBe(0xB1B0AFBA);
});
it('writes heights 1 and 32', () => {
  expect(() => ttfOf(font(1))).not.toThrow();
  expect(() => ttfOf(font(32))).not.toThrow();
});
it('sizes its fixed tables as the format says', () => {
  const t = tables(ttfOf(font(16)));
  expect([t.head.length, t.hhea.length, t.maxp.length, t.post.length, t['OS/2'].length]).toEqual([54, 36, 32, 32, 96]);
});
it('declares name lengths that match its bytes, for a name above U+FFFF', () => {
  const buf = ttfOf({ ...font(8), name: 'A😀' }), { name } = tables(buf), v = new DataView(buf);
  const count = v.getUint16(name.offset + 2), storage = v.getUint16(name.offset + 4);
  let end = 0;
  for (let i = 0; i < count; i++) {
    const r = name.offset + 6 + i * 12;
    end = Math.max(end, v.getUint16(r + 8) + v.getUint16(r + 10));
  }
  expect(storage + end).toBe(name.length);
});

// The glyph the cmap gives a code point (format 4).
const glyphFor = (buf, code) => {
  const v = new DataView(buf), { cmap } = tables(buf), sub = cmap.offset + v.getUint32(cmap.offset + 8);
  const n = v.getUint16(sub + 6) / 2, end = sub + 14, start = end + n * 2 + 2, delta = start + n * 2, range = delta + n * 2;
  for (let i = 0; i < n; i++) {
    if (v.getUint16(end + i * 2) < code || v.getUint16(start + i * 2) > code) continue;
    return v.getUint16(range + i * 2) === 0 ? (code + v.getInt16(delta + i * 2)) & 0xffff : null;
  }
  return null;
};
it('maps ▄ to the slot the font draws it from', () => {
  expect(glyphFor(ttfOf(cp437Font), 0x2584)).toBe(221);
  expect(glyphFor(ttfOf(lowerAt240), 0x2584)).toBe(241);
});

it('maps every block of a slot several share to that slot', () => {
  const buf = ttfOf({ ...cp437Font, blocks: [219, 220, 223, 221, 222, 177, 177, 177] });
  expect(['░', '▒', '▓'].map((c) => glyphFor(buf, c.codePointAt(0)))).toEqual([178, 178, 178]); // slot 177 is glyph 178 (.notdef first)
});

// The glyph for a slot, its glyf bytes' xMax (0 when it draws nothing), and the font's advance.
const glyfOf = (buf, slot) => {
  const v = new DataView(buf), t = tables(buf), loca = (i) => v.getUint32(t.loca.offset + i * 4);
  const at = loca(slot + 1), end = loca(slot + 2);
  return end === at ? { xMax: 0 } : { xMax: v.getInt16(t.glyf.offset + at + 6) };
};
const advanceOf = (buf) => new DataView(buf).getUint16(tables(buf).hhea.offset + 10);
const ruled = { name: 'R', height: 8, bytes: Uint8Array.from({ length: 256 * 8 }, (_, i) => (i >> 3 === 0xc4 ? 0x01 : i >> 3 === 0xdc ? 0x01 : i >> 3 === 65 ? 0x03 : 0)) };

it('at 7: the advance is 7 pixels and column 8 draws nothing', () => {
  const lit8 = { name: 'N', height: 8, bytes: new Uint8Array(256 * 8).fill(0xff) };
  const at7 = ttfOf({ ...lit8, cellWidth: 7 });
  expect(advanceOf(at7)).toBe(7 * 64);
  expect(glyfOf(at7, 65).xMax).toBe(7 * 64);
  expect(advanceOf(ttfOf(lit8))).toBe(8 * 64);
});

it('at 9: column 9 repeats column 8 for C4 and a moved lower block\u2019s slot, and is blank for A', () => {
  const font = { ...ruled, bytes: ruled.bytes.slice() };
  font.bytes.set(Array(8).fill(1), 240 * 8);
  const at9 = ttfOf({ ...font, cellWidth: 9, blocks: [219, 240, 223, 221, 222, 176, 177, 178] });
  expect(advanceOf(at9)).toBe(9 * 64);
  expect(glyfOf(at9, 0xc4).xMax).toBe(9 * 64);   // bit 0 lit: column 8, repeated into column 9
  expect(glyfOf(at9, 240).xMax).toBe(9 * 64);    // a moved lower block
  expect(glyfOf(at9, 65).xMax).toBe(8 * 64);     // A: column 9 blank
  expect(glyfOf(at9, 0xdc).xMax).toBe(9 * 64);   // C0-DF always
});

it('at 9: a slot of the font\u2019s own line style repeats too, and one outside every set does not', () => {
  const font = { ...ruled, bytes: ruled.bytes.slice(), cellWidth: 9, lines: { hide: [], styles: [{ id: 'x', name: 'X', slots: [10, null, null, null, null, null, null, null, null, null, null] }] } };
  font.bytes.set(Array(8).fill(1), 10 * 8);
  font.bytes.set(Array(8).fill(1), 11 * 8);
  const buf = ttfOf(font);
  expect(glyfOf(buf, 10).xMax).toBe(9 * 64);
  expect(glyfOf(buf, 11).xMax).toBe(8 * 64);
});

it('fontKey differs by width, and 8 is the id as before', () => {
  const keys = [7, 8, 9].map((cellWidth) => fontKey({ ...ruled, cellWidth }));
  expect(new Set(keys).size).toBe(3);
  expect(fontKey(ruled)).toBe(fontKey({ ...ruled, cellWidth: 8 }));
  expect(keys[1]).not.toMatch(/-w/);
  const own = { ...ruled, lines: { hide: [], styles: [{ id: 'x', name: 'X', slots: [10, null, null, null, null, null, null, null, null, null, null] }] } };
  expect(fontKey({ ...own, cellWidth: 9 })).not.toBe(fontKey({ ...ruled, cellWidth: 9 }));   // the ninth column follows the lines
});
