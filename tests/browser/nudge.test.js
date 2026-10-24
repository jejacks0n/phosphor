// Moving a selection floats it: every move of the same selection (drags, arrow-key nudges), and a
// paste with the moves after it, is one change from where it started, until the selection is
// cleared or replaced. What's under the path comes back; the run is one undo step.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';

async function scene() {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  for (const [c, ch] of [[6, 'A'], [7, 'B']]) project.typeAt(c, 6, ch, { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  return project;
}
const LAYERS = { base: true, edit: true };
const START = { c0: 5, r0: 5, c1: 7, r1: 7 }; // 3 wide, nudged 10: further than its own width

test('ten nudges right give what one move of ten does: no trail along the path', async () => {
  const moved = await scene();
  moved.moveSelection(START, LAYERS, 10, 0);
  moved.render(); await settle(moved);

  const nudged = await scene();
  let rect = START;
  for (let i = 0; i < 10; i++) rect = nudged.floatSelection(rect, LAYERS, 1, 0);
  expect(rect).toEqual({ c0: 15, r0: 5, c1: 17, r1: 7 });
  nudged.render(); await settle(nudged);
  expect(cellsKey(nudged)).toEqual(cellsKey(moved));
});

test('a run of nudges is one undo step; something else in between starts a new run', async () => {
  const project = await scene();
  const before = cellsKey(project);
  let rect = START;
  for (let i = 0; i < 4; i++) rect = project.floatSelection(rect, LAYERS, 0, 1);
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(before);
  expect(project.canUndo).toBe(true); // the typing before it is still there to undo

  project.redo(); await settle(project);
  rect = { c0: 5, r0: 9, c1: 7, r1: 11 };
  project.paintStroke([{ x: 0, y: 0, alpha: 1 }], '#ff0000'); // another edit ends the run
  project.commitEdit();
  const painted = cellsKey(project);
  project.floatSelection(rect, LAYERS, 1, 0);
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(painted); // only the new nudge was undone
});

test('nudging back to the start records nothing, and the next nudge doesn\'t undo what came before', async () => {
  const project = await scene();
  const before = cellsKey(project);
  let rect = project.floatSelection(START, LAYERS, 1, 0);
  rect = project.floatSelection(rect, LAYERS, -1, 0);
  expect(rect).toEqual(START);
  project.floatSelection(rect, LAYERS, 0, 1);
  project.render(); await settle(project);
  expect(project.editCellAt(6, 7)?.char).toBe('A'); // moved down, and the typing it carries is intact
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(before);
  expect(project.editCellAt(6, 6)?.char).toBe('A');
});

test('two drags in a row are one move: the first drop isn\'t stamped', async () => {
  const once = await scene();
  once.moveSelection(START, LAYERS, 6, 3);
  once.render(); await settle(once);

  const twice = await scene();
  let rect = twice.floatSelection(START, LAYERS, 4, 0); // let go here...
  rect = twice.floatSelection(rect, LAYERS, 2, 3);       // ...and drag it on
  expect(rect).toEqual({ c0: 11, r0: 8, c1: 13, r1: 10 });
  twice.render(); await settle(twice);
  expect(cellsKey(twice)).toEqual(cellsKey(once));
});

test('a paste floats too: moving it brings back what it first landed on', async () => {
  const project = await scene();
  const block = project.copySelection(START, LAYERS);
  const under = cellsKey(project);
  let rect = project.pasteSelection(block, 15, 10); // the grid's 15 character rows: 0-14
  rect = project.floatSelection(rect, LAYERS, 5, 0);
  project.render(); await settle(project);
  const after = cellsKey(project);
  for (const col of [15, 16, 17]) expect(after[10 * 30 + col]).toBe(under[10 * 30 + col]); // where it first landed
  expect(rect).toEqual({ c0: 20, r0: 10, c1: 22, r1: 12 });
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(under); // the paste and its moves: one step
});

test('deselecting leaves it where it is: selecting the same cells again starts a new move', async () => {
  const project = await scene();
  const landed = project.floatSelection(START, LAYERS, 4, 0);
  const stamped = cellsKey(project);
  const again = { ...landed }; // a new selection of the same cells (after Escape)
  project.floatSelection(again, LAYERS, 0, 5);
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(stamped); // only the second move was undone
});
