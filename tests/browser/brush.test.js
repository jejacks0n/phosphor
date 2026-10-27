// The soft Brush's Flow slider: each stamp lays the slider's value squared (never less than the paint
// layer's smallest step), so its low end builds up gently and 100% is as it always was.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import brush from '@/tools/brush';

async function paint(moves, { size = 5, flow, hardness = 50 }) {
  const { project, workspace } = await createTestApp();
  project.cols = 40;
  project.rows = 40;
  await project.setBlankCanvas();
  await settle(project);
  workspace.editorTab = 'input';
  Object.assign(workspace, { editBrushSize: size, editBrushFlow: flow, editBrushHardness: hardness });
  const ctx = { project, workspace, view: 'input' };
  brush.begin(ctx, moves[0]);
  for (let i = 1; i < moves.length; i++) brush.move(ctx, moves[i - 1], moves[i]);
  brush.end(ctx);
  return (x, y) => Math.round((project.paintLayer.pixelAt(x, y)?.a ?? 0) * 255); // the layer keeps alpha as a byte
}

const click = { x: 20.5, y: 20.5 };
const across = [{ x: 5, y: 20.5 }, { x: 35, y: 20.5 }];

test('Flow squared: a dab at 50% lays a quarter, 100% covers, and the bottom of the slider still paints', async () => {
  expect((await paint([click], { flow: 50 }))(20, 20)).toBe(64);
  expect((await paint([click], { flow: 100 }))(20, 20)).toBe(255);
  expect((await paint([click], { flow: 1 }))(20, 20)).toBe(1);
});

test('the low end builds up gently: one pass at 10% lays a little, where it used to lay most of the way', async () => {
  expect((await paint(across, { flow: 10 }))(20, 20)).toBeLessThan(0.2 * 255);
  expect((await paint(across, { flow: 25 }))(20, 20)).toBeLessThan(0.75 * 255);
});

test('at 100% Flow and Hardness a stroke is solid right out to its edge, as it always was', async () => {
  const at = await paint(across, { size: 10, flow: 100, hardness: 100 });
  expect(Array.from({ length: 9 }, (_, i) => at(20, 16 + i))).toEqual(Array(9).fill(255));
});
