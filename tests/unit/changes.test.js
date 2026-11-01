// A change to the edit layer as data: the cells and pixels it set, split to fit a message, hashed for the check.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cellChanges, pixelRuns, eachPixel, splitChange, changeBytes, hashCell, hashPixel, Tail, exactly, keepBaseline } from '../../src/document/changes.js';

const RED = 0xff0000ff;
const cell = (char, fg, bg) => Object.freeze({ char, ...(fg && { fg }), ...(bg && { bg }) });
const byKey = (pairs) => [...pairs].sort(([a], [b]) => (a < b ? -1 : 1));

test('cellChanges lists what differs, null for what went', () => {
  const a = cell('a'), b = cell('b'), c = cell('c');
  const before = new Map([['1,1', a], ['2,2', b]]);
  const after = new Map([['1,1', a], ['3,3', c]]);
  assert.deepEqual(byKey(cellChanges(before, after)), [['2,2', null], ['3,3', c]]);
  assert.deepEqual(cellChanges(before, before), []);
  const edited = new Map([['1,1', cell('z')], ['2,2', b]]);
  assert.deepEqual(cellChanges(before, edited), [['1,1', edited.get('1,1')]]);
});

function image(w, h, paint = {}) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (const [i, [r, g, b, a]] of Object.entries(paint)) px.set([r, g, b, a], i * 4);
  return px;
}

test('pixelRuns covers only changed pixels, runs of one color', () => {
  const before = image(3, 2);
  const after = image(3, 2, { 1: [255, 0, 0, 255], 2: [255, 0, 0, 255] });
  assert.deepEqual(pixelRuns(before, after, 3, 2, 10, 20), [[11, 20, 2, RED]]);
  const two = image(3, 2, { 0: [255, 0, 0, 255], 1: [0, 255, 0, 255], 3: [255, 0, 0, 255] });
  assert.deepEqual(pixelRuns(before, two, 3, 2, 0, 0), [[0, 0, 1, RED], [1, 0, 1, 0x00ff00ff], [0, 1, 1, RED]]);
  assert.deepEqual(pixelRuns(two, before, 3, 2, 0, 0), [[0, 0, 2, 0], [0, 1, 1, 0]]);
  const seen = [];
  eachPixel([[11, 20, 2, RED], [0, 1, 1, 7]], (x, y, rgba) => seen.push([x, y, rgba]));
  assert.deepEqual(seen, [[11, 20, RED], [12, 20, RED], [0, 1, 7]]);
});

test('pixelRuns never mentions a pixel that stayed, even when its neighbors changed', () => {
  const white = [255, 255, 255, 255];
  const before = image(3, 1, { 0: white, 1: [255, 0, 0, 255], 2: white });
  const after = image(3, 1, { 0: [0, 0, 0, 255], 1: [255, 0, 0, 255], 2: [0, 0, 0, 255] });
  assert.deepEqual(pixelRuns(before, after, 3, 1, 0, 0), [[0, 0, 1, 0x000000ff], [2, 0, 1, 0x000000ff]]);
  // Clear pixels count as nothing whatever their color channels hold.
  assert.deepEqual(pixelRuns(image(1, 1, { 0: [9, 9, 9, 0] }), image(1, 1), 1, 1, 0, 0), []);
});

const cellsOf = (n) => Array.from({ length: n }, (_, i) => [`${i % 300},${Math.floor(i / 300)}`, i % 7 ? cell('█', '#ff0000', '#00ff00') : null]);
const pixelsOf = (change) => { const out = []; eachPixel(change.runs, (x, y, c) => out.push(`${x},${y},${c}`)); return out; };

test('splitChange keeps every position and every message under the limit', () => {
  const cells = cellsOf(5000);
  const runs = Array.from({ length: 800 }, (_, i) => [i, i * 2, 5 + (i % 9), 0xff0000ff - i]);
  const parts = splitChange({ cells, runs }, 65536);
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(changeBytes(part) <= 65536);
  assert.deepEqual(parts.flatMap((p) => p.cells), cells);
  assert.deepEqual(parts.flatMap(pixelsOf), pixelsOf({ runs }));
  const small = { cells: cells.slice(0, 3), runs: [[0, 0, 4, RED]] };
  assert.deepEqual(splitChange(small, 65536), [small]);
  assert.deepEqual(splitChange({ cells: [], runs: [] }, 65536), []);
});

