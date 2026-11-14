// Cells on the wire: the color table, what changed, fonts and gzipped snapshots in chunks.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CHUNK_BYTES, MOST_SNAPSHOT_BYTES, MOST_ARTIST_BYTES, MOST_PROJECT_BYTES, MOST_CHANGE_BYTES, encodeCells, decodeCells, decodeChange, changedCells,
  fontOnWire, fontFor, packSnapshot, unpackSnapshot, readChange, packProject, unpackProject, readCursor, readCursors,
} from '../../src/social/wire.js';
import { withPins, EMPTY_BASE } from '../../src/document/baseRecords.js';
import { hex2rgb } from '../../src/lib/ColorUtils.js';
import { DISPLAY_FONTS } from '../../src/lib/displayFonts.js';

const color = (hex) => ({ ...hex2rgb(hex), hex });
const cell = (char, fg, bg, wide) => ({ char, fg: color(fg), bg: color(bg), ...(wide && { wide }) });

test('cells survive encoding with each color listed once, and wide halves are kept', () => {
  const cells = [
    cell('a', '#ffffff', '#000000'), cell('b', '#ffffff', '#aa0000'),
    cell('宽', '#00aa00', '#000000', 'lead'), cell('宽', '#00aa00', '#000000', 'trail'),   // layoutWide's halves share the char
  ];
  const wire = encodeCells(cells);
  assert.deepEqual(wire.colors, ['#ffffff', '#000000', '#aa0000', '#00aa00']);
  assert.deepEqual(wire.cells[2], ['宽', 3, 1, 1]);
  assert.deepEqual(wire.cells[3], ['宽', 3, 1, 2]);
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
  // A char that isn't one character a cell can hold is a space: markup, two characters, nothing, a control.
  const chars = decodeCells({ colors, cells: ['<b>x</b>', 'ab', '', '\u0000', '漢', '👍🏽'].map((c) => [c, 0, 1]) }).map((c) => c.char);
  assert.deepEqual(chars, [' ', ' ', ' ', ' ', '漢', '👍🏽']);
});

test('a color table can\'t be bigger than its cells can use, or not a list', () => {
  const colors = ['#000000', '#111111', '#222222'];
  assert.equal(decodeCells({ colors: colors.slice(0, 2), cells: [['a', 0, 1]] }).length, 1);   // a cell has two colors
  assert.throws(() => decodeCells({ colors, cells: [['a', 0, 1]] }));
  assert.throws(() => decodeCells({ colors: 'not a list', cells: [['a', 0, 1]] }));
  assert.throws(() => decodeCells({ colors: colors.slice(0, 2), cells: 'not a list' }));
});

