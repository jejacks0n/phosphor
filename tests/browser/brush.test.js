// The soft Brush tool: Flow is how much a dab lays, and a stroke in one pass, the same at any size,
// squared so its low end builds up gently; a stroke lays the same paint however the pointer's moves
// divide it.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import brush from '@/tools/brush';

async function stroke(moves, { size = 6, flow = 50 } = {}) {
  const { project, workspace } = await createTestApp();
  project.cols = 40;
  project.rows = 40;
  await project.setBlankCanvas();
  await settle(project);
  workspace.editorTab = 'input';
  workspace.editBrushSize = size;
  workspace.editBrushFlow = flow;
  const ctx = { project, workspace, view: 'input' };
  for (const points of moves) {
    brush.begin(ctx, points[0]);
    for (let i = 1; i < points.length; i++) brush.move(ctx, points[i - 1], points[i]);
    brush.end(ctx);
  }
  const alphas = [];
  for (let x = 0; x < 40; x++) alphas.push(Math.round((project.paintLayer.pixelAt(x, 20)?.a ?? 0) * 255)); // the layer keeps alpha as a byte
  return alphas;
}

const along = (x0, x1, step) => Array.from({ length: Math.round((x1 - x0) / step) + 1 }, (_, i) => ({ x: x0 + i * step, y: 20.5 }));

test('a stroke of many small moves paints what one long move does, and a second stroke starts afresh', async () => {
  const quick = await stroke([[{ x: 5, y: 20.5 }, { x: 30, y: 20.5 }]]);
  expect(await stroke([along(5, 30, 0.25)])).toEqual(quick);
  expect(quick[18]).toBeGreaterThan(0);
  // Two strokes over the same line lay twice the paint of one (to within the byte's rounding).
  const twice = await stroke([along(5, 30, 0.5), along(5, 30, 0.5)]);
  expect(Math.abs(twice[18] - Math.min(255, quick[18] * 2))).toBeLessThanOrEqual(2);
});

test('a stroke lays Flow squared in one pass at any size, and a click at 100% covers', async () => {
  const middle = async (size, flow) => (await stroke([along(5, 35, 0.5)], { size, flow }))[20] / 255;
  // A big brush's stamps each lay a sliver of that, too little for the layer's alpha byte on its own.
  for (const size of [3, 8, 16]) {
    const laid = {};
    for (const flow of [10, 25, 50]) laid[flow] = await middle(size, flow);
    expect(laid[10]).toBeGreaterThan(0.005);  // 1%
    expect(laid[10]).toBeLessThan(0.02);
    expect(laid[25]).toBeGreaterThan(0.05);   // 6%
    expect(laid[25]).toBeLessThan(0.075);
    expect(laid[50]).toBeGreaterThan(0.23);   // 25%
    expect(laid[50]).toBeLessThan(0.27);
  }
  const dab = await stroke([[{ x: 20.5, y: 20.5 }]], { size: 6, flow: 100 });
  expect(dab[20]).toBe(255);
  for (const size of [3, 8, 16]) expect(await middle(size, 100)).toBe(1); // and so does a stroke
});

test('a stroke starts as strong as it goes on: no heavier blob where it began', async () => {
  const laid = await stroke([along(10, 35, 0.5)], { size: 8, flow: 50 });
  expect(Math.abs(laid[10] - laid[22]) / laid[22]).toBeLessThan(0.15);
});
