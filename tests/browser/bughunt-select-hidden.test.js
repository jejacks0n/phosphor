// Bug hunt: selecting with the picked layer hidden. docs/layers.md: "Selections act on every cells layer that shows,
// whatever is picked; to leave a layer out, hide it." Each test here fails because of a bug.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { getTool } from '@/tools';
import { toastMessage } from '@/composables/useToast.js';

const WHITE = { fg: '#ffffff', bg: '#000000' };

test('the Select tool and the Magic Wand still select with the picked layer hidden', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  const two = project.addLayer('cells', 'edit');
  workspace.pickLayer(two);
  project.setLayerHidden(two, true); // left out of the selection, as the docs say to
  await settle(project);
  const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } };
  toastMessage.value = null;
  workspace.setActiveTool('select');
  expect(getTool('select').begin(ctx, { x: 1, y: 2 }, { shiftKey: false })).not.toBe(false);
  expect(toastMessage.value).toBe(null);
  getTool('select').end?.(ctx);
  workspace.setActiveTool('wand');
  expect(getTool('wand').begin(ctx, { x: 1, y: 2 }, { shiftKey: false })).not.toBe(false);
  expect(toastMessage.value).toBe(null);
});
