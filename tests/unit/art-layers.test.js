// Art layers' record: a block of hand-drawn cells on the vector layer.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MOST_ART_BYTES, artBytes, artCellOf, artFromStranger, makeArt } from '../../src/document/artLayers.js';
import { isShape, makeShape, shapeBounds, shapeFromStranger, withShape } from '../../src/document/shapes.js';
import { cellState, deserializeFrames, newFrame, serializeFrames } from '../../src/document/frames.js';
import { addedKey, listedParts, partKeys } from '../../src/document/keys.js';
import { PARTS, partsOf } from '../../src/document/parts.js';

test('artCellOf: half blocks and paint become ▄ halves, a missing color see-through', () => {
  assert.deepEqual(artCellOf({ char: '▀', fg: '#ff0000' }, null, null), ['▄', '#ff0000', null]);
  assert.deepEqual(artCellOf({ char: '▄', fg: '#ff0000', bg: '#0000ff' }, null, null), ['▄', '#0000ff', '#ff0000']);
  assert.deepEqual(artCellOf({ char: ' ', bg: '#00ff00' }, null, null), ['▄', '#00ff00', '#00ff00']);
  assert.deepEqual(artCellOf(null, '#111111', null), ['▄', '#111111', null]);
  assert.equal(artCellOf({ char: '▀' }, null, null), null);
});
test('artCellOf: a character keeps its glyph, background on top and foreground below', () => {
  assert.deepEqual(artCellOf({ char: 'A', fg: '#ff0000' }, null, null), ['A', null, '#ff0000']);
  assert.deepEqual(artCellOf({ char: 'A' }, null, null), ['A', null, null]);
  assert.deepEqual(artCellOf({ char: 'A', fg: '#ff0000' }, '#222222', null), ['A', '#222222', '#ff0000']);
});
test('makeArt sits on whole cells and only moves', () => {
  const art = { cols: 2, rows: 1, cells: [[0, 'A', null, '#ff0000']] };
  assert.deepEqual(makeArt({ z: 3, m: [2, 0.5, 0, 1, 4.6, 3.2], art }).m, [1, 0, 0, 1, 5, 4]);
  assert.ok(Object.isFrozen(makeArt({ m: [1, 0, 0, 1, 0, 0], art })));
});
test('artFromStranger takes exactly what makeArt makes, and nothing past MOST_ART_BYTES', () => {
  const good = makeArt({ m: [1, 0, 0, 1, 2, 4], art: { cols: 2, rows: 2, cells: [[0, 'A', null, null], [3, '▄', '#000000', null]] } });
  assert.deepEqual(artFromStranger(JSON.parse(JSON.stringify(good))), good);
  assert.equal(artFromStranger({ ...good, art: { ...good.art, cells: [[4, 'A', null, null]] } }), null); // past the grid
  assert.equal(artFromStranger({ ...good, art: { ...good.art, cells: [[1, 'A', null, null], [0, 'B', null, null]] } }), null); // out of order
  assert.equal(artFromStranger({ ...good, m: [1, 0, 0, 1, 2, 3] }), null); // half a line
  assert.equal(artFromStranger({ ...good, points: [] }), null);
  const big = { cols: 300, rows: 100, cells: Array.from({ length: 6000 }, (_, i) => [i, 'A', '#123456', '#654321']) };
  assert.equal(artFromStranger({ z: 0, m: [1, 0, 0, 1, 0, 0], art: big }), null);
});
test('artFromStranger counts UTF-8 bytes, not characters', () => {
  const cells = Array.from({ length: 2700 }, (_, i) => [i, '字', null, null]);
  const wide = { z: 0, m: [1, 0, 0, 1, 0, 0], art: { cols: 300, rows: 100, cells } };
  assert.ok(JSON.stringify(wide).length <= MOST_ART_BYTES); // it fits by characters
  assert.ok(artBytes(wide) > MOST_ART_BYTES); // and not by bytes
  assert.equal(artFromStranger(wide), null);
  const narrow = { ...wide, art: { ...wide.art, cells: cells.slice(0, 100) } };
  assert.deepEqual(artFromStranger(narrow), makeArt(narrow));
});
test('an art layer keeps follow and along, written only when not the default, and refuses a guide and a face', () => {
  const base = { m: [1, 0, 0, 1, 2, 4], art: { cols: 2, rows: 1, cells: [[0, 'A', null, null]] } };
  const art = makeArt(base);
  assert.deepEqual(makeArt({ ...base, along: 0, follow: undefined }), art);
  assert.equal(JSON.stringify(makeArt({ ...base, along: 0 })), JSON.stringify(art));
  const rides = makeArt({ ...base, follow: { key: 'v:path', ride: 'start', motion: 'half', junk: 1 }, along: 0.25 });
  assert.deepEqual(rides.follow, { key: 'v:path', ride: 'start', motion: 'half' });
  assert.ok(Object.isFrozen(rides.follow));
  assert.deepEqual(artFromStranger(JSON.parse(JSON.stringify(rides))), rides);
  assert.deepEqual(shapeFromStranger(JSON.parse(JSON.stringify(rides))), rides);
  assert.deepEqual(withShape(rides, { along: 0.5 }).follow, rides.follow);
  const plain = JSON.parse(JSON.stringify(art));
  const bad = [
    { follow: { key: 'path' } }, { follow: { key: 'v:path', ride: 'middle' } }, { follow: { key: 'v:path', ride: 'along' } },
    { follow: { key: 'v:path', face: true } }, { follow: { key: 'v:path', motion: 'smooth' } }, { along: 0 }, { along: 1.5 }, { guide: true }, { guide: false },
  ];
  for (const v of bad) assert.equal(artFromStranger({ ...plain, ...v }), null, JSON.stringify(v));
});
test('shapes.js hands art records on: shapeFromStranger, isShape, shapeBounds; partsOf', () => {
  const art = makeArt({ m: [1, 0, 0, 1, 3, 6], art: { cols: 4, rows: 2, cells: [[0, 'A', null, null]] } });
  assert.deepEqual(shapeFromStranger(JSON.parse(JSON.stringify(art))), art);
  assert.equal(isShape(art), true);
  assert.deepEqual(shapeBounds(art), { x: 3, y: 6, w: 4, h: 4 });
  assert.deepEqual(partsOf(art), ['transform', 'along', 'z']);
  assert.deepEqual(partsOf(makeShape({ points: [[0, 0, 0, 0, 0, 0, 0]], closed: false })), PARTS);
});

