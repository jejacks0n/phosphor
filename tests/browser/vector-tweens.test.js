// Tweens: a shape between two of its key frames shows where its tween puts it, shown, played or exported; only an
// edit makes a frame a key frame, and the frames between follow their keys.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { isShapeKey, rectShape, translation, transformed, rotation, withShape, worldPoints } from '@/document/shapes.js';
import { MOTIONS, ease, strayEasings, tweenPart } from '@/document/tweens.js';
import { PARTS } from '@/document/parts.js';
import { partKeys } from '@/document/keys.js';
import { writeProject } from '@/document/projectIO.js';
import vnode from '@/tools/vnode.js';

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  return { project, workspace };
}
const moveBy = (project, key, dx, dy) => project.updateShapes([[key, transformed(project.shapes.get(key), translation(dx, dy))]]);
const y = (project, key) => project.shapes.get(key).m[5];
const T = (at) => ({ part: 'transform', at });
// Every part's key on frame at eases the tween leaving it, as the Keys panel does with a frame's keys selected.
const easeAt = (project, key, at, easing) => project.setKeyEasing(key, PARTS.map((part) => ({ part, at })), easing);
const transformKeys = (project, key) => partKeys(project.frames, key, project.frame).rows.get('transform');
const cellsOf = (built) => built.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);

// A ball: on frame 0, then six Blank frames, moved down 24 on frame 6, with a tween from frame 0 to frame 6; frame 0 shows.
function bounce(project, easing) {
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 6; i++) project.addFrame('blank');
  moveBy(project, key, 0, 24);
  project.showFrame(0);
  easeAt(project, key, 0, easing);
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
  expect(project.frames[3].tweens.get(key)).toEqual(new Map([['transform', 'easeIn']]));
  project.showFrame(2);
  expect(project.shapes.get(key).m[4]).toBeCloseTo(10 * ease('easeIn', 2 / 3), 3);
});

test('a Node edit mid-tween keys only the outline, and the move runs on without stopping', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 11; i++) project.addFrame('blank');
  moveBy(project, key, 22, 0);
  project.showFrame(0);
  easeAt(project, key, 0, 'easeInOut');
  const xs = () => project.frames.map((_, i) => project.resolvedOf(i).get(key).cell.m[4]);
  const want = Array.from({ length: 12 }, (_, i) => 22 * ease('easeInOut', i / 11));
  xs().forEach((x, i) => expect(x).toBeCloseTo(want[i], 2));
  project.showFrame(5);
  const shape = project.shapes.get(key), points = shape.points.map((p, j) => (j ? p : [p[0] - 1, ...p.slice(1)]));
  project.updateShapes([[key, withShape(shape, { points })]]);
  project.showFrame(0);
  expect([...project.frames[5].parts.get(key)]).toEqual(['outline']);
  xs().forEach((x, i) => expect(x).toBeCloseTo(want[i], 2)); // was 0, 0.32, 2.56, 7.44, 9.68, 10, 10.22…
});

// The ball above with frame 5's outline edited, as one change or as the Node tool's drag (an edit open across moves).
async function outlineEdited(byDrag) {
  const { project, workspace } = await animated();
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 11; i++) project.addFrame('blank');
  moveBy(project, key, 22, 0);
  project.showFrame(0);
  easeAt(project, key, 0, 'easeInOut');
  project.showFrame(5);
  await settle(project);
  const shape = project.shapes.get(key);
  if (byDrag) {
    workspace.vectorPoints = key;
    const ctx = { project, workspace, view: 'vector', unit: { x: 8, y: 8 } }, at = worldPoints(shape)[0];
    vnode.begin(ctx, at);
    vnode.move(ctx, at, { x: at.x - 0.5, y: at.y });
    vnode.move(ctx, at, { x: at.x - 1, y: at.y });
    vnode.end(ctx);
  } else {
    project.updateShapes([[key, withShape(shape, { points: shape.points.map((p, j) => (j ? p : [p[0] - 1, ...p.slice(1)])) })]]);
  }
  await settle(project);
  return { project, key };
}
// The frame showing's outline is the shape it's worked out to, and its cells are what building it fresh and rendering
// it from scratch make.
async function drawnAsWorkedOut(project, key) {
  const cells = cellsKey(project);
  expect(project.shapes.get(key)).toEqual(project.resolvedOf(5).get(key).cell); // as shown, then as the frame is set down
  expect(cellsOf(await project.builtFrame(5))).toEqual(cells);
  project.staleFrames(0);
  expect(cellsOf(await project.builtFrame(5))).toEqual(cells);
  project.renderer.reset();
  project.render();
  await settle(project);
  expect(cellsKey(project)).toEqual(cells);
}

