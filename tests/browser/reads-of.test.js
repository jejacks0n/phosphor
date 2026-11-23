// readsOf (store/project/shared.js): the project for a pass of reads, each field read once and the actions called as
// written, which Merge down's freeze and a Cells fill's looks on the base go through (issue #231). It answers as the
// store does, and a write through it reaches the store.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { readsOf } from '@/store/project/shared.js';
import { charRowsOf } from '@/lib/Cells.js';

test('readsOf answers every cell as the store does, for the looks a merge and a fill read', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 30, rows: 30 });
  const top = project.addLayer('cells');
  workspace.pickLayer(top);
  project.typeAt(4, 8, 'Z', { fg: '#ff0000' });
  project.paintStroke([{ x: 5, y: 16, alpha: 0.5 }, { x: 6, y: 17, alpha: 1 }], '#00ff00');
  project.commitEdit();
  await settle(project);
  const reads = readsOf(project);
  for (let row = 0; row < charRowsOf(project.rows); row++) {
    for (let col = 0; col < project.cols; col++) {
      expect(reads.storedLookAt(col, row, { through: top }), `${col},${row}`).toEqual(project.storedLookAt(col, row, { through: top }));
      expect(reads.completeAt(col, row, { char: '#' }, 'base'), `${col},${row}`).toEqual(project.completeAt(col, row, { char: '#' }, 'base'));
    }
  }
  expect(reads.cellsOf(top)).toBe(project.cellsOf(top));
  expect(reads.paintOf(top)).toBe(project.paintOf(top));
});

test('a write through readsOf reaches the store, and is read back from it', async () => {
  const { project } = await createTestApp();
  const reads = readsOf(project);
  expect(reads.brightness).toBe(project.brightness);
  reads.brightness = 120;
  expect(project.brightness).toBe(120);
  expect(reads.brightness).toBe(120);
});
