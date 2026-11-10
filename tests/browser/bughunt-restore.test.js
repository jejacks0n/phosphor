// Bug hunt: a version brought back into the same document (restoreVersion's path). Each test here fails because of a bug.
import { test, expect } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { writeProject } from '@/document/projectIO.js';

const WHITE = { fg: '#ffffff', bg: '#000000' };

async function blank(cols = 20, rows = 20) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols, rows });
  await settle(app.project);
  return app;
}

// restoreVersion's path: the same document id, from autosave's record.
async function restoreSame(project) {
  const parts = await project.projectParts();
  const rest = await (await writeProject({ ...parts, imageBuffer: new ArrayBuffer(0) })).arrayBuffer();
  await project.restoreDocument({ record: { rest, filename: project.filename, savedToFile: false, dirty: false }, imageBuffer: project.imageBuffer }, { documentId: project.documentId });
  await settle(project);
}

test('a version brought back from VECTOR keeps Layer 1\'s cells', async () => {
  const { project, workspace } = await blank();
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  await settle(project);
  const shown = cellsKey(project);
  await restoreSame(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  expect(project.cellsOf('edit').has('1,1')).toBe(true);
  expect(cellsKey(project)).toEqual(shown);
});

test('a version brought back with a cells layer directly on the base picked draws on the layer picked', async () => {
  const { project, workspace } = await blank();
  const low = project.addLayer('cells', 'base'); // [base, L1, edit]
  workspace.pickLayer(low);
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  await restoreSame(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', low, 'edit']);
  expect(project.editId).toBe(workspace.pickedLayer);
});