for (const [how, byDrag] of [['an edit', false], ['a Node drag', true]]) {
  test(`after ${how} of the outline mid-tween, the outline and the cells are where the frame puts the shape, and after its undo`, async () => {
    const { project, key } = await outlineEdited(byDrag);
    const edited = project.shapes.get(key);
    await drawnAsWorkedOut(project, key);
    expect([...project.frames[5].parts.get(key)]).toEqual(['outline']);
    project.undo();
    await settle(project);
    expect(project.shapes.get(key)).not.toEqual(edited);
    await drawnAsWorkedOut(project, key);
  });
}

test('shapes put back on the frame showing (an undo puts back what the frame has by now) are drawn there', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  await settle(project);
  project.putShapesBack([[key, transformed(project.shapes.get(key), translation(3, 0))]]);
  const cells = cellsKey(project);
  project.renderer.reset();
  project.render();
  await settle(project);
  expect(cells).toEqual(cellsKey(project)); // were the shape's cells from before, until something drew there
});

test("keying a second part on a frame that's already a key for another part splits that part's tween too", async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 12; i++) project.addFrame('blank');
  project.updateShapes([[key, withShape(transformed(project.shapes.get(key), translation(0, 24)), { fill: '#0000ff' })]]);
  project.showFrame(0);
  easeAt(project, key, 0, 'linear');
  const red = project.frames[0].changes.get(key).cell, blue = project.frames[12].changes.get(key).cell;
  const fill = (i) => project.resolvedOf(i).get(key).cell.fill;
  project.showFrame(6);
  moveBy(project, key, 4, 0);
  project.noteFrame();
  expect([...project.frames[6].parts.get(key)]).toEqual(['transform']);
  project.updateShapes([[key, withShape(project.shapes.get(key), { fill: '#00ff00' })]]);
  project.showFrame(0);
  expect(project.frames[6].tweens.get(key)).toEqual(new Map([['transform', 'linear'], ['fill', 'linear']]));
  const green = project.frames[6].changes.get(key).cell;
  expect(fill(3)).toBe(tweenPart('fill', red, green, 0.5).fill);
  expect(fill(9)).toBe(tweenPart('fill', green, blue, 0.5).fill);
  project.undo();
  project.showFrame(0);
  expect([...project.frames[6].parts.get(key)]).toEqual(['transform']);
  expect(fill(9)).toBe(tweenPart('fill', red, blue, 0.75).fill);
});

test("undoing a part's split on a frame that was already a key leaves it the key it was, though it sits where the tween puts it", async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 12; i++) project.addFrame('blank');
  project.updateShapes([[key, withShape(transformed(project.shapes.get(key), translation(0, 24)), { fill: '#0000ff' })]]);
  project.showFrame(6);
  moveBy(project, key, 0, 12); // a key for the Transform, made with no tween
  project.showFrame(0);
  easeAt(project, key, 0, 'linear');
  const ys = () => project.frames.map((_, i) => project.resolvedOf(i).get(key).cell.m[5]);
  const want = [0, 2, 4, 6, 8, 10, 12, 12, 12, 12, 12, 12, 24];
  expect(ys()).toEqual(want);
  project.showFrame(6);
  project.updateShapes([[key, withShape(project.shapes.get(key), { fill: '#00ff00' })]]); // splits the fill's tween
  project.noteFrame(); // set down, as anything after it does
  project.undo();
  project.showFrame(0);
  expect([...project.frames[6].parts.get(key)]).toEqual(['transform']);
  expect(ys()).toEqual(want);
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

test('an easing is one undo step, and undo brings the frames between back', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  easeAt(project, key, 0, 'linear');
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

test('clearing the far key frame, and undoing that, redraws the frames between', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  for (let i = 1; i < 6; i++) project.showFrame(i);
  project.showFrame(6);
  project.clearEditLayer();
  project.showFrame(3);
  expect(y(project, key)).toBe(0);
  project.undo();
  project.showFrame(3);
  expect(y(project, key)).toBe(3);
});

