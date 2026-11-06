// Keys from the store: each part's keys eased, deleted, added and moved (document/keys.js), each one undo step; a drag
// is one step, and a canceled one none.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { rectShape, transformed, translation } from '@/document/shapes.js';
import { ease } from '@/document/tweens.js';
import { writeProject } from '@/document/projectIO.js';

async function animated() {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  return project;
}
const T = (at) => ({ part: 'transform', at });
const y = (project, key, at) => project.resolvedOf(at).get(key)?.cell?.m[5];
const ys = (project, key) => project.frames.map((_, at) => y(project, key, at));
// The ball on frame 0 of frames 0 to last, moved to each y on its frame (at to y): Transform keys holding, none eased.
function ball(project, last, moves) {
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < last; i++) project.addFrame('blank');
  for (const [at, to] of Object.entries(moves)) {
    project.showFrame(Number(at));
    const shape = project.shapes.get(key);
    project.updateShapes([[key, transformed(shape, translation(0, to - shape.m[5]))]]);
  }
  project.showFrame(0);
  return key;
}

test('setKeyEasing eases the tween leaving each key, one undo step; a last key is left alone', async () => {
  const project = await animated();
  const key = ball(project, 12, { 6: 24, 12: 48 });
  const version = project.history.version;
  project.setKeyEasing(key, [T(12)], 'linear');
  expect(project.history.version).toBe(version);
  project.setKeyEasing(key, [T(0), T(6), T(12)], 'linear');
  expect(project.history.version).toBe(version + 1);
  expect(project.frames[12].tweens).toBe(null);
  expect(y(project, key, 3)).toBe(12);
  expect(y(project, key, 9)).toBe(36);
  project.setKeyEasing(key, [T(0), T(6)], 'linear');
  expect(project.history.version).toBe(version + 1); // nothing changed: no step
  project.undo();
  expect(project.frames[0].tweens).toBe(null);
  expect(y(project, key, 3)).toBe(0);
});

test('setKeyEasing with none drops the motion; setKeyMotion is only for an eased Transform', async () => {
  const project = await animated();
  const key = ball(project, 6, { 6: 24 });
  const version = project.history.version;
  project.setKeyMotion(key, [T(0)], 'cells');
  expect(project.history.version).toBe(version); // no easing to move by
  project.setKeyEasing(key, [T(0)], 'linear');
  project.setKeyMotion(key, [T(0), { part: 'fill', at: 0 }], 'cells');
  expect(project.frames[0].motions.get(key)).toBe('cells');
  project.setKeyEasing(key, [T(0)], null);
  expect(project.frames[0].motions).toBe(null);
  project.undo();
  expect(project.frames[0].motions.get(key)).toBe('cells');
});

test("deleting a part's next key leaves the key before it last, its easing and motion gone; undo brings them back", async () => {
  const project = await animated();
  const key = ball(project, 12, { 6: 24, 12: 48 });
  project.setKeyEasing(key, [T(6)], 'easeIn');
  project.setKeyMotion(key, [T(6)], 'cells');
  project.deleteKeys(key, [T(12)]);
  expect(project.frames[6].tweens).toBe(null);
  expect(project.frames[6].motions).toBe(null);
  project.undo();
  expect(project.frames[6].tweens.get(key).get('transform')).toBe('easeIn');
  expect(project.frames[6].motions.get(key)).toBe('cells');
});

test('deleteKeys takes a key away, and undo brings it back with its easing', async () => {
  const project = await animated();
  const key = ball(project, 12, { 6: 12, 12: 48 });
  project.setKeyEasing(key, [T(0), T(6)], 'easeIn');
  project.deleteKeys(key, [T(6)]);
  expect(project.frames[6].changes.has(key)).toBe(false);
  expect(y(project, key, 6)).toBeCloseTo(48 * ease('easeIn', 0.5), 3);
  project.undo();
  expect(project.frames[6].tweens.get(key).get('transform')).toBe('easeIn');
  expect(y(project, key, 9)).toBeCloseTo(12 + 36 * ease('easeIn', 0.5), 3);
});

