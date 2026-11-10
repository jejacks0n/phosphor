// Bug hunt: selections, the clipboard and the base. Each test here fails because of a bug.
import { test, expect } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { toastMessage } from '@/composables/useToast.js';

const WHITE = { fg: '#ffffff', bg: '#000000' };

async function blank(cols = 20, rows = 20) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols, rows });
  await settle(app.project);
  return app;
}

test('a block pasted with the base picked and hidden lands on it unseen', async () => {
  const { project, workspace } = await blank();
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  const block = project.copySelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, ['edit']);
  workspace.pickLayer('base');
  project.setLayerHidden('base', true);
  await settle(project);
  toastMessage.value = null;
  const pins = project.baseRecords.pins.size;
  const landed = project.pasteSelection(block, 5, 5);
  if (landed === null) expect(toastMessage.value).toBeTruthy();
  expect(project.baseRecords.pins.size).toBe(pins);
});

test('a stamp (C on a selection) with the picked layer hidden writes nothing unseen', async () => {
  const { project, workspace } = await blank();
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  const two = project.addLayer('cells', 'edit');
  workspace.pickLayer(two);
  project.setLayerHidden(two, true);
  await settle(project);
  const shown = cellsKey(project);
  project.stampSelection({ c0: 1, r0: 1, c1: 1, r1: 1 }, workspace.selectionIds);
  expect(cellsKey(project)).toEqual(shown);
  expect(project.cellsOf(two).size).toBe(0);
});
