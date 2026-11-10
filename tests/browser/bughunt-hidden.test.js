// Bug hunt: hidden layers and the pick. Each test here fails because of a bug.
import { test, expect, vi } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { writeProject } from '@/document/projectIO.js';
import { toastMessage } from '@/composables/useToast.js';

const WHITE = { fg: '#ffffff', bg: '#000000' };

async function blank(cols = 20, rows = 20) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols, rows });
  await settle(app.project);
  return app;
}

test('a block pasted with the picked layer hidden lands on it unseen', async () => {
  const { project, workspace } = await blank();
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  const block = project.copySelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, ['edit']);
  project.setLayerHidden('edit', true);
  await settle(project);
  toastMessage.value = null;
  const shown = cellsKey(project);
  const landed = project.pasteSelection(block, 5, 5);
  expect(cellsKey(project)).toEqual(shown); // nothing shows, as nothing should
  // Either the paste is refused and says so, or it mustn't have written the hidden layer.
  expect(landed === null ? toastMessage.value : project.cellsOf('edit').has('5,5')).toBeTruthy();
  expect(project.cellsOf('edit').has('5,5')).toBe(false);
});

test('Merge down of a cells layer into another with the base hidden keeps what shows', async () => {
  const { project, workspace } = await createTestApp();
  const { loadImage } = await import('../support/app.js');
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(3, 3, 'A', { fg: '#ff0000' }); // BG none: it's completed against what shows under it
  project.commitEdit();
  project.setLayerHidden('base', true);
  await settle(project);
  const shown = cellsKey(project);
  expect(project.mergeDown(top)).toBe(true);
  await settle(project);
  expect(cellsKey(project)).toEqual(shown);
});

// restoreVersion's path: the same document id, from autosave's record.
async function restoreSame(project) {
  const parts = await project.projectParts();
  const rest = await (await writeProject({ ...parts, imageBuffer: new ArrayBuffer(0) })).arrayBuffer();
  await project.restoreDocument({ record: { rest, filename: project.filename, savedToFile: false, dirty: false }, imageBuffer: project.imageBuffer }, { documentId: project.documentId });
  await settle(project);
}

test('bringing back a version with Layer 2 picked leaves the pick and the layer in use in step', async () => {
  const { project, workspace } = await blank();
  const two = project.addLayer('cells', 'edit');
  workspace.pickLayer(two);
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  await restoreSame(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', two]);
  // Whatever's picked, the tools draw on it.
  expect(project.editId).toBe(workspace.pickedLayer);
});

test('bringing back a version from VECTOR leaves the pick and the layer in use in step', async () => {
  const { project, workspace } = await blank();
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  expect(workspace.editorTab).toBe('vector');
  await restoreSame(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  const picked = project.layerById(workspace.pickedLayer);
  if (picked.kind === 'cells') expect(project.editId).toBe(workspace.pickedLayer);
  else expect(workspace.editorTab).toBe('vector');
});
