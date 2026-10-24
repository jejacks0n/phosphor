// Nudging a selection with the arrow keys: a run of nudges is one move from where it started (the
// block floats over what's under its path, as a mouse move does), and one undo step.
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
  for (let i = 0; i < 10; i++) rect = nudged.nudgeSelection(rect, LAYERS, 1, 0);
  expect(rect).toEqual({ c0: 15, r0: 5, c1: 17, r1: 7 });
  nudged.render(); await settle(nudged);
  expect(cellsKey(nudged)).toEqual(cellsKey(moved));
});

test('a run of nudges is one undo step; something else in between starts a new run', async () => {
  const project = await scene();
  const before = cellsKey(project);
  let rect = START;
  for (let i = 0; i < 4; i++) rect = project.nudgeSelection(rect, LAYERS, 0, 1);
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(before);
  expect(project.canUndo).toBe(true); // the typing before it is still there to undo

  project.redo(); await settle(project);
  rect = { c0: 5, r0: 9, c1: 7, r1: 11 };
  project.paintStroke([{ x: 0, y: 0, alpha: 1 }], '#ff0000'); // another edit ends the run
  project.commitEdit();
  const painted = cellsKey(project);
  project.nudgeSelection(rect, LAYERS, 1, 0);
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(painted); // only the new nudge was undone
});

test('nudging back to the start records nothing, and the next nudge doesn\'t undo what came before', async () => {
  const project = await scene();
  const before = cellsKey(project);
  let rect = project.nudgeSelection(START, LAYERS, 1, 0);
  rect = project.nudgeSelection(rect, LAYERS, -1, 0);
  expect(rect).toEqual(START);
  project.nudgeSelection(rect, LAYERS, 0, 1);
  project.render(); await settle(project);
  expect(project.editCellAt(6, 7)?.char).toBe('A'); // moved down, and the typing it carries is intact
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(before);
  expect(project.editCellAt(6, 6)?.char).toBe('A');
});