test("deleteKeys skips the shape's first key", async () => {
  const project = await animated();
  const key = ball(project, 6, { 6: 24 });
  const version = project.history.version;
  project.deleteKeys(key, [T(0), { part: 'fill', at: 0 }]);
  expect(project.history.version).toBe(version);
  expect(project.frames[0].changes.has(key)).toBe(true);
});

test('addKey keys a part with the value it shows there, inside a tween both halves eased', async () => {
  const project = await animated();
  const key = ball(project, 6, { 6: 24 });
  project.setKeyEasing(key, [T(0)], 'easeInOut');
  const before = ys(project, key);
  project.showFrame(2);
  project.addKey(key, 'transform');
  expect([...project.frames[2].parts.get(key)]).toEqual(['transform']);
  expect(project.frames[2].tweens.get(key).get('transform')).toBe('easeInOut');
  expect(y(project, key, 2)).toBe(before[2]);
  expect(y(project, key, 1)).toBeCloseTo(before[2] * ease('easeInOut', 0.5), 3);
  const version = project.history.version;
  project.addKey(key, 'transform'); // a key there already
  expect(project.history.version).toBe(version);
  project.undo();
  expect(project.frames[2].changes.has(key)).toBe(false);
  expect(ys(project, key)).toEqual(before);
});

test('moveKeys replaces a same-part key it lands on', async () => {
  const project = await animated();
  const key = ball(project, 12, { 4: 8, 8: 16, 12: 24 });
  const before = ys(project, key);
  expect(project.moveKeys(key, [T(4)], 4)).toEqual([T(8)]);
  expect(project.frames[4].changes.has(key)).toBe(false);
  expect(project.frames[8].changes.get(key).cell.m[5]).toBe(8);
  expect(project.moveKeys(key, [T(8)], 99)).toEqual([T(12)]); // as far as the life goes
  project.undo();
  project.undo();
  expect(project.frames[4].changes.get(key).cell.m[5]).toBe(8);
  expect(project.frames[8].changes.get(key).cell.m[5]).toBe(16);
  expect(ys(project, key)).toEqual(before);
});

test('moving the start later hides the shape on the frames it left; undo shows it again', async () => {
  const project = await animated();
  const key = ball(project, 8, { 6: 24 });
  expect(project.moveKeys(key, [{ part: 'fill', at: 0 }], 2)).toEqual([{ part: 'fill', at: 2 }]);
  expect(project.shapes.has(key)).toBe(false); // frame 0 shows
  expect([y(project, key, 0), y(project, key, 1), y(project, key, 2)]).toEqual([undefined, undefined, 0]);
  project.undo();
  expect(project.shapes.has(key)).toBe(true);
  expect(y(project, key, 1)).toBe(0);
});

test('a drag taking the start past the frame showing shows the frame the shape begins on; undo and cancel go back', async () => {
  const project = await animated();
  const key = ball(project, 8, { 6: 24 });
  const drag = {};
  project.moveKeys(key, [T(0)], 3, drag);
  expect(project.frame).toBe(3); // frame 0 no longer shows the shape
  expect(project.shapes.has(key)).toBe(true);
  project.moveKeys(key, [T(0)], 1, drag);
  expect(project.frame).toBe(1);
  project.endKeyDrag(drag);
  project.undo();
  expect(project.frame).toBe(0);
  const canceled = {};
  project.showFrame(4);
  project.moveKeys(key, [T(0)], 2, canceled);
  expect(project.frame).toBe(4); // still in the shape's life
  project.moveKeys(key, [T(0)], 5, canceled);
  expect(project.frame).toBe(5);
  project.cancelKeyDrag(canceled);
  expect(project.frame).toBe(4);
});

