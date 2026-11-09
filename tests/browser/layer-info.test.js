// The layers' names, eyes and vector layer on the project: set by their actions, reset by a new document, kept for a
// room's project except the eyes. None of it is an undo step.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import { DEFAULT_LAYER_INFO } from '@/document/layerInfo.js';

const GRADIENT = '/tests/fixtures/images/gradient.png';

test('renameLayer, setLayerHidden and addVectorLayer change the info and are no undo step', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  expect(project.layerInfo).toEqual(DEFAULT_LAYER_INFO);
  expect(project.hasVectorLayer).toBe(false);

  project.renameLayer('edit', '  Logo  ');
  project.setLayerHidden('base', true);
  project.renameLayer('vector', 'Nothing'); // there is no vector layer yet
  project.setLayerHidden('vector', true);
  expect(project.layerInfo).toEqual({ base: { name: null, hidden: true }, edit: { name: 'Logo', hidden: false }, vector: null });
  project.renameLayer('edit', '   '); // blank: the default
  expect(project.layerInfo.edit.name).toBe(null);

  project.addVectorLayer();
  expect(project.layerInfo.vector).toEqual({ name: null, hidden: false });
  expect(project.hasVectorLayer).toBe(true);
  project.renameLayer('vector', 'Art');
  project.addVectorLayer(); // already there: as it was
  expect(project.layerInfo.vector.name).toBe('Art');
  expect(project.canUndo).toBe(false);
});

test('a vector layer that exists for its shapes can be renamed and hidden', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  expect(project.layerInfo.vector).toBe(null);
  project.renameLayer('vector', 'Art');
  project.setLayerHidden('vector', true);
  expect(project.layerInfo.vector).toEqual({ name: 'Art', hidden: true });
});

test('shapes make a vector layer, and a new image or canvas starts from the defaults', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  expect(project.hasVectorLayer).toBe(true);
  project.renameLayer('edit', 'Logo');
  project.addVectorLayer();

  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.layerInfo).toEqual(DEFAULT_LAYER_INFO);
  project.renameLayer('base', 'Photo');
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  expect(project.layerInfo).toEqual(DEFAULT_LAYER_INFO);
});

test('a room\'s project keeps the host\'s names and clears every eye', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  const parts = {
    settings: { cols: 20, rows: 20 }, imageBuffer: project.imageBuffer, paintBuffer: null, baseBuffer: null, editCells: new Map(),
    baseRecords: project.baseRecords, erasedCells: [], shapes: new Map(), animation: null,
    layers: { base: { hidden: true }, edit: { name: 'Logo', hidden: true }, vector: { name: 'Art', hidden: true } },
  };
  await project.openFromHost(parts, { filename: 'room' });
  expect(project.layerInfo).toEqual({ base: { name: null, hidden: false }, edit: { name: 'Logo', hidden: false }, vector: { name: 'Art', hidden: false } });
});

test('the same document brought up to date keeps the artist\'s own eyes, with the host\'s names', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  project.setLayerHidden('edit', true);
  project.addVectorLayer();
  project.setLayerHidden('vector', true);
  const parts = {
    settings: { cols: 20, rows: 20 }, imageBuffer: project.imageBuffer, paintBuffer: null, baseBuffer: null, editCells: new Map(),
    baseRecords: project.baseRecords, erasedCells: [], shapes: new Map(), animation: null,
    layers: { base: { name: 'Photo', hidden: true }, edit: { name: 'Logo' }, vector: { name: 'Art', hidden: true } },
  };
  await project.openFromHost(parts, { filename: 'room', sameDocument: true });
  expect(project.layerInfo).toEqual({ base: { name: 'Photo', hidden: false }, edit: { name: 'Logo', hidden: true }, vector: { name: 'Art', hidden: true } });
});
