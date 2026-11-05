// Tweens: a shape between two of its key frames shows where its tween puts it, shown, played or exported; only an
// edit makes a frame a key frame, and the frames between follow their keys.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { rectShape, translation, transformed } from '@/document/shapes.js';
import { ease } from '@/document/tweens.js';

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  return { project, workspace };
}
const moveBy = (project, key, dx, dy) => project.updateShapes([[key, transformed(project.shapes.get(key), translation(dx, dy))]]);
const y = (project, key) => project.shapes.get(key).m[5];
const cellsOf = (built) => built.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);

// A ball: on frame 0, then six Blank frames, moved down 24 on frame 6, with a tween from frame 0 to frame 6.
function bounce(project, easing) {
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 6; i++) project.addFrame('blank');
  moveBy(project, key, 0, 24);
  project.showFrame(0);
  project.frames[0].tweens = new Map([[key, easing]]);
  project.staleFrames(0);
  return key;
}

test("an in-between frame shows the shape where its tween puts it, and visiting it doesn't make it a key", async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  expect(y(project, key)).toBe(3);
  expect(project.inheritedShapes().has(key)).toBe(true);
  project.showFrame(4);
  project.showFrame(3);
  project.showFrame(0);
  expect(project.frames[3].changes.has(key)).toBe(false);
  project.showFrame(3);
  expect(y(project, key)).toBe(3);
});

test('changing the far key frame redraws the frames before it', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  project.showFrame(6);
  moveBy(project, key, 0, 8);
  project.showFrame(3);
  expect(y(project, key)).toBe(4);
});

test('moving the shape on an in-between frame makes it a key, and both halves keep the easing', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  moveBy(project, key, 10, 0);
  project.showFrame(0);
  expect(project.frames[3].changes.has(key)).toBe(true);
  expect(project.frames[3].tweens.get(key)).toBe('easeIn');
  project.showFrame(2);
  expect(project.shapes.get(key).m[4]).toBeCloseTo(10 * ease('easeIn', 2 / 3), 3);
});

test('undoing an edit on an in-between frame gives it back to the tween', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  moveBy(project, key, 10, 0);
  project.undo();
  project.showFrame(0);
  expect(project.frames[3].changes.has(key)).toBe(false);
  project.showFrame(3);
  expect(y(project, key)).toBe(3);
  expect(project.shapes.get(key).m[4]).toBe(0);
});

test('playing and exporting build the tweened frame', async () => {
  const { project } = await animated();
  bounce(project, 'easeIn');
  const tweened = cellsOf(await project.builtFrame(3));
  expect(tweened).not.toEqual(cellsOf(await project.builtFrame(1)));
  project.frames[0].tweens = null;
  project.staleFrames(0);
  expect(cellsOf(await project.builtFrame(3))).not.toEqual(tweened);
});
