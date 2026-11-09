// The drawing's layers as an ordered list: what an old file's layers key says (untrusted) as layers, what the old form
// writes back, whether a stack fits the old form, and a new layer's id and number.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { layersFromOld, savedLayers, legacySlots, newLayerId, nextNumber, goodLayers, MOST_LAYERS } from '../../src/document/layerInfo.js';

const ids = (layers) => layers.map((l) => l.id);
const layer = (id, kind, n = 1) => ({ id, kind, n, name: null, hidden: false });
const BASE = layer('base', 'cells'), EDIT = layer('edit', 'cells'), VECTOR = layer('vector', 'vector');

test('layersFromOld: the bottom and the edit layer for nothing, a vector layer between them when there are shapes', () => {
  assert.deepEqual(ids(layersFromOld(undefined, { hasShapes: false })), ['base', 'edit']);
  assert.deepEqual(ids(layersFromOld(undefined, { hasShapes: true })), ['base', 'vector', 'edit']);
  assert.deepEqual(ids(layersFromOld({ vector: {} }, { hasShapes: false })), ['base', 'vector', 'edit']);
  assert.deepEqual(layersFromOld({ edit: { name: 'Logo', hidden: true } }, { hasShapes: false })[1], { id: 'edit', kind: 'cells', n: 1, name: 'Logo', hidden: true });
});

test('layersFromOld: what is not a name, a flag or a number is the default, and a name is trimmed and capped', () => {
  const layers = layersFromOld({ edit: { name: 42, hidden: 'yes', n: 'x' }, vector: 7 }, { hasShapes: false });
  assert.deepEqual(layers, [BASE, EDIT]);
  assert.deepEqual(layersFromOld([1], { hasShapes: false }), [BASE, EDIT]);
  assert.equal(layersFromOld({ edit: { n: 2.5 } }, { hasShapes: false })[1].n, 1);
  assert.equal(layersFromOld({ edit: { name: 'x'.repeat(500) } }, { hasShapes: false })[1].name.length, 40);
  assert.equal(layersFromOld({ edit: { name: '  ' } }, { hasShapes: false })[1].name, null);
  assert.equal(layersFromOld({ edit: { name: '  Logo ' } }, { hasShapes: false })[1].name, 'Logo');
});

test('layersFromOld: noEdit leaves the edit layer out', () => {
  assert.deepEqual(ids(layersFromOld({ noEdit: true }, { hasShapes: false })), ['base']);
  assert.deepEqual(ids(layersFromOld({ noEdit: 'yes' }, { hasShapes: false })), ['base', 'edit']);
});

test('layersFromOld: frozen layers in a new array each time', () => {
  const a = layersFromOld(undefined, { hasShapes: false }), b = layersFromOld(undefined, { hasShapes: false });
  assert.notEqual(a, b);
  assert.ok(a.every(Object.isFrozen));
});

test('savedLayers: only what is not the default, and nothing when all is', () => {
  assert.equal(savedLayers(layersFromOld(undefined, { hasShapes: false })), null);
  assert.deepEqual(savedLayers([BASE, layer('edit', 'cells', 3)]), { edit: { n: 3 } });
  assert.deepEqual(layersFromOld(savedLayers([BASE, layer('edit', 'cells', 3)]), { hasShapes: false }), [BASE, layer('edit', 'cells', 3)]);
  assert.deepEqual(savedLayers([BASE, VECTOR, EDIT]), { vector: {} });
  assert.deepEqual(savedLayers([{ ...BASE, hidden: true }, { ...EDIT, name: 'Logo' }]), { base: { hidden: true }, edit: { name: 'Logo' } });
  assert.deepEqual(savedLayers([BASE]), { noEdit: true });
  assert.deepEqual(ids(layersFromOld(savedLayers([BASE]), { hasShapes: false })), ['base']);
});

test('savedLayers: a vector layer its shapes bring back is left out, and one with none is kept', () => {
  assert.equal(savedLayers([BASE, VECTOR, EDIT], { hasShapes: true }), null); // as a file from before layers had it
  assert.deepEqual(savedLayers([BASE, { ...VECTOR, name: 'Ink' }, EDIT], { hasShapes: true }), { vector: { name: 'Ink' } });
  assert.deepEqual(savedLayers([BASE, VECTOR, EDIT], { hasShapes: false }), { vector: {} });
});

