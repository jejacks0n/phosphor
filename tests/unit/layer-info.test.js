// The drawing's layers as an ordered list: what an old file's layers key says (untrusted) as layers, what the old form
// writes back, whether a stack fits the old form, and a new layer's id and number.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { layersFromOld, savedLayers, legacySlots, newLayerId, nextNumber, goodLayers, lowerGroup, MOST_LAYERS } from '../../src/document/layerInfo.js';

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
  assert.equal(savedLayers(layersFromOld(undefined, { hasShapes: false }), { baseChars: CHARS }), null);
  assert.deepEqual(savedLayers([BASE, layer('edit', 'cells', 3)], { baseChars: CHARS }), { edit: { n: 3 } });
  assert.deepEqual(layersFromOld(savedLayers([BASE, layer('edit', 'cells', 3)], { baseChars: CHARS }), { hasShapes: false }), [BASE, layer('edit', 'cells', 3)]);
  assert.deepEqual(savedLayers([BASE, VECTOR, EDIT], { baseChars: CHARS }), { vector: {} });
  assert.deepEqual(savedLayers([{ ...BASE, hidden: true }, { ...EDIT, name: 'Logo' }], { baseChars: CHARS }), { base: { hidden: true }, edit: { name: 'Logo' } });
  assert.deepEqual(savedLayers([BASE], { baseChars: CHARS }), { noEdit: true });
  assert.deepEqual(ids(layersFromOld(savedLayers([BASE], { baseChars: CHARS }), { hasShapes: false })), ['base']);
});

test('savedLayers: a vector layer its shapes bring back is left out, and one with none is kept', () => {
  assert.equal(savedLayers([BASE, VECTOR, EDIT], { hasShapes: true, baseChars: CHARS }), null); // as a file from before layers had it
  assert.deepEqual(savedLayers([BASE, { ...VECTOR, name: 'Ink' }, EDIT], { hasShapes: true, baseChars: CHARS }), { vector: { name: 'Ink' } });
  assert.deepEqual(savedLayers([BASE, VECTOR, EDIT], { hasShapes: false, baseChars: CHARS }), { vector: {} });
});

test('savedLayers: the old form names its own layers whatever their ids, and a stack that does not fit has no old form', () => {
  assert.deepEqual(savedLayers([BASE, layer('L4', 'vector', 2), { ...layer('L3', 'cells', 3), name: 'Logo' }], { baseChars: CHARS }), { vector: { n: 2 }, edit: { name: 'Logo', n: 3 } });
  assert.equal(savedLayers([BASE, EDIT, VECTOR, layer('L2', 'cells', 2)], { baseChars: CHARS }), null);
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
  assert.deepEqual(legacySlots([BASE, VECTOR, EDIT], CHARS), { vector: 'vector', cells: 'edit' });
  assert.deepEqual(legacySlots([BASE], CHARS), { vector: null, cells: null });
  assert.deepEqual(legacySlots([BASE, layer('L1', 'cells')], CHARS), { vector: null, cells: 'L1' });
  assert.equal(legacySlots([BASE, EDIT, VECTOR], CHARS), null);
  assert.equal(legacySlots([BASE, EDIT, layer('L1', 'cells')], CHARS), null);
  assert.equal(legacySlots([BASE, VECTOR, layer('L1', 'vector')], CHARS), null);
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

test('lowerGroup: the bottom, the vector layers on it and the next cells layer; everything above is upper', () => {
  const L = (id, kind) => ({ id, kind });
  assert.deepEqual(lowerGroup([L('base', 'cells')], CHARS), { vectors: [], cells: null, upper: [] });
  assert.deepEqual(lowerGroup([L('base', 'cells'), L('vector', 'vector'), L('edit', 'cells')], CHARS), { vectors: ['vector'], cells: 'edit', upper: [] });
  assert.deepEqual(lowerGroup([L('base', 'cells'), L('vector', 'vector'), L('L1', 'vector'), L('edit', 'cells'), L('L2', 'cells'), L('L3', 'vector')], CHARS), { vectors: ['vector', 'L1'], cells: 'edit', upper: ['L2', 'L3'] });
  assert.deepEqual(lowerGroup([L('base', 'cells'), L('edit', 'cells'), L('vector', 'vector'), L('L1', 'cells')], CHARS), { vectors: [], cells: 'edit', upper: ['vector', 'L1'] });
  assert.deepEqual(lowerGroup([L('base', 'cells'), L('vector', 'vector')], CHARS), { vectors: ['vector'], cells: null, upper: [] });
});

// Character settings as a layer carries them (settings.js CHAR_KEYS): the bottom's are the document's own.
const CHARS = { chars: '░▒▓', charsAscii: ' .:', seed: 's', charChoice: 'random', charChoiceAscii: 'weight', solids: 25, patternLight: 100 };
const withChars = (each, chars = CHARS) => ({ ...each, chars });

test("legacySlots needs every layer's chars equal to the bottom's", () => {
  assert.deepEqual(legacySlots([BASE, withChars(VECTOR), withChars(EDIT)], CHARS), { vector: 'vector', cells: 'edit' });
  assert.equal(legacySlots([BASE, withChars(VECTOR), withChars(EDIT, { ...CHARS, chars: '#' })], CHARS), null);
  assert.equal(legacySlots([BASE, withChars(VECTOR, { ...CHARS, solids: 50 }), withChars(EDIT)], CHARS), null);
  assert.deepEqual(legacySlots([BASE, withChars(EDIT, { ...CHARS, solids: '25' })], CHARS), { vector: null, cells: 'edit' }); // a slider's numeric string is its number
});

test('lowerGroup sends a layer whose chars differ to the upper walk', () => {
  assert.deepEqual(lowerGroup([BASE, withChars(EDIT, { ...CHARS, chars: '#' })], CHARS), { vectors: [], cells: null, upper: ['edit'] });
  assert.deepEqual(lowerGroup([BASE, withChars(EDIT)], CHARS), { vectors: [], cells: 'edit', upper: [] });
  assert.deepEqual(lowerGroup([BASE, withChars(VECTOR, { ...CHARS, seed: 'x' }), withChars(EDIT)], CHARS), { vectors: [], cells: null, upper: ['vector', 'edit'] });
  assert.deepEqual(lowerGroup([BASE, withChars(VECTOR), withChars(EDIT, { ...CHARS, seed: 'x' })], CHARS), { vectors: ['vector'], cells: null, upper: ['edit'] });
});

test('legacySlots, savedLayers and lowerGroup refuse to guess the bottom\'s chars', () => {
  assert.throws(() => legacySlots([BASE, EDIT]), TypeError);
  assert.throws(() => savedLayers([BASE, EDIT]), TypeError);
  assert.throws(() => lowerGroup([BASE, EDIT]), TypeError);
});

test("goodLayers keeps a layer's chars, cleaned, and refuses bad ones", () => {
  assert.deepEqual(goodLayers([BASE, withChars(EDIT)])[1].chars, CHARS);
  assert.ok(Object.isFrozen(goodLayers([BASE, withChars(EDIT)])[1].chars));
  assert.deepEqual(goodLayers([BASE, withChars(EDIT, { solids: 50, cols: 9, junk: 1 })])[1].chars, { solids: 50 }); // only character settings
  assert.equal(goodLayers([withChars(BASE), EDIT])[0].chars, undefined); // the bottom's are the document's
  assert.equal(goodLayers([BASE, withChars(EDIT, { solids: 900 })]), null);
  assert.equal(goodLayers([BASE, withChars(EDIT, 'x')]), null);
});