test('a key frame made without a tween stays one when its shape is where a tween across it would be', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  for (let i = 0; i < 4; i++) project.addFrame('blank');
  project.showFrame(2);
  moveBy(project, key, 0, 12);
  project.showFrame(4);
  moveBy(project, key, 0, 24 - 12);
  project.showFrame(0);
  easeAt(project, key, 0, 'linear'); // 0 to 2: frame 2 sits exactly half way from 0 to 4
  project.showFrame(2);
  easeAt(project, key, 2, 'easeOut'); // 2 to 4
  project.addShape(rectShape(10, 2, 12, 4, { fill: '#00ff00' })); // any edit on frame 2
  project.showFrame(3);
  expect(project.frames[2].changes.has(key)).toBe(true);
  expect(y(project, key)).toBe(12 + 12 * ease('easeOut', 0.5));
});

test('a tween given up leaves no easing behind to come back with the next key', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.showFrame(3);
  moveBy(project, key, 10, 0); // a key, with the tween's easing
  project.showFrame(0);
  expect(project.frames[3].changes.has(key)).toBe(true);
  project.undo();
  project.showFrame(0);
  expect(project.frames[3].changes.has(key)).toBe(false);
  expect(project.frames[3].tweens.get(key).get('transform')).toBe('easeIn'); // left from the key the undo took back
  easeAt(project, key, 0, null);
  project.showFrame(3);
  moveBy(project, key, 10, 0); // a key again, in no tween now
  project.showFrame(4);
  expect(y(project, key)).toBe(0);
  expect(project.frames[3].tweens?.has(key) ?? false).toBe(false);
});

test("playing and exporting see an edit to the far key frame that the frame showing hasn't set down yet", async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  const before = cellsOf(await project.builtFrame(3));
  project.showFrame(6);
  moveBy(project, key, 0, 8);
  const direct = cellsOf(await project.builtFrame(3));
  project.showFrame(3);
  expect(direct).toEqual(cellsOf(await project.builtFrame(3)));
  expect(direct).not.toEqual(before);
});

test('redoing the delete of a last frame that a tween ran to redraws the frames between', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  for (let i = 1; i < 6; i++) project.showFrame(i);
  project.showFrame(6);
  project.deleteFrame(); // the far key, and the last frame: no tween now
  project.undo();
  for (let i = 1; i < 6; i++) project.showFrame(i);
  project.redo();
  project.showFrame(3);
  expect(y(project, key)).toBe(0);
});

test("undoing an edit on a frame between gives the shape back to its tween as it is then, though a frame's been deleted since", async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeOut');
  project.showFrame(5);
  project.updateShapes([[key, withShape(project.shapes.get(key), { fill: '#ff0000' })]]); // the color it has: still the tween's
  project.showFrame(4);
  project.deleteFrame(); // the old frame 5 is frame 4, and the tween 0 to 5
  project.updateShapes([[key, withShape(project.shapes.get(key), { fill: '#ffffff' })]]); // now a key
  project.undo();
  project.showFrame(0);
  expect(project.frames[4].changes.has(key)).toBe(false);
  project.showFrame(4);
  expect(y(project, key)).toBe(Math.round(24 * ease('easeOut', 4 / 5) * 1e4) / 1e4);
});

test('undoing an edit on a frame puts back the shape it had then, though a frame folded into it since', async () => {
  const { project } = await animated();
  const key = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  project.addFrame('blank');
  project.addFrame('blank');
  project.updateShapes([[key, withShape(project.shapes.get(key), { fill: '#ff0000' })]]); // the color it has: inherited still
  project.showFrame(1);
  project.updateShapes([[key, transformed(project.shapes.get(key), rotation(0.4, 8, 8))]]);
  const turned = project.shapes.get(key);
  project.deleteFrame(); // frame 2, now 1, takes in the turn
  moveBy(project, key, -4, 2);
  project.undo();
  project.showFrame(0);
  project.showFrame(1);
  expect(project.shapes.get(key)).toEqual(turned);
});

