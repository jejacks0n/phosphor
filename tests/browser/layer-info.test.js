// The layers' names, eyes and vector layer on the project: set by their actions, reset by a new document, kept for a
// room's project except the eyes. A name or an eye isn't an undo step.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';

const GRADIENT = '/tests/fixtures/images/gradient.png';
// Each layer's name and eye, by id, in the stack's order.
const info = (project) => Object.fromEntries(project.layers.map(({ id, name, hidden }) => [id, { name, hidden }]));
const DEFAULTS = { base: { name: null, hidden: false }, edit: { name: null, hidden: false } };

test('renameLayer and setLayerHidden change the info and are no undo step; addLayer is one', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  expect(info(project)).toEqual(DEFAULTS);
  expect(project.hasVectorLayer).toBe(false);

  project.renameLayer('edit', '  Logo  ');
  project.setLayerHidden('base', true);
  project.renameLayer('vector', 'Nothing'); // there is no vector layer yet
  project.setLayerHidden('vector', true);
  expect(info(project)).toEqual({ base: { name: null, hidden: true }, edit: { name: 'Logo', hidden: false } });
  project.renameLayer('edit', '   '); // blank: the default
  expect(project.layerById('edit').name).toBe(null);
  expect(project.canUndo).toBe(false);

  project.addLayer('vector', 'base');
  expect(info(project).vector).toEqual({ name: null, hidden: false });
  expect(project.hasVectorLayer).toBe(true);
  expect(project.canUndo).toBe(true);
  project.renameLayer('vector', 'Art');
  expect(project.layerById('vector').name).toBe('Art');
});

test('the first shape brings the vector layer, directly on the base, and it can be renamed and hidden', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  project.renameLayer('vector', 'Art');
  project.setLayerHidden('vector', true);
  expect(info(project).vector).toEqual({ name: 'Art', hidden: true });
});

test('shapes make a vector layer, and a new image or canvas starts from the defaults', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  expect(project.hasVectorLayer).toBe(true);
  project.renameLayer('edit', 'Logo');

  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(info(project)).toEqual(DEFAULTS);
  project.renameLayer('base', 'Photo');
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  expect(info(project)).toEqual(DEFAULTS);
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
  expect(info(project)).toEqual({ base: { name: null, hidden: false }, vector: { name: 'Art', hidden: false }, edit: { name: 'Logo', hidden: false } });
});

test('the same document brought up to date keeps the artist\'s own eyes, with the host\'s names', async () => {
  const { project } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 20, rows: 20 });
  project.setLayerHidden('edit', true);
  project.addLayer('vector', 'base');
  project.setLayerHidden('vector', true);
  const parts = {
    settings: { cols: 20, rows: 20 }, imageBuffer: project.imageBuffer, paintBuffer: null, baseBuffer: null, editCells: new Map(),
    baseRecords: project.baseRecords, erasedCells: [], shapes: new Map(), animation: null,
    layers: { base: { name: 'Photo', hidden: true }, edit: { name: 'Logo' }, vector: { name: 'Art', hidden: true } },
  };
  await project.openFromHost(parts, { filename: 'room', sameDocument: true });
  expect(info(project)).toEqual({ base: { name: 'Photo', hidden: false }, vector: { name: 'Art', hidden: true }, edit: { name: 'Logo', hidden: true } });
});
