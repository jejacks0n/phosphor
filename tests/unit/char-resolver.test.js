import { test } from 'vitest';
import assert from 'node:assert/strict';
import { charModeOf, snapsLate, carriesError, mixChannel, bestMatcher, resolveGrid } from '../../src/lib/CharResolver.js';
import { PALETTES, rgb2hex, nearestIndex } from '../../src/lib/ColorUtils.js';

const CGA = PALETTES.cga;
const INK = { '░': [0.25, 0.25], '▒': [0.5, 0.5], '▓': [0.75, 0.75], '▄': [0, 1], '▀': [1, 0], '█': [1, 1] };
const g = (...chars) => chars.map((char) => ({ char, ink: INK[char] }));
const hex = (c) => rgb2hex(c).toLowerCase();
const pick = (r) => [r.char, hex(r.fg), hex(r.bg)];
// cols x rows RGBA of noise, the same every run.
const noise = (cols, rows) => {
  let seed = 7;
  return Uint8ClampedArray.from({ length: cols * rows * 4 }, (_, i) => (i % 4 === 3 ? 255 : (seed = (seed * 1103515245 + 12345) % 2147483648) % 256));
};
const halves = (raw, cols, col, line) => {
  const t = (2 * line * cols + col) * 4, u = ((2 * line + 1) * cols + col) * 4;
  return [[raw[t], raw[t + 1], raw[t + 2]], [raw[u], raw[u + 1], raw[u + 2]]];
};
const same = (a, b) => assert.deepEqual(pick(a), pick(b));

test('charModeOf: each style\'s choices, and anything unknown falls back to today\'s way', () => {
  assert.equal(charModeOf('ansi', 'random', 'weight'), 'random');
  assert.equal(charModeOf('ansi', 'best', 'weight'), 'best');
  assert.equal(charModeOf('ansi', 'shape', 'weight'), 'shape');
  assert.equal(charModeOf('ansi', 'bogus', 'weight'), 'random');
  assert.equal(charModeOf('colorAscii', 'best', 'weight'), 'intensity');
  assert.equal(charModeOf('colorAscii', 'random', 'shape'), 'shape');
  assert.equal(charModeOf('ascii', 'shape', 'weight'), 'brightness');
  assert.equal(charModeOf('ascii', 'random', 'bogus'), 'brightness');
  assert.equal(charModeOf('ascii', 'random', 'best'), 'brightness'); // Best match is ANSI's only
});

test('snapsLate and carriesError', () => {
  assert.equal(snapsLate({ charMode: 'random', dither: 0 }), false);
  assert.equal(snapsLate({ charMode: 'best', dither: 0 }), true);
  assert.equal(snapsLate({ charMode: 'random', dither: 10 }), true);
  assert.equal(carriesError({ charMode: 'shape', dither: 50, ditherStyle: 'floyd' }), true);
  assert.equal(carriesError({ charMode: 'shape', dither: 50, ditherStyle: 'bayer' }), false);
  assert.equal(carriesError({ charMode: 'random', dither: 50, ditherStyle: 'floyd' }), false);
});

test('mixChannel: a plain average at 0, linear light at 1', () => {
  assert.equal(mixChannel(0, 255, 0.5, 0), 127.5);
  assert.ok(Math.abs(mixChannel(0, 255, 0.5, 1) - 187.5) < 1);
  assert.equal(mixChannel(40, 200, 0, 1), 40);
  assert.equal(mixChannel(40, 200, 1, 0.5), 200);
});

test('a palette color is a solid; black over white is ▄', () => {
  const m = bestMatcher({ palette: CGA, glyphs: g('▄', '░', '▒', '▓', '█'), solids: 0, light: 0 });
  assert.deepEqual(pick(m.match([85, 85, 85], [85, 85, 85])), ['█', '#555555', '#555555']);
  assert.deepEqual(pick(m.match([0, 0, 0], [255, 255, 255])), ['▄', '#ffffff', '#000000']); // [char, fg, bg]
});

test('between palette colors, a shade of two', () => {
  const m = bestMatcher({ palette: CGA, glyphs: g('▓', '█'), solids: 0, light: 0 });
  assert.deepEqual(pick(m.match([64, 64, 64], [64, 64, 64])), ['▓', '#555555', '#000000']);
});

test('Solids: a solid within the tolerance wins', () => {
  const at = (solids) => pick(bestMatcher({ palette: CGA, glyphs: g('▓', '█'), solids, light: 0 }).match([70, 70, 70], [70, 70, 70]))[0];
  assert.equal(at(0), '▓');
  assert.equal(at(0.25), '█');
});

test('a Solids step keeps the mix table (a slider step stays live); Pattern light makes it again', () => {
  const glyphs = g('░', '▒', '▓', '█');
  const at = (solids, light = 0) => bestMatcher({ palette: CGA, glyphs, solids, light });
  const table = at(0).table;
  assert.ok(table);
  assert.equal(at(0.5).table, table);
  assert.equal(at(0).table, table);
  assert.notEqual(at(0, 1).table, table);
});

