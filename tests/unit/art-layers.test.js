// Art layers' record: a block of hand-drawn cells on the vector layer.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MOST_ART_BYTES, artBytes, artCellOf, artFromStranger, makeArt } from '../../src/document/artLayers.js';
import { isShape, makeShape, shapeBounds, shapeFromStranger } from '../../src/document/shapes.js';
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
test('shapes.js hands art records on: shapeFromStranger, isShape, shapeBounds; partsOf', () => {
  const art = makeArt({ m: [1, 0, 0, 1, 3, 6], art: { cols: 4, rows: 2, cells: [[0, 'A', null, null]] } });
  assert.deepEqual(shapeFromStranger(JSON.parse(JSON.stringify(art))), art);
  assert.equal(isShape(art), true);
  assert.deepEqual(shapeBounds(art), { x: 3, y: 6, w: 4, h: 4 });
  assert.deepEqual(partsOf(art), ['transform', 'z']);
  assert.deepEqual(partsOf(makeShape({ points: [[0, 0, 0, 0, 0, 0, 0]], closed: false })), PARTS);
});
