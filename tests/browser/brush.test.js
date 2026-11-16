// The soft Brush's Flow slider: each stamp lays the slider's value squared (never less than the paint
// layer's smallest step), so its low end builds up gently and 100% is as it always was.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import brush from '@/tools/brush';

async function paint(moves, { size = 5, flow, hardness = 50 }) {
  const { project, workspace } = await createTestApp();
  project.cols = 40;
  project.rows = 40;
  await project.setBlankCanvas({ withLayer: true });
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

// A stroke builds up the same on the base as on a layer: within it, its dabs add up as they do on a layer's clear
// pixels, and the stroke is then laid over what was there, rather than each dab blending into the opaque pixel
// (which left white paint on the base's black a dimmer gray than on a layer over it).
for (const hardness of [100, 0]) {
  test(`a white stroke on the base shows as it does on a layer over it (hardness ${hardness})`, async () => {
    const shown = async (layer) => {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ cols: 20, rows: 20 });
      await settle(project);
      workspace.editorTab = 'input';
      workspace.pickLayer(layer);
      Object.assign(workspace, { editFgColor: '#ffffff', editBrushSize: 6, editBrushHardness: hardness, editBrushOpacity: 100 });
      const ctx = { project, workspace, view: 'input' };
      brush.begin(ctx, { x: 10, y: 10 }, {});
      brush.move(ctx, { x: 10, y: 10 }, { x: 10, y: 10.5 });
      brush.end(ctx);
      await settle(project);
      return [8, 9, 10, 11, 12].flatMap((col) => { const cell = project.cells[col + 5 * 20]; return [parseInt(cell.fg.hex.slice(1, 3), 16), parseInt(cell.bg.hex.slice(1, 3), 16)]; });
    };
    const onLayer = await shown('edit'), onBase = await shown('base');
    expect(onLayer.some((v) => v > 100)).toBe(true);
    onBase.forEach((v, i) => expect(Math.abs(v - onLayer[i])).toBeLessThanOrEqual(2));
  });
}