test('a drag is one undo step; a canceled one is none', async () => {
  const project = await animated();
  const key = ball(project, 12, { 4: 8, 12: 24 });
  project.setKeyEasing(key, [T(0), T(4)], 'linear');
  const before = ys(project, key), version = project.history.version;
  const drag = {};
  project.moveKeys(key, [T(4)], 1, drag);
  project.moveKeys(key, [T(4)], 3, drag);
  expect(y(project, key, 7)).toBe(8); // the canvas follows, each move from where the drag began
  expect(project.moveKeys(key, [T(4)], 2, drag)).toEqual([T(6)]);
  expect(project.history.version).toBe(version);
  project.endKeyDrag(drag);
  expect(project.history.version).toBe(version + 1);
  expect(y(project, key, 6)).toBe(8);
  project.undo();
  expect(ys(project, key)).toEqual(before);
  const canceled = {};
  project.moveKeys(key, [T(4)], 2, canceled);
  project.moveKeys(key, [T(4)], -2, canceled);
  project.cancelKeyDrag(canceled);
  expect(project.history.version).toBe(version + 2); // the undo's
  expect(ys(project, key)).toEqual(before);
  const still = {};
  project.moveKeys(key, [T(4)], 2, still);
  project.moveKeys(key, [T(4)], 0, still);
  project.endKeyDrag(still); // back where it began: nothing moved
  expect(project.history.version).toBe(version + 2);
});

// A split key (a frame keyed by an edit inside a tween) given back to the tween when the edit's undone, or the shape's
// put back where the tween has it; a key action there is on purpose, so the frame stays the key it's given.
test("a key moved onto a frame a split keyed stays when the split's part goes back where the tween puts it", async () => {
  const project = await animated();
  const key = ball(project, 8, { 8: 24 });
  project.setKeyEasing(key, [T(0)], 'linear');
  project.showFrame(4);
  project.addKey(key, 'fill');
  project.showFrame(2);
  project.updateShapes([[key, transformed(project.shapes.get(key), translation(5, 0))]]); // splits the Transform's tween
  project.noteFrame();
  expect(project.frames[2].splits.has(key)).toBe(true);
  project.moveKeys(key, [{ part: 'fill', at: 4 }], -2);
  expect([...project.frames[2].parts.get(key)].sort()).toEqual(['fill', 'transform']);
  project.updateShapes([[key, transformed(project.shapes.get(key), translation(-5, 0))]]); // where the tween puts it
  project.showFrame(0);
  project.showFrame(2);
  project.showFrame(0);
  expect([...project.frames[2].parts.get(key)]).toEqual(['fill']);
  project.undo();
  project.undo();
  expect(project.frames[2].splits.has(key)).toBe(true);
  expect([...project.frames[2].parts.get(key)]).toEqual(['transform']);
});

test('keys survive save and open', async () => {
  const project = await animated();
  const key = ball(project, 12, { 4: 8, 8: 16, 12: 24 });
  project.setKeyEasing(key, [T(0), T(4), T(8)], 'easeIn');
  project.moveKeys(key, [T(4)], 1);
  project.deleteKeys(key, [T(8)]);
  const want = ys(project, key);
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'ball.phosphor');
  const { project: opened } = await createTestApp();
  await opened.loadProject(file);
  expect(ys(opened, key)).toEqual(want);
  expect(opened.frames[5].tweens.get(key).get('transform')).toBe('easeIn');
});

test('moving a key before a Wipe keeps how every frame shows, those after the Wipe worked out already', async () => {
  const project = await animated();
  const key = ball(project, 3, { 2: 12 });
  project.showFrame(3);
  project.addFrame('wipe');
  project.addFrame('blank');
  project.showFrame(0);
  ys(project, key); // every frame worked out
  project.moveKeys(key, [T(2)], 1);
  expect(ys(project, key)).toEqual([0, 0, 0, 12, undefined, undefined]);
});