test('a single run longer than the limit is cut into shorter runs', () => {
  const run = [100000, 0, 5000, 1]; // 17 bytes in a 22 byte envelope: past 37
  const parts = splitChange({ cells: [], runs: [run] }, 37);
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(changeBytes(part) <= 37);
  assert.deepEqual(parts.flatMap(pixelsOf), pixelsOf({ runs: [run] }));
  assert.throws(() => splitChange({ cells: [['1,1', cell('a')]], runs: [] }, 10), RangeError);
});

test('changeBytes counts the bytes of its JSON, so wide characters cost more than one', () => {
  const change = { cells: [['1,1', cell('▄')]], runs: [] };
  assert.equal(changeBytes(change), new TextEncoder().encode(JSON.stringify(change)).length);
  assert.ok(changeBytes(change) > JSON.stringify(change).length);
});

test('the hash of an empty position is zero and values differ', () => {
  assert.equal(hashCell('1,1', null), 0);
  assert.equal(hashPixel(3, 4, 0), 0);
  const a = hashCell('1,1', cell('a', '#ff0000'));
  assert.notEqual(a, 0);
  assert.ok(Number.isInteger(a) && a === (a | 0));
  assert.notEqual(a, hashCell('1,1', cell('b', '#ff0000')));
  assert.notEqual(a, hashCell('1,1', cell('a', '#ff0001')));
  assert.notEqual(a, hashCell('1,2', cell('a', '#ff0000')));
  assert.notEqual(hashCell('1,1', cell('a', '#ff0000')), hashCell('1,1', cell('a', undefined, '#ff0000')));
  // The same entry that crossed the wire hashes the same, whatever order its fields came in.
  const wire = JSON.parse(JSON.stringify({ bg: '#00ff00', fg: '#ff0000', char: 'a' }));
  assert.equal(hashCell('1,1', wire), hashCell('1,1', cell('a', '#ff0000', '#00ff00')));
  assert.equal(hashCell('1,1', { char: 'a', fg: undefined }), hashCell('1,1', JSON.parse(JSON.stringify({ char: 'a', fg: undefined }))));
  const p = hashPixel(3, 4, RED);
  assert.ok(p !== 0 && p === (p | 0));
  assert.notEqual(p, hashPixel(4, 3, RED));
  assert.notEqual(p, hashPixel(3, 4, RED - 1));
  assert.equal(p, hashPixel(3, 4, RED));
});

test('Tail gives what came after n, or null once n has fallen off the end', () => {
  const tail = new Tail(1000);
  assert.deepEqual(tail.since(0), []);
  const item = (n) => ({ n, bytes: 100 });
  for (let n = 1; n <= 5; n++) tail.add(item(n));
  assert.deepEqual(tail.since(3).map((x) => x.n), [4, 5]);
  assert.deepEqual(tail.since(5), []);
  assert.deepEqual(tail.since(9), []);
  assert.deepEqual(tail.since(0).map((x) => x.n), [1, 2, 3, 4, 5]);
  for (let n = 6; n <= 30; n++) tail.add(item(n)); // holds 10 of 100 bytes: 21 to 30
  assert.equal(tail.since(5), null);
  assert.equal(tail.since(19), null);
  assert.deepEqual(tail.since(20).map((x) => x.n), Array.from({ length: 10 }, (_, i) => 21 + i));
  assert.deepEqual(tail.since(29).map((x) => x.n), [30]);
  const big = new Tail(10);
  big.add({ n: 1, bytes: 500 });
  assert.deepEqual(big.since(0).map((x) => x.n), [1]); // the newest stays however big
  assert.equal(new Tail().since(0).length, 0);
});

