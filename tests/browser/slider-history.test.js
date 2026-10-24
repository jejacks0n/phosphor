// The Transforms, Adjustments and Image Filters sliders (and their colors) are in undo/redo: a drag
// is one step (setSlider while it moves, commitSliders on release), keyboard nudges on one slider a
// moment apart are one step, and RESET / RESET ALL are one step each.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';

afterEach(() => vi.useRealTimers());

async function app() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  return { project, workspace };
}

function drag(project, key, values) {
  for (const v of values) project.setSlider(key, v);
  project.commitSliders(key);
}
const nudge = (project, key, value) => {
  project.setSlider(key, value);
  project.commitSliders(key, { nudge: true });
};

test('a drag is one step: undo puts the value and the picture back, redo repeats it', async () => {
  const { project } = await app();
  const cells = cellsKey(project);
  expect(project.canUndo).toBe(false);
  drag(project, 'contrast', [110, 125, 140, 160]);
  await settle(project);
  const dragged = cellsKey(project);
  expect(project.canUndo).toBe(true);
  project.undo();
  await settle(project);
  expect(project.contrast).toBe(100);
  expect(cellsKey(project)).toEqual(cells);
  expect(project.canUndo).toBe(false);
  project.redo();
  await settle(project);
  expect(project.contrast).toBe(160);
  expect(cellsKey(project)).toEqual(dragged);
});

test('a drag that ends where it began adds nothing; the colors count too', async () => {
  const { project } = await app();
  drag(project, 'brightness', [120, 100]);
  expect(project.canUndo).toBe(false);
  drag(project, 'edgeColor', ['#ff0000']);
  project.undo();
  expect(project.edgeColor).toBe('#000000');
});

test('keyboard nudges on one slider a moment apart are one step; a pause or another slider starts a new one', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { project } = await app();
  for (const v of [101, 102, 103]) nudge(project, 'saturation', v);
  vi.advanceTimersByTime(2000);
  nudge(project, 'saturation', 104);
  nudge(project, 'hue', 10);
  project.undo();
  expect([project.saturation, project.hue]).toEqual([104, 0]);
  project.undo();
  expect(project.saturation).toBe(103);
  project.undo();
  expect(project.saturation).toBe(100);
  expect(project.canUndo).toBe(false);
});

test('a drag right after nudges, or two drags, are separate steps', async () => {
  const { project } = await app();
  nudge(project, 'contrast', 101);
  drag(project, 'contrast', [150]);
  drag(project, 'contrast', [170]);
  project.undo();
  expect(project.contrast).toBe(150);
  project.undo();
  expect(project.contrast).toBe(101);
});

test('RESET and RESET ALL are one step each', async () => {
  const { project } = await app();
  drag(project, 'contrast', [150]);
  drag(project, 'sharpen', [30]);
  project.resetGroup('adjust');
  expect(project.contrast).toBe(100);
  project.resetSliders();
  expect(project.sharpen).toBe(0);
  project.undo();
  expect([project.contrast, project.sharpen]).toEqual([100, 30]);
  project.undo();
  expect(project.contrast).toBe(150);
});

test('slider steps and drawing share one history, in order', async () => {
  const { project } = await app();
  drag(project, 'contrast', [150]);
  project.paintStroke([{ x: 5, y: 5, alpha: 1 }], '#ff0000');
  project.commitEdit();
  project.undo();
  expect(project.hasEdits).toBe(false);
  expect(project.contrast).toBe(150);
  project.undo();
  expect(project.contrast).toBe(100);
});

test('after a bake, slider moves are their own steps: undo them, then the bake', async () => {
  const { project } = await app();
  drag(project, 'brightness', [140]);
  await settle(project);
  const image = project.image;
  await project.bake();
  drag(project, 'contrast', [150]);
  project.undo();
  expect(project.contrast).toBe(100);
  project.undo();
  await settle(project);
  expect([project.image, project.brightness]).toEqual([image, 140]);
  project.redo();
  project.redo();
  await settle(project);
  expect([project.brightness, project.contrast]).toEqual([100, 150]);
});