// Random frame changes, edits, tweens, keys and Clears: after each, every frame's cached look is what a fresh look works
// out; then undo all the way, and redo, go back through the same movies. By default a few seeds and those that once
// failed (11: an undo putting back a shape from before a frame folded in; 27, 30: a tween's frames redrawn from a
// stale cache); VITE_FUZZ_SEEDS=30 runs seeds 1 to 30.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Every frame's shapes; a still (one frame) has no frames worked out, only what shows.
function movie(project) {
  project.noteFrame();
  const shapes = (states) => [...states].filter(([key]) => isShapeKey(key)).map(([key, state]) => [key, (state.cell ?? state).m, (state.cell ?? state).fill, (state.cell ?? state).width]);
  if (!project.hasFrames) return JSON.stringify([shapes(project.shapes)]);
  return JSON.stringify(project.frames.map((frame, i) => [frame.kind, shapes(project.resolvedOf(i))]));
}
async function tweenFuzz(seed, steps = 40) {
  const { project } = await animated();
  const r = rng(seed), int = (n) => Math.floor(r() * n), pick = (list) => list[int(list.length)];
  const keys = [project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' })), project.addShape(rectShape(10, 10, 14, 13, { fill: '#0000ff' }))];
  for (let i = 0; i < 8; i++) project.addFrame('blank');
  // One or two of a shape's keys around the frame showing, [key, refs], or [key, []] where it doesn't show.
  const keysOf = () => {
    const key = pick(keys), rows = [...(partKeys(project.frames, key, project.frame)?.rows ?? [])];
    if (!rows.length) return [key, []];
    const ref = () => {
      const [part, row] = pick(rows);
      return { part, at: pick(row).at };
    };
    return [key, r() < 0.3 ? [ref(), ref()] : [ref()]];
  };
  // Every part's keys on a shape's last key frame at or before the frame showing (its frame number clicked in the
  // panel), [key, refs].
  const frameKeys = () => {
    const key = pick(keys), ats = [...(partKeys(project.frames, key, project.frame)?.rows.values() ?? [])].flat().map(({ at }) => at);
    const at = Math.max(-1, ...ats.filter((at) => at <= project.frame));
    return [key, at < 0 ? [] : PARTS.map((part) => ({ part, at }))];
  };
  let depth = 0;
  const h = project.history, push = h.push.bind(h);
  h.push = (e) => { push(e); depth++; };
  const actions = {
    show: () => project.showFrame(int(project.frames.length)),
    move: () => {
      const key = pick(keys), shape = project.shapes.get(key);
      if (shape) project.updateShapes([[key, transformed(shape, r() < 0.7 ? translation(int(9) - 4, int(9) - 4) : rotation(0.4, 8, 8))]]);
    },
    recolor: () => {
      const key = pick(keys), shape = project.shapes.get(key);
      if (shape) project.updateShapes([[key, withShape(shape, { fill: pick(['#ff0000', '#00ff00', '#ffffff']) })]]);
    },
    widen: () => {
      const key = pick(keys), shape = project.shapes.get(key);
      if (shape) project.updateShapes([[key, withShape(shape, { width: pick([1, 2, 4]) })]]);
    },
    regradient: () => {
      const key = pick(keys), shape = project.shapes.get(key);
      const gradient = { type: 'linear', stops: [[0, pick(['#ff0000', '#00ff00'])], [1, '#0000ff']], m: [1, 0, 0, 1, 0, 0] };
      if (shape) project.updateShapes([[key, withShape(shape, { fill: r() < 0.6 ? gradient : '#ffffff' })]]);
    },
    tween: () => project.setKeyEasing(...frameKeys(), pick([null, 'linear', 'easeIn', 'easeOut', 'easeInOut', 'elastic'])),
    snap: () => project.setKeyMotion(...frameKeys(), pick(MOTIONS)),
    add: () => project.addFrame(pick(['blank', 'blank', 'duplicate', 'wipe'])),
    delete: () => project.deleteFrame(),
    reorder: () => project.moveFrame(int(project.frames.length), int(project.frames.length)),
    clear: () => project.clearEditLayer(),
    ease: () => project.setKeyEasing(...keysOf(), pick([null, 'linear', 'easeIn', 'easeOut', 'easeInOut', 'elastic'])),
    unkey: () => project.deleteKeys(...keysOf()),
    rekey: () => project.addKey(pick(keys), pick(['transform', 'transform', 'fill', 'outline', 'width'])),
    slide: () => project.moveKeys(...keysOf(), int(5) - 2),
    drag: () => {
      const [key, refs] = keysOf(), drag = {};
      project.moveKeys(key, refs, int(5) - 2, drag);
      project.moveKeys(key, refs, int(5) - 2, drag);
      project.endKeyDrag(drag);
    },
  };
  const keyed = new Set(['tween', 'snap', 'ease', 'unkey', 'rekey', 'slide', 'drag']); // what leaves no easing without a tween to use it
  // Weighted toward what makes tweens: shapes moved on frames apart, and easings chosen between them.
  const names = ['show', 'show', 'show', 'move', 'move', 'move', 'tween', 'tween', 'tween', 'snap', 'recolor', 'widen', 'regradient', 'add', 'add', 'delete', 'reorder', 'clear'], log = [];
  for (const name of ['ease', 'unkey', 'rekey', 'slide', 'drag']) names.push(name, name, name); // as tween is
  project.clearHistory();
  depth = 0;
  const stack = [movie(project)];
  for (let i = 0; i < steps; i++) {
    const name = pick(names), was = depth;
    actions[name]();
    const now = movie(project);
    log.push(`${name}@${project.frame}/${project.frames.length}${depth > was ? '+' : ''}`);
    for (const frame of project.frames) frame.resolved = null;
    if (movie(project) !== now) return { seed, log, problem: `step ${i} ${name}: a frame's cached look is stale` };
    if (keyed.has(name) && depth > was && keys.some((key) => strayEasings(project.frames, key).length)) return { seed, log, problem: `step ${i} ${name}: an easing with no tween` };
    if (depth === was + 1) stack.push(now);
    else if (depth === was) stack[stack.length - 1] = now;
    else return { seed, log, problem: `step ${i} ${name}: ${depth - was} steps` };
  }
  for (let i = stack.length - 2; i >= 0; i--) {
    project.undo();
    if (movie(project) !== stack[i]) return { seed, log, problem: `undo to ${i}`, want: stack[i], got: movie(project) };
  }
  for (let i = 1; i < stack.length; i++) {
    project.redo();
    if (movie(project) !== stack[i]) return { seed, log, problem: `redo to ${i}` };
  }
  return null;
}

test('fuzz: frames, edits, tweens and Clears stay drawn right, and undo and redo go back through them', async () => {
  const count = Number(import.meta.env?.VITE_FUZZ_SEEDS ?? 0), failures = [];
  for (const seed of count ? Array.from({ length: count }, (_, i) => i + 1) : [1, 2, 3, 11, 27, 30, 71, 78, 95, 167]) {
    const failure = await tweenFuzz(seed);
    if (failure) failures.push(failure);
  }
  expect(failures).toEqual([]);
}, 300_000);

test('a tween can move by whole cells: the frames between redraw, visiting one keeps it no key frame, and undo puts it back', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  expect(project.resolvedOf(3).get(key).cell.m[5]).toBe(3);
  project.setKeyMotion(key, [T(0)], 'cells');
  expect(project.resolvedOf(3).get(key).cell.m[5]).toBe(4);
  project.showFrame(3);
  expect(y(project, key)).toBe(4);
  project.showFrame(0);
  expect(project.frames[3].changes.has(key)).toBe(false);
  project.setKeyMotion(key, [T(0)], 'half');
  expect(project.resolvedOf(3).get(key).cell.m[5]).toBe(3);
  project.undo();
  expect(project.resolvedOf(3).get(key).cell.m[5]).toBe(4);
  project.undo();
  expect(project.resolvedOf(3).get(key).cell.m[5]).toBe(3);
  expect(transformKeys(project, key)[0].motion).toBe('smooth');
});

