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
