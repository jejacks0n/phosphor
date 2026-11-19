import { expect, it } from 'vitest';
import { ttfOf } from '@/lib/BitmapTtf.js';

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
