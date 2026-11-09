// The drawing's layers as an ordered list in the store: an old document opens as the bottom, the vector layer and the
// edit layer, and the edit layer's fields (editCells, paintLayer, hasPaint) follow the cells layer in use (editId).
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';

const keys = (cells) => [...cells.keys()];

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

test('an old document opens as base, vector, edit', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace);
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  project.commitEdit();
  const edits = JSON.stringify([...project.editCells]);
  const parts = await project.projectParts();
  const blob = await writeProject({ imageBuffer: project.imageBuffer, ...parts, layers: null }); // as a file from before layers
  await project.openParts(await readProject(blob), { filename: 'old' });
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  expect(project.editId).toBe('edit');
  expect(JSON.stringify([...project.cellsOf('edit')])).toBe(edits);
});

test('useLayer swaps the aliases', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', id]);
  project.typeAt(0, 0, 'A', { fg: '#ffffff', bg: '#000000' });
  project.useLayer(id);
  expect(project.editId).toBe(id);
  project.typeAt(1, 0, 'B', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  expect(keys(project.cellsOf('edit'))).toEqual(['0,0']);
  expect(keys(project.cellsOf(id))).toEqual(['1,0']);
  expect(project.editCells).toBe(project.cellsOf(id));
  expect(project.paintOf(id)).toBe(project.paintLayer);
  expect(project.paintOf('edit')).not.toBe(project.paintLayer);
  project.useLayer('edit');
  expect(keys(project.editCells)).toEqual(['0,0']);
});

test('useLayer leaves the bottom, a vector layer and the layer in use as they are', async () => {
  const { project } = await blank();
  const cells = project.editCells;
  project.addVectorLayer();
  for (const id of ['base', 'vector', 'edit']) project.useLayer(id);
  expect(project.editId).toBe('edit');
  expect(project.editCells).toBe(cells);
});

test('swapping layers isn\'t an edit', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  project.typeAt(0, 0, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  const version = project.editVersion, swaps = project._frameSwaps;
  project.useLayer(id);
  expect(project.editVersion).toBe(version);
  expect(project._frameSwaps).toBeGreaterThan(swaps);
});

test('addLayer puts the new layer directly above the one named, with the next number of its kind', async () => {
  const { project } = await blank();
  const one = project.addLayer('cells', 'base');
  const two = project.addLayer('cells', 'edit');
  expect(project.layers.map((l) => [l.id, l.n])).toEqual([['base', 1], [one, 2], ['edit', 1], [two, 3]]);
  expect(project.addLayer('vector', 'base')).toBe('vector');
  expect(project.layers[1].id).toBe('vector');
  expect(project.hasVectorLayer).toBe(true);
  expect(project.canUndo).toBe(false);
});

test('a new image or canvas starts from the bottom and the edit layer', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  project.useLayer(id);
  project.renameLayer('edit', 'Logo');
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
  expect(project.layerById('edit').name).toBe(null);
  expect(project.editId).toBe('edit');
  expect(project._layerData.size).toBe(0);
});
