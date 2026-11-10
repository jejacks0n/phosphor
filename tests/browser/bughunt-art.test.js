// Bug hunt: art layers on vector layers above the first one, and their eyes. Each test here fails because of a bug.
import { test, expect } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { toastMessage } from '@/composables/useToast.js';

const RED = '#ff0000';

async function blank(cols = 20, rows = 20) {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols, rows });
  await settle(app.project);
  return app;
}

// [base, vector, edit, L1 (a vector layer)], with an art layer made from the edit layer, which lands on L1.
async function artOnUpper() {
  const app = await blank();
  const { project, workspace } = app;
  project.addLayer('vector', 'base');
  const upper = project.addLayer('vector', 'edit');
  workspace.pickLayer('edit');
  project.typeAt(2, 1, 'H', { fg: RED });
  project.commitEdit();
  workspace.selection = { c0: 1, r0: 0, c1: 6, r1: 2 };
  const key = project.makeArtLayer();
  expect(project.shapes.get(key).layer).toBe(upper);
  await settle(project);
  return { ...app, upper, key };
}

test('Make art layer into a hidden vector layer doesn\'t make the drawing vanish', async () => {
  const { project, workspace } = await blank();
  const upper = project.addLayer('vector', 'edit'); // directly above the edit layer: where Make art layer puts the art
  project.setLayerHidden(upper, true);
  workspace.pickLayer('edit');
  project.typeAt(2, 1, 'H', { fg: RED });
  project.commitEdit();
  await settle(project);
  const shown = cellsKey(project);
  workspace.selection = { c0: 1, r0: 0, c1: 6, r1: 2 };
  toastMessage.value = null;
  const key = project.makeArtLayer();
  await settle(project);
  // Either it's refused and says so, or what showed still shows.
  if (key) expect(cellsKey(project)).toEqual(shown);
  else expect(toastMessage.value).toBeTruthy();
});
