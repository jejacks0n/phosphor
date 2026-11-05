// Tweens: a shape between two of its key frames shows where its tween puts it, shown, played or exported; only an
// edit makes a frame a key frame, and the frames between follow their keys.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { rectShape, translation, transformed } from '@/document/shapes.js';
import { ease } from '@/document/tweens.js';
import { writeProject } from '@/document/projectIO.js';

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  return { project, workspace };
}
const moveBy = (project, key, dx, dy) => project.updateShapes([[key, transformed(project.shapes.get(key), translation(dx, dy))]]);
const y = (project, key) => project.shapes.get(key).m[5];
const cellsOf = (built) => built.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);

// A ball: on frame 0, then six Blank frames, moved down 24 on frame 6, with a tween from frame 0 to frame 6; frame 0 shows.
function bounce(project, easing) {
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 6; i++) project.addFrame('blank');
  moveBy(project, key, 0, 24);
  project.showFrame(0);
  project.setTween([key], easing);
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

test('the Tween choice is one undo step, and undo brings the frames between back', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  project.setTween([key], 'linear');
  expect(y(project, key)).toBe(12);
  project.undo();
  expect(y(project, key)).toBe(3);
  project.undo();
  expect(y(project, key)).toBe(0);
  project.redo();
  project.redo();
  expect(y(project, key)).toBe(12);
});

test("undoing the far key frame's edit brings the frames between back", async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  project.showFrame(6);
  moveBy(project, key, 0, 8);
  project.showFrame(3);
  expect(y(project, key)).toBe(4);
  project.undo();
  project.showFrame(3);
  expect(y(project, key)).toBe(3);
});

test('adding, deleting or moving a frame inside a tween redraws the frames it reaches', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  const at = (i) => (project.showFrame(i), y(project, key));
  const eased = (t) => Math.round(24 * ease('easeIn', t) * 1e4) / 1e4;
  project.showFrame(6);
  project.addFrame('blank'); // a frame after the far key, for it to fold into when deleted
  for (let i = 1; i < 6; i++) at(i); // every frame between resolved, so a cache left behind would show
  project.showFrame(3);
  project.addFrame('blank'); // 0 to 7 now
  expect(at(2)).toBe(eased(2 / 7));
  expect(at(3)).toBe(eased(3 / 7));
  project.undo();
  expect(at(2)).toBe(eased(2 / 6));
  expect(at(3)).toBe(3);
  project.showFrame(3);
  project.deleteFrame(); // 0 to 5
  expect(at(2)).toBe(eased(2 / 5));
  expect(at(4)).toBe(eased(4 / 5));
  project.undo();
  project.showFrame(6);
  project.deleteFrame(); // the far key: the frame after it takes its shape, 0 to 6 again
  expect(project.frames[6].changes.has(key)).toBe(true);
  expect(at(3)).toBe(3);
  project.undo();
  project.moveFrame(6, 2); // the far key moved to frame 2: 0 to 2
  expect(at(1)).toBe(eased(1 / 2));
});

test('a project keeps its tweens when saved and opened', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'ball.phosphor');
  const { project: opened } = await createTestApp();
  await opened.loadProject(file);
  opened.showFrame(3);
  expect(y(opened, key)).toBe(3);
});
