// Selections are undo steps: making, changing or dropping one (the Select tool, the Magic Wand,
// Deselect) can be undone and redone, and doesn't count as a change to the document.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import select from '@/tools/select';
import wand from '@/tools/wand';

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  Object.assign(workspace, { editorTab: 'output', wandMatch: { fg: false, bg: false, char: true }, wandContiguous: true, wandTolerance: 0 });
  const ctx = { project, workspace, view: 'output' };
  const cell = (c, r) => ({ x: c + 0.5, y: 2 * r + 1 }); // a cell's middle, in grid pixels
  const drag = (from, to) => { select.begin(ctx, cell(...from), {}); select.move(ctx, cell(...from), cell(...to)); select.end(ctx); };
  const click = (c, r, event = {}) => wand.begin(ctx, cell(c, r), event);
  return { project, workspace, drag, click };
}

test('a wand click undoes back to the selection before it and redoes, without changing the document', async () => {
  const { project, workspace, click } = await scene();
  click(2, 2);
  const first = workspace.wand;
  click(7, 7);
  const second = workspace.wand;
  expect(second).not.toBe(first);
  const edits = project.editVersion;
  project.undo();
  expect(workspace.wand).toBe(first);
  project.redo();
  expect(workspace.wand).toBe(second);
  expect(project.editVersion).toBe(edits);
});

test('a rectangle, then the wand, then Deselect: each undoes back to the one before', async () => {
  const { project, workspace, drag, click } = await scene();
  drag([2, 2], [5, 4]);
  expect(workspace.selection).toEqual({ c0: 2, r0: 2, c1: 5, r1: 4 });
  click(3, 3); // inside it: the wand keeps to it
  const made = workspace.wand;
  expect(workspace.selection).toBe(null);
  project.changeSelection((w) => { w.selection = null; w.wand = null; });
  project.undo();
  expect(workspace.wand).toBe(made);
  project.undo();
  expect([workspace.selection, workspace.wand]).toEqual([{ c0: 2, r0: 2, c1: 5, r1: 4 }, null]);
  project.undo();
  expect([workspace.selection, workspace.wand]).toEqual([null, null]);
});

test('a move, then Deselect: undo brings the selection back on the block, then the block and its selection back where they were', async () => {
  const { project, workspace, drag } = await scene();
  project.typeAt(3, 3, 'x', { fg: '#ff0000', bg: '#000000' });
  project.commitEdit();
  drag([2, 2], [5, 4]);
  drag([3, 3], [9, 3]); // inside it: the block moves 6 cells right
  expect(workspace.selection).toEqual({ c0: 8, r0: 2, c1: 11, r1: 4 });
  expect(project.editCellAt(9, 3)?.char).toBe('x');
  project.changeSelection((w) => { w.selection = null; });
  project.undo();
  expect(workspace.selection).toEqual({ c0: 8, r0: 2, c1: 11, r1: 4 });
  project.undo();
  expect(project.editCellAt(3, 3)?.char).toBe('x');
  expect(project.editCellAt(9, 3)).toBe(undefined);
  expect(workspace.selection).toEqual({ c0: 2, r0: 2, c1: 5, r1: 4 });
});
