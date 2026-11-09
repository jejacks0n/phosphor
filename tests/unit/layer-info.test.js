// The layers' names, eyes and vector layer: what a file or a room may say about them is untrusted.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DEFAULT_LAYER_INFO, goodLayerInfo, savedLayers } from '../../src/document/layerInfo.js';

test('goodLayerInfo: defaults for nothing, a vector layer when there are shapes', () => {
  assert.deepEqual(goodLayerInfo(undefined, { hasShapes: false }), DEFAULT_LAYER_INFO);
  assert.deepEqual(goodLayerInfo(undefined, { hasShapes: true }).vector, { name: null, hidden: false });
  assert.deepEqual(goodLayerInfo({ vector: {} }, { hasShapes: false }).vector, { name: null, hidden: false });
  assert.deepEqual(goodLayerInfo({ edit: { name: 'Logo', hidden: true } }, { hasShapes: false }).edit, { name: 'Logo', hidden: true });
});

test('goodLayerInfo: what is not a name and a flag is the default, and a name is trimmed and capped', () => {
  assert.deepEqual(goodLayerInfo({ edit: { name: 42, hidden: 'yes' }, vector: 7 }, { hasShapes: false }), DEFAULT_LAYER_INFO);
  assert.deepEqual(goodLayerInfo([1], { hasShapes: false }), DEFAULT_LAYER_INFO);
  assert.equal(goodLayerInfo({ edit: { name: 'x'.repeat(500) } }, { hasShapes: false }).edit.name.length, 40);
  assert.equal(goodLayerInfo({ edit: { name: '  ' } }, { hasShapes: false }).edit.name, null);
  assert.equal(goodLayerInfo({ edit: { name: '  Logo ' } }, { hasShapes: false }).edit.name, 'Logo');
});

test('goodLayerInfo: a new object each time, so one document cannot change another\'s', () => {
  const a = goodLayerInfo(undefined, { hasShapes: false });
  assert.notEqual(a, DEFAULT_LAYER_INFO);
  assert.notEqual(a.edit, DEFAULT_LAYER_INFO.edit);
});

test('savedLayers: only what is not the default, and nothing when all is', () => {
  assert.equal(savedLayers(DEFAULT_LAYER_INFO), null);
  assert.deepEqual(savedLayers({ ...DEFAULT_LAYER_INFO, vector: { name: null, hidden: false } }), { vector: {} });
  assert.deepEqual(savedLayers({ ...DEFAULT_LAYER_INFO, edit: { name: 'Logo', hidden: false }, base: { name: null, hidden: true } }), { base: { hidden: true }, edit: { name: 'Logo' } });
});
