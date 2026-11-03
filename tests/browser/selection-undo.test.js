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

// A paste, then a drag: the paste is one step and the drag another, and undo or redo leaves the block
// floating where it was, so it can be dragged on from there.
test('a pasted block that was dragged: undo puts it back where it was pasted, still floating; undo again takes it away', async () => {
  const { project, workspace, drag } = await scene();
  project.typeAt(3, 3, 'x', { fg: '#ff0000', bg: '#000000' });
  project.typeAt(10, 5, 'o', { fg: '#00ff00', bg: '#000000' });
  project.commitEdit();
  const block = project.copySelection({ c0: 3, r0: 3, c1: 3, r1: 3 }, { base: true, edit: true });
  workspace.selectAll(project.pasteSelection(block, 10, 5));
  drag([10, 5], [14, 5]);
  expect(project.editCellAt(14, 5)?.char).toBe('x');
  expect(project.editCellAt(10, 5)?.char).toBe('o'); // what it was pasted on comes back

  project.undo();
  expect(project.editCellAt(10, 5)?.char).toBe('x');
  expect(project.editCellAt(14, 5)).toBe(undefined);
  expect(workspace.selection).toEqual({ c0: 10, r0: 5, c1: 10, r1: 5 });
  drag([10, 5], [12, 7]); // still floating: it moves, and what it was pasted on comes back
  expect(project.editCellAt(12, 7)?.char).toBe('x');
  expect(project.editCellAt(10, 5)?.char).toBe('o');

  project.undo();
  project.undo();
  expect(project.editCellAt(10, 5)?.char).toBe('o');
  expect(project.editCellAt(12, 7)).toBe(undefined);
  expect(workspace.selection).toBe(null);
});

test('redo puts a pasted block back where it was dragged, floating, so it can be dragged on', async () => {
  const { project, workspace, drag } = await scene();
  project.typeAt(3, 3, 'x', { fg: '#ff0000', bg: '#000000' });
  project.typeAt(10, 5, 'o', { fg: '#00ff00', bg: '#000000' });
  project.commitEdit();
  const block = project.copySelection({ c0: 3, r0: 3, c1: 3, r1: 3 }, { base: true, edit: true });
  workspace.selectAll(project.pasteSelection(block, 10, 5));
  drag([10, 5], [14, 5]);
  project.undo();
  project.undo();
  project.redo();
  expect(project.editCellAt(10, 5)?.char).toBe('x');
  expect(workspace.selection).toEqual({ c0: 10, r0: 5, c1: 10, r1: 5 });
  project.redo();
  expect(project.editCellAt(14, 5)?.char).toBe('x');
  expect(project.editCellAt(10, 5)?.char).toBe('o');
  expect(workspace.selection).toEqual({ c0: 14, r0: 5, c1: 14, r1: 5 });
  drag([14, 5], [16, 5]);
  expect(project.editCellAt(16, 5)?.char).toBe('x');
  expect(project.editCellAt(14, 5)).toBe(undefined);
  expect(project.editCellAt(10, 5)?.char).toBe('o');
  project.undo(); // the drags after the paste are one step
  expect(project.editCellAt(10, 5)?.char).toBe('x');
  expect(project.editCellAt(16, 5)).toBe(undefined);
});

test('a move undone and redone still floats: dragging on is the same move, one undo step from where it started', async () => {
  const { project, workspace, drag } = await scene();
  project.typeAt(3, 3, 'x', { fg: '#ff0000', bg: '#000000' });
  project.commitEdit();
  drag([2, 2], [5, 4]);
  drag([3, 3], [9, 3]);
  project.undo();
  project.redo();
  expect(workspace.selection).toEqual({ c0: 8, r0: 2, c1: 11, r1: 4 });
  drag([9, 3], [12, 3]);
  expect(project.editCellAt(12, 3)?.char).toBe('x');
  project.undo();
  expect(project.editCellAt(3, 3)?.char).toBe('x');
  expect(project.editCellAt(12, 3)).toBe(undefined);
  expect(workspace.selection).toEqual({ c0: 2, r0: 2, c1: 5, r1: 4 });
});
