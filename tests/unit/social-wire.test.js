// Cells on the wire: the color table, what changed, fonts and gzipped snapshots in chunks.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CHUNK_BYTES, MOST_SNAPSHOT_BYTES, encodeCells, decodeCells, changedCells, fontOnWire, fontFor, packSnapshot, unpackSnapshot,
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

test('a cell from a stranger needs a string char, a wide of 1 or 2 if any, and colors that are hexes', () => {
  const colors = ['#ffffff', '#000000'];
  for (const char of [1, null, ['a'], { toString: () => 'a' }]) assert.throws(() => decodeCells({ colors, cells: [[char, 0, 1]] }));
  for (const wide of [0, 3, 'constructor', '1', true]) assert.throws(() => decodeCells({ colors, cells: [['a', 0, 1, wide]] }));
  for (const hex of [1, '#fff', 'red', { hex: '#ffffff' }, '#ffffff;x']) assert.throws(() => decodeCells({ colors: [hex], cells: [['a', 0, 0]] }));
  assert.equal(decodeCells({ colors, cells: [['a', 0, 1, 2]] })[0].wide, 'trail');
});

const gzip = async (text) => [new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())];
const snapshotOf = (cols, lines, more = {}) => JSON.stringify({
  cols, lines, font: null, colors: ['#000000'], cells: Array.from({ length: cols * lines }, () => ['a', 0, 0]), ...more,
});

test('a snapshot outside the app\'s grid limits is refused before its cells are made', async () => {
  for (const [cols, lines] of [[0, 1], [1, 0], [301, 1], [1, 5001], [300, 1667], [1.5, 2], ['2', 2]]) {
    await assert.rejects(unpackSnapshot(await gzip(JSON.stringify({ cols, lines, font: null, colors: [], cells: [] }))), `${cols} x ${lines}`);
  }
  assert.equal((await unpackSnapshot(await gzip(snapshotOf(300, 2)))).cells.length, 600);
});

test('a snapshot that inflates past MOST_SNAPSHOT_BYTES is refused without reading the rest', async () => {
  const bomb = await gzip(snapshotOf(1, 1, { pad: ' '.repeat(MOST_SNAPSHOT_BYTES) }));
  assert.ok(bomb.reduce((n, c) => n + c.length, 0) < CHUNK_BYTES);
  await assert.rejects(unpackSnapshot(bomb), /too big/);
});

test('a font from a stranger that isn\'t an object is the default, not a throw', () => {
  for (const onWire of [5, 'vga', true, [], undefined]) assert.deepEqual(fontFor(onWire), { ...DISPLAY_FONTS[0] });
});

test('a size from a stranger is held to the font field\'s range, and a size that isn\'t a number is the font\'s own', () => {
  const size = (sent) => fontFor({ id: 'vga', size: sent }).size;
  assert.deepEqual([size(1e300), size(-5), size(0), size(6), size(64), size(20.4)], [64, 6, 6, 6, 64, 20]);
  for (const sent of [NaN, Infinity, '16px', null, undefined, {}]) assert.equal(size(sent), 16);
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
