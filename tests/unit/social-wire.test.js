// Cells on the wire: the color table, what changed, fonts and gzipped snapshots in chunks.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CHUNK_BYTES, encodeCells, decodeCells, changedCells, fontOnWire, fontFor, packSnapshot, unpackSnapshot,
} from '../../src/social/wire.js';
import { hex2rgb } from '../../src/lib/ColorUtils.js';
import { DISPLAY_FONTS } from '../../src/lib/displayFonts.js';

const color = (hex) => ({ ...hex2rgb(hex), hex });
const cell = (char, fg, bg, wide) => ({ char, fg: color(fg), bg: color(bg), ...(wide && { wide }) });

test('cells survive encoding with each color listed once, and wide halves are kept', () => {
  const cells = [
    cell('a', '#ffffff', '#000000'), cell('b', '#ffffff', '#aa0000'),
    cell('宽', '#00aa00', '#000000', 'lead'), cell('', '#00aa00', '#000000', 'trail'),
  ];
  const wire = encodeCells(cells);
  assert.deepEqual(wire.colors, ['#ffffff', '#000000', '#aa0000', '#00aa00']);
  assert.deepEqual(wire.cells[2], ['宽', 3, 1, 1]);
  assert.deepEqual(wire.cells[3], ['', 3, 1, 2]);
  assert.equal(wire.cells[0].length, 3);
  assert.deepEqual(decodeCells(JSON.parse(JSON.stringify(wire))), cells);
});

test('decoded cells share one Color per table entry, and a color not in the table is refused', () => {
  const [a, b] = decodeCells({ colors: ['#ffffff', '#000000'], cells: [['a', 0, 1], ['b', 0, 1]] });
  assert.equal(a.fg, b.fg);
  assert.equal(a.bg, b.bg);
  for (const bad of [2, -1, 0.5, '0', 'length', undefined]) {
    assert.throws(() => decodeCells({ colors: ['#ffffff', '#000000'], cells: [['a', 0, bad]] }));
  }
});

test('changedCells finds the indexes that differ', () => {
  const prev = Array.from({ length: 40 }, (_, i) => cell(String.fromCharCode(65 + (i % 26)), '#ffffff', '#000000'));
  const copy = () => prev.map((c) => ({ ...c }));
  assert.deepEqual(changedCells(prev, prev.slice()), []);
  assert.deepEqual(changedCells(prev, copy()), []);

  const char = copy();
  char[7] = { ...char[7], char: '#' };
  assert.deepEqual(changedCells(prev, char), [7]);

  const bg = copy();
  bg[3] = { ...bg[3], bg: color('#aa0000') };
  assert.deepEqual(changedCells(prev, bg), [3]);

  const fg = copy();
  fg[9] = { ...fg[9], fg: color('#00aa00') };
  assert.deepEqual(changedCells(prev, fg), [9]);

  const wide = copy();
  wide[5] = { ...wide[5], wide: 'lead' };
  assert.deepEqual(changedCells(prev, wide), [5]);

  assert.equal(changedCells(prev, prev.slice(1)), null);
  const many = copy();
  for (let i = 0; i < 10; i++) many[i] = { ...many[i], char: '#' };
  assert.deepEqual(changedCells(prev, many), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);   // a quarter exactly
  many[10] = { ...many[10], char: '#' };
  assert.equal(changedCells(prev, many), null);
});

test('a font goes on the wire by id and size; one loaded from the host\'s computer, or unknown, is the default', () => {
  const vga = DISPLAY_FONTS.find((f) => f.id === 'vga');
  assert.deepEqual(fontOnWire({ ...vga, size: 20 }), { id: 'vga', size: 20 });
  assert.deepEqual(fontFor(fontOnWire({ ...vga, size: 20 })), { ...vga, size: 20 });
  assert.equal(fontFor(fontOnWire({ ...vga, size: 20 })).name, 'IBM VGA');
  assert.equal(fontOnWire({ id: 'user-1', name: 'Mine', family: 'x', size: 16, lineHeight: 1 }), null);
  const jetbrains = { ...DISPLAY_FONTS[0], size: 17 };
  assert.deepEqual(fontFor(null), jetbrains);
  assert.deepEqual(fontFor({ id: 'nope', size: 9 }), jetbrains);
});

// 300 columns x 1,666 lines of varied cells (the biggest document) goes in chunks that fit the limit.
test('the biggest snapshot is cut into chunks of CHUNK_BYTES or less and arrives whole', async () => {
  let seed = 12345;
  const rand = (n) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const hexes = Array.from({ length: 4096 }, (_, i) => '#' + (i * 4099 % 0x1000000).toString(16).padStart(6, '0'));
  const cols = 300;
  const lines = 1666;
  const cells = Array.from({ length: cols * lines }, () => cell(
    String.fromCharCode(33 + rand(90)), hexes[rand(hexes.length)], hexes[rand(hexes.length)], rand(50) === 0 ? 'lead' : undefined));
  const font = { id: 'vga', size: 20 };
  const chunks = await packSnapshot({ cols, lines, font, cells });
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c instanceof Uint8Array && c.length > 0 && c.length <= CHUNK_BYTES));
  assert.deepEqual(await unpackSnapshot(chunks), { cols, lines, font, cells });
}, 60000);