test('savedLayers: the old form names its own layers whatever their ids, and a stack that does not fit has no old form', () => {
  assert.deepEqual(savedLayers([BASE, layer('L4', 'vector', 2), { ...layer('L3', 'cells', 3), name: 'Logo' }]), { vector: { n: 2 }, edit: { name: 'Logo', n: 3 } });
  assert.equal(savedLayers([BASE, EDIT, VECTOR, layer('L2', 'cells', 2)]), null);
});

test('goodLayers: a stack as layers, or null unless every rule holds', () => {
  const stack = [BASE, EDIT, VECTOR, { ...layer('L2', 'cells', 2), name: 'Logo', hidden: true }];
  assert.deepEqual(goodLayers(stack), stack);
  assert.ok(goodLayers(stack).every(Object.isFrozen));
  assert.deepEqual(goodLayers([{ id: 'base', kind: 'cells' }, { id: 'L7', kind: 'cells', n: 2.5, name: '  Ink ', hidden: 'yes', cells: [] }]), [BASE, { ...layer('L7', 'cells'), name: 'Ink' }]);
  for (const bad of [
    undefined, [], {}, [BASE, 'x'],
    [BASE, layer('../x', 'cells')], [BASE, EDIT, EDIT], [BASE, layer('L01x', 'cells')],
    [layer('base', 'vector'), EDIT], [EDIT, BASE], [BASE, layer('base', 'cells')], [BASE, layer('L1', 'paint')],
  ]) assert.equal(goodLayers(bad), null, JSON.stringify(bad));
});

test('goodLayers: edit is a cells layer and vector is a vector layer, whatever a file says', () => {
  assert.equal(goodLayers([BASE, layer('edit', 'vector')]), null);
  assert.equal(goodLayers([BASE, layer('vector', 'cells')]), null);
  assert.ok(goodLayers([BASE, layer('vector', 'vector'), layer('edit', 'cells')]));
  assert.ok(goodLayers([BASE, layer('L1', 'vector'), layer('L2', 'cells')]));
});

test('goodLayers: at most MOST_LAYERS layers, the bottom counted', () => {
  const stack = (n) => [BASE, ...Array.from({ length: n - 1 }, (_, i) => layer(`L${i + 1}`, 'cells', i + 1))];
  assert.equal(MOST_LAYERS, 64);
  assert.equal(goodLayers(stack(MOST_LAYERS)).length, MOST_LAYERS);
  assert.equal(goodLayers(stack(MOST_LAYERS + 1)), null);
});

test('legacySlots: the bottom, then a vector layer, then a cells layer, each one optional', () => {
  assert.deepEqual(legacySlots([BASE, VECTOR, EDIT]), { vector: 'vector', cells: 'edit' });
  assert.deepEqual(legacySlots([BASE]), { vector: null, cells: null });
  assert.deepEqual(legacySlots([BASE, layer('L1', 'cells')]), { vector: null, cells: 'L1' });
  assert.equal(legacySlots([BASE, EDIT, VECTOR]), null);
  assert.equal(legacySlots([BASE, EDIT, layer('L1', 'cells')]), null);
  assert.equal(legacySlots([BASE, VECTOR, layer('L1', 'vector')]), null);
});

test('newLayerId: edit and vector while no layer has them, else one past the highest L', () => {
  assert.equal(newLayerId([BASE, VECTOR], 'cells'), 'edit');
  assert.equal(newLayerId([BASE, EDIT], 'vector'), 'vector');
  assert.equal(newLayerId([BASE, EDIT, layer('L3', 'cells')], 'cells'), 'L4');
  assert.equal(newLayerId([BASE, EDIT, VECTOR], 'vector'), 'L1');
});

test('nextNumber: one past the highest of the kind, the bottom left out', () => {
  assert.equal(nextNumber([BASE, EDIT, layer('L3', 'cells', 2)], 'cells'), 3);
  assert.equal(nextNumber([BASE], 'cells'), 1);
  assert.equal(nextNumber([BASE, EDIT], 'vector'), 1);
});