test('a change whose places don\'t fit is refused before its colors or cells are made', () => {
  const change = { at: [1], colors: ['#000000', '#ffffff'], cells: [['a', 0, 1]] };
  assert.deepEqual(decodeChange(change, 2).at, [1]);
  assert.equal(decodeChange(change, 2).cells[0].char, 'a');
  const unmakeable = { colors: ['not a color'], cells: [['a', 0, 0]] };
  for (const at of [[5], [-1], [0.5], ['0'], [0, 1], 'x', undefined]) assert.equal(decodeChange({ ...unmakeable, at }, 2), null);
  assert.equal(decodeChange({ ...unmakeable, at: [0], cells: 'x' }, 2), null);
  assert.throws(() => decodeChange({ ...unmakeable, at: [0] }, 2));   // it fits, so it's made, and isn't a color
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

// An artist's change is a stranger's data, checked as a host's cells are.
const GRID = { cols: 10, rows: 4, layerWidth: 20, layerHeight: 8 };
const good = () => ({
  stroke: 's1',
  cells: [['0,0', { char: 'a', fg: '#ffffff', bg: '#000000' }], ['9,3', { fg: '#00aa00' }], ['3,2', null]],
  runs: [[0, 0, 20, 0xff0000ff], [5, 7, 3, 0]],
});

test('readChange gives back a good change unchanged, the same arrays', () => {
  const msg = { t: 'change', ...good() };
  const read = readChange(msg, GRID);
  assert.deepEqual(read, good());
  assert.equal(read.cells, msg.cells);
  assert.equal(read.runs, msg.runs);
  assert.deepEqual(readChange({ stroke: 'x', cells: [], runs: [] }, GRID), { stroke: 'x', cells: [], runs: [] });
  assert.equal(readChange({ ...good(), stroke: 'é'.repeat(40) }, GRID).stroke.length, 40);
  assert.ok(readChange({ ...good(), runs: [[0, 0, 1, 0xffffffff]] }, GRID));
  assert.ok(readChange({ ...good(), cells: [['0,0', { char: 'a', fg: '#000000', fgIndex: 16, bg: '#ffffff', bgIndex: 231 }]] }, GRID)); // a file's 256-color indexes
});

test.each([
  ['a cell off the grid', { cells: [['10,0', null]] }],
  ['a cell below the grid', { cells: [['0,4', null]] }],
  ['a key that isn\'t a place', { cells: [['a,b', null]] }],
  ['a negative place', { cells: [['-1,0', null]] }],
  ['a place with a fraction', { cells: [['1.5,0', null]] }],
  ['a col with a leading zero', { cells: [['01,0', null]] }],
  ['a row with a leading zero', { cells: [['1,00', null]] }],
  ['a col of zeros', { cells: [['00,0', null]] }],
  ['a col with many leading zeros', { cells: [['00001,0', null]] }],
  ['a row of zeros', { cells: [['0,00', null]] }],
  ['a place in exponent form', { cells: [['1e1,0', null]] }],
  ['a negative zero', { cells: [['-0,0', null]] }],
  ['a place with a space', { cells: [[' 1,0', null]] }],
  ['a place with a third number', { cells: [['1,0,0', null]] }],
  ['a place of three numbers', { cells: [['1,0,2', null]] }],
  ['a key that isn\'t a string', { cells: [[1, null]] }],
  ['a cell that isn\'t a pair', { cells: [['0,0']] }],
  ['a character that can\'t be drawn', { cells: [['0,0', { char: 'ab' }]] }],
  ['a markup character', { cells: [['0,0', { char: '<b>' }]] }],
  ['a character that isn\'t a string', { cells: [['0,0', { char: 1 }]] }],
  ['a bad color', { cells: [['0,0', { fg: 'red' }]] }],
  ['a short hex', { cells: [['0,0', { bg: '#fff' }]] }],
  ['an entry with nothing in it', { cells: [['0,0', {}]] }],
  ['an entry with something else in it', { cells: [['0,0', { char: 'a', wide: 'lead' }]] }],
  ['a 256-color index past 255', { cells: [['0,0', { fg: '#000000', fgIndex: 256 }]] }],
  ['a 256-color index that isn\'t a number', { cells: [['0,0', { fg: '#000000', fgIndex: '16' }]] }],
  ['a 256-color index with no color', { cells: [['0,0', { char: 'a', bgIndex: 16 }]] }],
  ['an entry that is a list', { cells: [['0,0', ['a']]] }],
  ['an entry that is a string', { cells: [['0,0', 'a']] }],
  ['an entry that is missing', { cells: [['0,0', undefined]] }],
  ['cells not an array', { cells: 'x' }],
  ['cells missing', { cells: undefined }],
  ['runs not an array', { runs: {} }],
  ['a run off the layer', { runs: [[19, 0, 2, 1]] }],
  ['a run below the layer', { runs: [[0, 8, 1, 1]] }],
  ['a run of negative length', { runs: [[5, 0, -1, 1]] }],
  ['a run of no length', { runs: [[5, 0, 0, 1]] }],
  ['a run of fractional length', { runs: [[5, 0, 1.5, 1]] }],
  ['a run starting before the layer', { runs: [[-1, 0, 2, 1]] }],
  ['a run that isn\'t four numbers', { runs: [[0, 0, 1]] }],
  ['a run with a text length', { runs: [[0, 0, '1', 1]] }],
  ['rgba not a whole number', { runs: [[0, 0, 1, 1.5]] }],
  ['rgba negative', { runs: [[0, 0, 1, -1]] }],
  ['rgba past 32 bits', { runs: [[0, 0, 1, 0x100000000]] }],
  ['rgba text', { runs: [[0, 0, 1, '255']] }],
  ['rgba not a number', { runs: [[0, 0, 1, NaN]] }],
  ['a stroke id over 40 characters', { stroke: 'x'.repeat(41) }],
  ['an empty stroke id', { stroke: '' }],
  ['a stroke id that isn\'t text', { stroke: 7 }],
  ['no stroke id', { stroke: undefined }],
])('readChange refuses %s', (_, bad) => {
  assert.equal(readChange({ ...good(), ...bad }, GRID), null);
});

// A room carries the old shape of a drawing: its shapes are on its one vector layer, which they don't name.
test('readChange refuses a shape that names a layer', async () => {
  const { rectShape } = await import('../../src/document/shapes.js');
  const shape = JSON.parse(JSON.stringify(rectShape(0, 0, 4, 4, { fill: '#ff0000' })));
  assert.ok(readChange({ ...good(), cells: [['v:a', shape]] }, GRID));
  for (const layer of ['L2', 'edit', 'vector']) assert.equal(readChange({ ...good(), cells: [['v:a', { ...shape, layer }]] }, GRID), null, layer);
});

test('readChange takes the keys cellKey makes, zero and ten included', () => {
  const cells = [['0,0', null], ['10,0', null], ['0,3', null], ['9,0', null], ['0,0', { char: 'a' }]];
  assert.equal(readChange({ ...good(), cells }, { ...GRID, cols: 11 }).cells, cells);
});

test('readChange refuses what isn\'t an object, without throwing', () => {
  for (const msg of [null, undefined, 5, 'x', [], () => {}]) assert.equal(readChange(msg, GRID), null);
});

test('readChange checks a big change with each position visited once', () => {
  const cells = Array.from({ length: 3000 }, (_, i) => [`${i % 10},${i % 4}`, { char: 'a' }]);
  const runs = Array.from({ length: 3000 }, (_, i) => [i % 10, i % 8, 1, i]);
  assert.equal(readChange({ stroke: 's', cells, runs }, GRID).cells, cells);
  cells.push(['10,0', null]);
  assert.equal(readChange({ stroke: 's', cells, runs }, GRID), null);
});

test('an artist\'s change is a message, and a project a lot', () => {
  assert.equal(MOST_ARTIST_BYTES, CHUNK_BYTES);
  assert.ok(MOST_CHANGE_BYTES < MOST_ARTIST_BYTES);
  assert.equal(MOST_PROJECT_BYTES, 256 * 1024 * 1024);
});

const parts = () => ({
  settings: { cols: 6, rows: 4, hasPaint: true, paintScale: 1, baseScale: 1 },
  imageBuffer: new Uint8Array([1, 2, 3, 4, 5]).buffer,
  paintBlob: new Blob([new Uint8Array([9, 8, 7])]),
  baseBlob: new Blob([new Uint8Array([6, 6])]),
  editCells: new Map([['0,0', Object.freeze({ char: 'a', fg: '#ffffff' })], ['5,3', Object.freeze({ bg: '#000000' })]]),
  baseRecords: withPins(EMPTY_BASE, [{ col: 2, row: 1, char: 'x' }]),
});

const bigParts = () => {
  let seed = 7;
  const noise = new Uint8Array(3 * CHUNK_BYTES);   // doesn't compress, so it takes several chunks
  for (let i = 0; i < noise.length; i++) noise[i] = (seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 16;
  return { ...parts(), imageBuffer: noise.buffer };
};

test('packProject and unpackProject give back the same parts', async () => {
  const chunks = await packProject(parts());
  assert.ok(chunks.every((c) => c instanceof Uint8Array && c.length > 0 && c.length <= CHUNK_BYTES));
  const back = await unpackProject(chunks, { mostBytes: MOST_PROJECT_BYTES });
  const bytes = (buffer) => [...new Uint8Array(buffer)];
  const settings = { ...parts().settings };
  delete settings.hasPaint;   // the reader takes it to decide the paint buffer
  assert.deepEqual(back.settings, settings);
  assert.deepEqual(bytes(back.imageBuffer), [1, 2, 3, 4, 5]);
  assert.deepEqual(bytes(back.paintBuffer), [9, 8, 7]);
  assert.deepEqual(bytes(back.baseBuffer), [6, 6]);
  assert.deepEqual([...back.editCells], [...parts().editCells]);
  assert.deepEqual([...back.baseRecords.pins], [...parts().baseRecords.pins]);
  assert.equal(back.baseRecords.pins.size, 1);
});

test('a project with no paint or base pixels packs and unpacks', async () => {
  const back = await unpackProject(await packProject({ ...parts(), paintBlob: null, baseBlob: null }), { mostBytes: MOST_PROJECT_BYTES });
  assert.equal(back.paintBuffer, null);
  assert.equal(back.baseBuffer, null);
});

test('a big project is several chunks and arrives whole', async () => {
  const chunks = await packProject(bigParts());
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((c) => c.length <= CHUNK_BYTES));
  assert.equal((await unpackProject(chunks, { mostBytes: MOST_PROJECT_BYTES })).imageBuffer.byteLength, 3 * CHUNK_BYTES);
});

test('unpackProject refuses more than the limit, and missing or repeated chunks, with null', async () => {
  const chunks = await packProject(bigParts());
  const unpack = (list, mostBytes = MOST_PROJECT_BYTES) => unpackProject(list, { mostBytes });
  assert.equal(await unpack(chunks, 1000), null);
  assert.equal(await unpack(chunks.slice(1)), null);   // the first is missing
  assert.equal(await unpack(chunks.slice(0, -1)), null);   // the last is missing
  assert.equal(await unpack([...chunks.slice(0, 1), ...chunks.slice(2)]), null);   // one in the middle
  assert.equal(await unpack([chunks[0], chunks[0], ...chunks.slice(1)]), null);   // the first twice
  assert.equal(await unpack([...chunks.slice(0, 2), chunks[1], ...chunks.slice(2)]), null);   // one in the middle twice
  assert.equal(await unpack([...chunks, chunks.at(-1)]), null);   // the last twice
  assert.equal(await unpack([]), null);
  assert.equal(await unpack('x'), null);
  assert.equal(await unpack([chunks[0], 'x']), null);
  assert.equal(await unpack([chunks[0], undefined, ...chunks.slice(2)]), null);
  assert.ok(await unpack(chunks));
});

test('unpackProject refuses what isn\'t a project, with null', async () => {
  const gzipped = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  assert.equal(await unpackProject([await gzipped(new TextEncoder().encode('not a project at all'))], { mostBytes: MOST_PROJECT_BYTES }), null);
  assert.equal(await unpackProject([new Uint8Array(100)], { mostBytes: MOST_PROJECT_BYTES }), null);
});

test('a cursor is read only if it can be drawn', () => {
  const at = { col: 3, row: 4 }, view = { col: 0, row: 0, cols: 80, rows: 40, zoom: 1.5 };
  assert.deepEqual(readCursor({ at, view, name: 'ann' }), { at, view, name: 'ann', inside: null });
  assert.deepEqual(readCursor({ at: null, view: null, name: 'ann' }), { at: null, view: null, name: 'ann', inside: null });
  for (const bad of [
    { at: { col: -1, row: 0 }, view, name: 'ann' }, { at: { col: 1.5, row: 0 }, view, name: 'ann' }, { at: { col: '1', row: 0 }, view, name: 'ann' }, { at: 'there', view, name: 'ann' },
    { at, view: { col: 0, row: 0, cols: 80 }, name: 'ann' }, { at, view: { ...view, zoom: 'big' }, name: 'ann' },
    { at, view }, { at, view, name: '' }, { at, view, name: 'x'.repeat(61) }, { at, view, name: { toString: 'x' } },
  ]) assert.equal(readCursor(bad), null);
});

test('a cursor carries which art layer its artist is inside, and only a shape key', () => {
  assert.deepEqual(readCursor({ t: 'cursor', at: null, view: null, name: 'ann', inside: 'v:abc' }), { at: null, view: null, name: 'ann', inside: 'v:abc' });
  for (const inside of [5, 'x:1', 'v:', 'v:a b', {}, null]) assert.equal(readCursor({ at: null, view: null, name: 'ann', inside }).inside, null);
  assert.equal(readCursors({ a: { at: null, view: null, name: 'ann', inside: 'v:abc' } }).a.inside, 'v:abc');
});

test('a host\'s cursors keep only the ones that are cursors, and only so many', () => {
  const good = { at: { col: 1, row: 1 }, view: null, name: 'ann', inside: null };
  assert.deepEqual(readCursors({ a: good, b: { at: 'x', name: 'bob' }, c: 'nope', d: null }), { a: good });
  assert.deepEqual(readCursors(undefined), {});
  assert.equal(Object.keys(readCursors(Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`u${i}`, good])))).length, 64);
});

test('readChange takes a valid shape and its deletion, and refuses a bad one or a bad v: key', async () => {
  const { rectShape } = await import('../../src/document/shapes.js');
  const shape = JSON.parse(JSON.stringify(rectShape(1, 1, 30, 20, { fill: '#ff0000' }))); // as it comes off the wire
  const of = (cells) => readChange({ stroke: 's1', cells, runs: [] }, GRID);
  const read = of([['v:abc', shape], ['v:gone', null]]);
  assert.deepEqual(read.cells, [['v:abc', shape], ['v:gone', null]]);
  assert.equal(of([['v:abc', { ...shape, width: -1 }]]), null);
  assert.equal(of([['v:abc', { ...shape, extra: 1 }]]), null);
  assert.equal(of([['v:', shape]]), null);
  assert.equal(of([['v:a b', shape]]), null);
  assert.equal(of([['0,0', shape]]), null); // a shape isn't a cell
  assert.equal(of([['v:abc', { char: 'A' }]]), null); // nor a cell a shape
});