test('an art layer keys only Transform, Along and Stack', () => {
  const K = 'v:art', A = makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 2, rows: 1, cells: [[0, 'A', null, '#ff0000']] } });
  const frames = Array.from({ length: 8 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  const put = (at, shape, parts) => {
    frames[at].changes.set(K, cellState(shape, 0, 0));
    frames[at].parts = parts && new Map([[K, new Set(parts)]]);
  };
  put(0, A);
  put(4, withShape(A, { m: [1, 0, 0, 1, 3, 4] }), ['transform']);
  assert.deepEqual(listedParts(frames, K, 0), ['transform']);
  assert.deepEqual([...partKeys(frames, K, 0).rows.keys()], ['transform', 'along', 'z']);
  assert.equal(addedKey(frames, K, 'fill', 2), null);
  put(4, withShape(A, { m: [1, 0, 0, 1, 3, 4] }), null); // a Blank key frame setting all of it: all of an art layer
  assert.deepEqual(listedParts(frames, K, 0), ['transform', 'along', 'z']);
  put(4, withShape(A, { m: [1, 0, 0, 1, 3, 4] }), ['transform']);
  put(6, withShape(A, { m: [1, 0, 0, 1, 3, 4], z: 2 }), ['z']); // a restack
  assert.deepEqual(listedParts(frames, K, 0), ['transform', 'z']);
  put(7, withShape(A, { m: [1, 0, 0, 1, 5, 6], z: 2 }), ['transform', 'along', 'z']); // every part an art layer has
  const json = JSON.parse(JSON.stringify({ frames: serializeFrames(frames), frame: 0, fps: 12 }));
  assert.deepEqual(json.frames[4].parts, [[K, ['transform']]]);
  assert.deepEqual(json.frames[7].parts, []);
  const read = deserializeFrames(json, 20, 20).frames;
  assert.deepEqual([...read[4].parts.get(K)], ['transform']);
  assert.deepEqual([...read[6].parts.get(K)], ['z']);
  assert.equal(read[7].parts, null);
  json.frames[4].parts = [[K, ['transform', 'fill']]]; // no part an art layer has: left out, so all of it
  assert.equal(deserializeFrames(json, 20, 20).frames[4].parts, null);
});