test('Pattern light: in linear light a lighter shade reads as the same gray', () => {
  const bw = [CGA[0], CGA[15]];
  const at = (light) => pick(bestMatcher({ palette: bw, glyphs: g('░', '▒', '█'), solids: 0, light }).match([128, 128, 128], [128, 128, 128]))[0];
  assert.equal(at(0), '▒');
  assert.equal(at(1), '░');
});

test('without a palette, ▄ is exact', () => {
  assert.deepEqual(pick(bestMatcher({ palette: null, glyphs: g('▄', '█'), solids: 0, light: 0 }).match([10, 20, 30], [200, 100, 50])), ['▄', '#c86432', '#0a141e']);
});

test('a two-ink glyph without a palette is fitted exactly', () => {
  const r = bestMatcher({ palette: null, glyphs: [{ char: '▘', ink: [0.5, 0] }], solids: 0, light: 0 }).match([100, 100, 100], [40, 40, 40]);
  assert.deepEqual(pick(r), ['▘', '#a0a0a0', '#282828']);
  assert.deepEqual([...r.top], [100, 100, 100]);
});

test('a solid is the palette color nearestIndex picks, the first of a tie (VGA has two blacks)', () => {
  const vga = PALETTES.vga;
  const m = bestMatcher({ palette: vga, glyphs: g('█'), solids: 0, light: 0 });
  const raw = noise(64, 64);
  for (let i = 0; i < raw.length; i += 4) {
    const c = [raw[i], raw[i + 1], raw[i + 2]];
    assert.equal(m.match(c, c).fg, vga[nearestIndex(...c, vga)]);
  }
  assert.equal(m.match([1, 1, 1], [1, 1, 1]).fg, vga[0]);
});

test('resolveGrid: no dither matches each cell alone; Bayer keeps a change to its own cell', () => {
  const m = bestMatcher({ palette: CGA, glyphs: g('▄', '░', '▒', '▓', '█'), solids: 0, light: 0 });
  const raw = noise(8, 9); // an odd last row, dropped
  const { cells, carried } = resolveGrid(raw, 8, 9, m);
  assert.equal(cells.length, 8 * 4);
  assert.equal(carried, null);
  for (let line = 0; line < 4; line++) {
    for (let col = 0; col < 8; col++) same(cells[line * 8 + col], m.match(...halves(raw, 8, col, line)));
  }
  const before = resolveGrid(raw, 8, 9, m, { strength: 1, style: 'bayer' }).cells;
  const changed = raw.slice();
  changed.set([255, 255, 0], ((2 * 2) * 8 + 3) * 4); // the top half of the cell at col 3, line 2
  const after = resolveGrid(changed, 8, 9, m, { strength: 1, style: 'bayer' }).cells;
  for (let i = 0; i < cells.length; i++) if (i !== 2 * 8 + 3) same(after[i], before[i]);
  assert.notDeepEqual(pick(after[2 * 8 + 3]), pick(before[2 * 8 + 3]));
});

test('resolveGrid Floyd–Steinberg: a flat gray between black and white averages out to it', () => {
  const m = bestMatcher({ palette: [CGA[0], CGA[15]], glyphs: g('▄', '█'), solids: 0, light: 0 });
  const raw = Uint8ClampedArray.from({ length: 16 * 16 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 64));
  const { cells, carried } = resolveGrid(raw, 16, 16, m, { strength: 1, style: 'floyd' });
  assert.equal(carried.length, 16 * 16 * 3);
  let sum = 0;
  for (const c of cells) sum += (c.char === '▄' ? c.bg.r : c.fg.r) + c.fg.r;
  assert.ok(Math.abs(sum / (2 * cells.length) - 64) < 8, `mean ${sum / (2 * cells.length)}`);
  assert.equal(new Set(cells.map((c) => c.fg.hex + c.bg.hex)).size > 1, true);
});

test('resolveGrid with area and carried: the same raw gives the same cells', () => {
  const m = bestMatcher({ palette: CGA, glyphs: g('▄', '░', '▒', '▓', '█'), solids: 0.1, light: 0.5 });
  const raw = noise(12, 10);
  const full = resolveGrid(raw, 12, 10, m, { strength: 0.8, style: 'floyd' });
  const area = { x: 3, y: 3, w: 4, h: 4 }; // lines 1 to 3
  const again = resolveGrid(raw, 12, 10, m, { strength: 0.8, style: 'floyd', area, carried: full.carried });
  let count = 0;
  for (let line = 0; line < 5; line++) {
    for (let col = 0; col < 12; col++) {
      const i = line * 12 + col;
      if (line >= 1 && line <= 3 && col >= 3 && col <= 6) {
        same(again.cells[i], full.cells[i]);
        count++;
      } else assert.equal(again.cells[i], undefined);
    }
  }
  assert.equal(count, 12);
});