test('only the tween leaving the key moves by cells: the next one stays smooth', async () => {
  const { project } = await animated();
  const key = bounce(project, 'linear'); // down 24 over frames 0 to 6
  project.showFrame(6);
  for (let i = 0; i < 4; i++) project.addFrame('blank');
  moveBy(project, key, 0, -5); // back up 5 by frame 10
  easeAt(project, key, 6, 'linear');
  project.setKeyMotion(key, [T(0)], 'cells');
  expect(project.resolvedOf(8).get(key).cell.m[5]).toBe(21.5); // smooth
  project.setKeyMotion(key, [T(6)], 'cells');
  expect(project.resolvedOf(8).get(key).cell.m[5]).toBe(22);
});

test('a project keeps how each tween moves', async () => {
  const { project } = await animated();
  const key = bounce(project, 'easeIn');
  project.setKeyMotion(key, [T(0)], 'cells');
  const { readProject } = await import('@/document/projectIO.js');
  const parts = await readProject(new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'm.phosphor'));
  expect(parts.animation.frames[0].motions.get(key)).toBe('cells');
});

test('splitting a tween keeps how it moves on both halves', async () => {
  const { project } = await animated();
  const key = bounce(project, 'linear');
  project.setKeyMotion(key, [T(0)], 'cells');
  project.showFrame(3);
  moveBy(project, key, 4, 0);
  project.showFrame(0);
  expect(transformKeys(project, key)).toMatchObject([{ at: 0, easing: 'linear', motion: 'cells' }, { at: 3, easing: 'linear', motion: 'cells' }, { at: 6 }]);
});
