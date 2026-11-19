// A bitmap font as a TrueType font of square pixels (a pixel is 64 units, the em is 64 x height), so
// canvas fillText and CSS draw it pixel for pixel at font-size: <height>px.
import { SLOT_CHARS, glyphRows } from './BitmapFont.js';

const PX = 64;
const ADVANCE = 8 * PX;
const TYPES = { B: [1, 'setUint8'], H: [2, 'setUint16'], h: [2, 'setInt16'], L: [4, 'setUint32'] };

// Big-endian values by type letter: pack('HhL', 1, -2, 3).
function pack(spec, ...vals) {
  const v = vals.flat();
  const out = new Uint8Array([...spec].reduce((n, t) => n + TYPES[t][0], 0));
  const view = new DataView(out.buffer);
  let at = 0;
  [...spec].forEach((t, i) => {
    view[TYPES[t][1]](at, v[i]);
    at += TYPES[t][0];
  });
  return out;
}

const join = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};

const sum = (bytes) => {
  let s = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    s = (s + (((bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0)) >>> 0;
  }
  return s;
};

// One clockwise rectangle per run of lit pixels in a row.
function glyphOf(rows, height) {
  const rects = [];
  rows.forEach((bits, r) => {
    for (let x = 0; x < 8; x++) {
      if (!(bits & (0x80 >> x))) continue;
      let end = x;
      while (end < 7 && bits & (0x80 >> (end + 1))) end++;
      rects.push([x * PX, (end + 1) * PX, (height - r) * PX, (height - r - 1) * PX]);
      x = end;
    }
  });
  if (!rects.length) return { data: new Uint8Array(0), xMin: 0, points: 0, contours: 0 };
  const pts = rects.flatMap(([x0, x1, t, b]) => [[x0, t], [x1, t], [x1, b], [x0, b]]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const xMin = Math.min(...xs);
  const delta = (axis) => pts.map((p, i) => p[axis] - (i ? pts[i - 1][axis] : 0));
  const data = join([
    pack('hhhhh', rects.length, xMin, Math.min(...ys), Math.max(...xs), Math.max(...ys)),
    pack('H'.repeat(rects.length), rects.map((_, i) => i * 4 + 3)),
    pack('H', 0),
    new Uint8Array(pts.length).fill(1), // on the curve, 16-bit deltas
    pack('h'.repeat(pts.length), delta(0)),
    pack('h'.repeat(pts.length), delta(1)),
  ]);
  return { data, xMin, points: pts.length, contours: rects.length };
}

const utf16 = (text) => pack('H'.repeat(text.length), [...text].map((c) => c.charCodeAt(0)));

export function ttfOf(font) {
  const { height } = font;
  const em = PX * height;
  const glyphs = [{ data: new Uint8Array(0), xMin: 0, points: 0, contours: 0 }];
  SLOT_CHARS.forEach((_, i) => glyphs.push(glyphOf(glyphRows(font, i), height)));
  const n = glyphs.length;
  const padded = glyphs.map((g) => join([g.data, new Uint8Array((4 - (g.data.length % 4)) % 4)]));
  const offsets = padded.reduce((a, p) => (a.push(a[a.length - 1] + p.length), a), [0]);

  const codes = SLOT_CHARS.map((c, i) => [c.codePointAt(0), i + 1]).sort((a, b) => a[0] - b[0]);
  const segs = [...codes, [0xffff, 0]];
  const sc = segs.length;
  const pow = 2 ** Math.floor(Math.log2(sc));
  const cmap = join([
    pack('HH', 0, 1), pack('HHL', 3, 1, 12),
    pack('HHHHHHH', 4, 16 + sc * 8, 0, sc * 2, pow * 2, Math.log2(pow), sc * 2 - pow * 2),
    pack('H'.repeat(sc), segs.map((s) => s[0])), pack('H', 0),
    pack('H'.repeat(sc), segs.map((s) => s[0])),
    pack('H'.repeat(sc), segs.map(([c, g]) => (g - c) & 0xffff)),
    pack('H'.repeat(sc), segs.map(() => 0)),
  ]);

  const psName = font.name.replace(/[^A-Za-z0-9]/g, '') || 'Bitmap';
  const strings = [[1, font.name], [2, 'Regular'], [4, font.name], [6, psName]];
  let at = 0;
  const records = strings.map(([id, s]) => (at += s.length * 2, pack('HHHHHH', 3, 1, 0x409, id, s.length * 2, at - s.length * 2)));
  const name = join([pack('HHH', 0, strings.length, 6 + strings.length * 12), ...records, ...strings.map(([, s]) => utf16(s))]);

  const maxPoints = Math.max(...glyphs.map((g) => g.points));
  const maxContours = Math.max(...glyphs.map((g) => g.contours));
  const tables = {
    'OS/2': join([
      pack('HhHHH', 4, ADVANCE, 400, 5, 0),
      pack('h'.repeat(10), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      pack('h' + 'B'.repeat(10), 0, new Array(10).fill(0)),
      pack('LLLL', 0, 0, 0, 0), pack('BBBB', 0x20, 0x20, 0x20, 0x20),
      pack('HHH', 0x80 | 0x40, 0, 0xffff),
      pack('hhhHH', em, 0, 0, em, 0),
      pack('LL', 1, 0),
      pack('hhHHH', 0, em, 0, 32, 0),
    ]),
    cmap,
    glyf: join(padded),
    head: pack('LLLLHHLLLLhhhhHHhhh', 0x10000, 0x10000, 0, 0x5f0f3cf5, 3, em, 0, 0, 0, 0, 0, 0, ADVANCE, em, 0, 8, 2, 1, 0),
    hhea: pack('LhhhHhhhhhhhhhhhH', 0x10000, em, 0, 0, ADVANCE, 0, 0, ADVANCE, 1, 0, 0, 0, 0, 0, 0, 0, n),
    hmtx: pack('Hh'.repeat(n), glyphs.flatMap((g) => [ADVANCE, g.xMin])),
    loca: pack('L'.repeat(n + 1), offsets),
    maxp: pack('LHHHHHHHHHHHHHH', 0x10000, n, maxPoints, maxContours, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0),
    name,
    post: pack('LLhhLLLLL', 0x30000, 0, -PX, PX, 1, 0, 0, 0, 0),
  };
  const tags = Object.keys(tables).sort();
  let off = 12 + tags.length * 16;
  const dir = [], bodies = [];
  for (const tag of tags) {
    const t = tables[tag];
    const body = join([t, new Uint8Array((4 - (t.length % 4)) % 4)]);
    dir.push(join([new TextEncoder().encode(tag), pack('LLL', sum(body), off, t.length)]));
    bodies.push(body);
    off += body.length;
  }
  const sr = 16 * 2 ** Math.floor(Math.log2(tags.length));
  const file = join([pack('LHHHH', 0x10000, tags.length, sr, Math.log2(sr / 16), tags.length * 16 - sr), ...dir, ...bodies]);
  // checkSumAdjustment sits 8 bytes into head
  const headAt = 12 + tags.length * 16 + bodies.slice(0, tags.indexOf('head')).reduce((a, b) => a + b.length, 0);
  new DataView(file.buffer).setUint32(headAt + 8, (0xb1b0afba - sum(file)) >>> 0);
  return file.buffer;
}