test('Tail forgets what came before a gap in n, and never answers has: -1', () => {
  const tail = new Tail();
  for (const n of [1, 2, 4, 5]) tail.add({ n }); // 3 was a project, which the tail doesn't hold
  assert.equal(tail.since(2), null);
  assert.equal(tail.since(0), null);
  assert.deepEqual(tail.since(3).map((x) => x.n), [4, 5]);
  assert.deepEqual(tail.since(4).map((x) => x.n), [5]);
  const fromZero = new Tail();
  for (const n of [0, 1, 2]) fromZero.add({ n });
  assert.equal(fromZero.since(-1), null);
  assert.deepEqual(fromZero.since(0).map((x) => x.n), [1, 2]);
  assert.equal(new Tail().since(-1), null);
});

// Browsers keep a canvas premultiplied, and read the same stored pixel back differently: this pair is one.
test('hashPixel agrees for two readings of one stored pixel, and tells real differences apart', () => {
  const chromium = 0x00ff2a06, webkit = 0x00ff2b06;
  assert.equal(hashPixel(3, 4, chromium), hashPixel(3, 4, webkit));
  assert.notEqual(hashPixel(3, 4, chromium), hashPixel(3, 4, 0x00ff2a07));
  assert.notEqual(hashPixel(3, 4, RED), hashPixel(3, 4, 0xff0001ff));   // opaque: every value is its own
  assert.equal(hashPixel(3, 4, 0x12345600), 0);
});

test('pixelRuns sees no change between two readings of one stored pixel', () => {
  assert.deepEqual(pixelRuns([0, 255, 42, 6], [0, 255, 43, 6], 1, 1, 0, 0), []);
  assert.deepEqual(pixelRuns([0, 255, 42, 6], [0, 255, 42, 7], 1, 1, 0, 0), [[0, 0, 1, 0x00ff2a07]]);
});

test('pixelRuns can compare exactly, and keepBaseline holds a reading at what it was compared with', () => {
  assert.deepEqual(pixelRuns([0, 255, 42, 6], [0, 255, 43, 6], 1, 1, 0, 0, exactly), [[0, 0, 1, 0x00ff2b06]]);
  const before = [0, 255, 42, 6, 1, 2, 3, 255], after = [0, 255, 43, 6, 9, 9, 9, 255];
  keepBaseline(before, after);
  assert.deepEqual(after, [0, 255, 42, 6, 9, 9, 9, 255]);
});

// How Firefox keeps and reads a partly transparent pixel, as measured: it rounds up going in, and down coming out.
const firefoxReads = (channel, alpha) => Math.min(255, Math.floor((Math.ceil((channel * alpha) / 255) * 255) / alpha));

test('a pixel Firefox read back hashes and compares as the one written, at every alpha and color', () => {
  for (let alpha = 1; alpha < 255; alpha++) {
    for (let channel = 0; channel < 256; channel++) {
      const written = [channel, 255 - channel, 42, alpha], read = [firefoxReads(channel, alpha), firefoxReads(255 - channel, alpha), firefoxReads(42, alpha), alpha];
      const pack = ([r, g, b, a]) => ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
      assert.equal(hashPixel(3, 4, pack(read)), hashPixel(3, 4, pack(written)), `${written} read as ${read}`);
      assert.deepEqual(pixelRuns(written, read, 1, 1, 0, 0), [], `${written} read as ${read}`);
    }
  }
  assert.equal(hashPixel(3, 4, 0x00ffff01), hashPixel(3, 4, 0x000bff01));   // measured: [0, 11, 255, 1] reads [0, 255, 255, 1]
});

test('pixelRuns still sees a real change of color at the same alpha, and any change of an opaque one', () => {
  assert.deepEqual(pixelRuns([200, 0, 0, 128], [100, 0, 0, 128], 1, 1, 0, 0), [[0, 0, 1, 0x64000080]]);
  assert.deepEqual(pixelRuns([200, 0, 0, 255], [201, 0, 0, 255], 1, 1, 0, 0), [[0, 0, 1, 0xc90000ff]]);
});
