// The soft Brush tool: a stroke lays the brush's shape at Flow, the same at any size (each pixel takes
// the most any of its stamps gives, not their sum), however the pointer's moves divide it; strokes
// build up on each other.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import brush from '@/tools/brush';

async function stroke(moves, { size = 6, flow = 50, hardness = 50, column = null } = {}) {
  const { project, workspace } = await createTestApp();
  project.cols = 40;
  project.rows = 40;
  await project.setBlankCanvas();
  await settle(project);
  workspace.editorTab = 'input';
  workspace.editBrushSize = size;
  workspace.editBrushFlow = flow;
  workspace.editBrushHardness = hardness;
  const ctx = { project, workspace, view: 'input' };
  for (const points of moves) {
    brush.begin(ctx, points[0]);
    for (let i = 1; i < points.length; i++) brush.move(ctx, points[i - 1], points[i]);
    brush.end(ctx);
  }
  const alphas = [];
  if (column !== null) { // down one column, across the stroke
    for (let y = 0; y < 40; y++) alphas.push(Math.round((project.paintLayer.pixelAt(column, y)?.a ?? 0) * 255));
    return alphas;
  }
  for (let x = 0; x < 40; x++) alphas.push(Math.round((project.paintLayer.pixelAt(x, 20)?.a ?? 0) * 255)); // the layer keeps alpha as a byte
  return alphas;
}

const along = (x0, x1, step) => Array.from({ length: Math.round((x1 - x0) / step) + 1 }, (_, i) => ({ x: x0 + i * step, y: 20.5 }));

test('a stroke of many small moves paints what one long move does, and strokes build up on each other', async () => {
  const quick = await stroke([[{ x: 5, y: 20.5 }, { x: 30, y: 20.5 }]]);
  expect(await stroke([along(5, 30, 0.25)])).toEqual(quick);
  expect(quick[18]).toBeGreaterThan(0);
  // Two strokes over the same line lay twice the paint of one (to within the byte's rounding).
  const twice = await stroke([along(5, 30, 0.5), along(5, 30, 0.5)]);
  expect(Math.abs(twice[18] - Math.min(255, quick[18] * 2))).toBeLessThanOrEqual(2);
});

test('a stroke lays Flow at its center at any size, and a click lays the same', async () => {
  const middle = async (size, flow) => (await stroke([along(5, 35, 0.5)], { size, flow }))[20] / 255;
  for (const size of [3, 8, 16]) {
    for (const flow of [5, 10, 25, 50, 100]) expect(Math.abs(await middle(size, flow) - flow / 100)).toBeLessThan(0.005);
  }
  expect((await stroke([[{ x: 20.5, y: 20.5 }]], { size: 6, flow: 30 }))[20]).toBe(Math.round(0.3 * 255));
});

test('a stroke starts as strong as it goes on: no heavier blob where it began', async () => {
  const laid = await stroke([along(10, 35, 0.5)], { size: 8, flow: 50 });
  expect(Math.abs(laid[10] - laid[22]) / laid[22]).toBeLessThan(0.15);
});

test('at 100% Flow and Hardness a stroke is solid right out to its edge', async () => {
  const across = await stroke([along(5, 35, 0.5)], { size: 10, flow: 100, hardness: 100, column: 20 });
  expect(across.slice(16, 25)).toEqual(Array(9).fill(255)); // rows 16 to 24 of a 10-wide stroke centered on 20.5
});
