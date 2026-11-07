// Followers and guides: a shape or art layer that follows a path is drawn on it, wherever shapes are drawn (the
// still, a movie's built frames, Merge down and Bake), and VECTOR finds it there; a guide draws nothing but its
// outline on VECTOR.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { makeShape, rectShape, transformed, translation, withShape } from '@/document/shapes.js';
import { PARTS } from '@/document/parts.js';
import { centerOf, placedShapes } from '@/document/followers.js';
import { makeArt } from '@/document/artLayers.js';
import { listedParts } from '@/document/keys.js';
import { clipboardHtml, readClipboardHtml } from '@/lib/clipboardBlocks.js';
import { copyShapes, cutShapes, pasteShapes } from '@/composables/vectorClipboard.js';
import { loadBooleans } from '@/lib/shapeBooleans.js';
import { toastMessage } from '@/composables/useToast';
import vselect, { selectionBox } from '@/tools/vselect.js';
import VectorOverlay from '@/components/VectorOverlay.vue';
import KeyValues from '@/components/KeyValues.vue';
import EditToolbar from '@/components/EditToolbar.vue';
import { shapeAt } from '@/lib/shapeHits.js';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

async function mount(component, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(component, props) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return host;
}

async function drawing() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  return { project, workspace };
}

// A path across the grid at y = 20, from x 4 to 24 (its middle at (14, 20)).
const path = (extra = {}) => makeShape({ points: [[4, 20, 0, 0, 0, 0, 0], [24, 20, 0, 0, 0, 0, 0]], closed: false, stroke: '#00ff00', width: 1, ...extra });
// A red 4 by 4 square, its middle at (cx, cy).
const square = (cx, cy, extra = {}) => withShape(rectShape(cx - 2, cy - 2, cx + 2, cy + 2, { fill: '#ff0000' }), extra);
const follower = (key, along = 0.5) => square(5, 5, { follow: { key }, along });
const cell = (project, col, row) => project.cells[row * project.cols + col];
const red = (project, col, row) => [cell(project, col, row).fg.hex, cell(project, col, row).bg.hex].includes('#ff0000');
const cellsOf = (built) => built.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);

// The same drawing with the square put where it should show, as a shape of its own.
async function expected(shapes) {
  const { project } = await drawing();
  for (const shape of shapes) project.addShape(shape);
  await settle(project);
  return cellsKey(project);
}

test('a follower is drawn at its path\'s point on a still', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  project.addShape(follower(p));
  await settle(project);
  const cells = cellsKey(project);
  expect(red(project, 14, 10)).toBe(true);
  expect(red(project, 5, 2)).toBe(false); // not where its own Transform has it
  expect(cells).toEqual(await expected([path(), square(14, 20)]));
});

test('moving the path redraws its follower\'s old and new cells', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  project.addShape(follower(p));
  await settle(project);
  project.updateShapes([[p, transformed(project.shapes.get(p), translation(0, -12))]]);
  expect(red(project, 14, 10)).toBe(false);
  expect(red(project, 14, 4)).toBe(true);
  const partial = cellsKey(project);
  project.renderer.reset();
  project.render();
  await settle(project);
  expect(cellsKey(project)).toEqual(partial);
});

test('in a movie with Along keyed 0 to 1, an exported middle frame has the follower at the path\'s middle', async () => {
  const movie = async (along, end) => {
    const { project } = await drawing();
    const p = project.addShape(path());
    const f = project.addShape(follower(p, along));
    for (let i = 0; i < 4; i++) project.addFrame('blank');
    if (end !== undefined) project.updateShapes([[f, withShape(project.shapes.get(f), { along: end })]]);
    project.showFrame(0);
    project.setKeyEasing(f, PARTS.map((part) => ({ part, at: 0 })), 'linear');
    return project;
  };
  const keyed = await movie(0, 1), held = await movie(0.5);
  const middle = cellsOf(await keyed.builtFrame(2));
  expect(middle).toEqual(cellsOf(await held.builtFrame(2)));
  expect(middle).not.toEqual(cellsOf(await keyed.builtFrame(0)));
});

test('a guide draws nothing in the cells, and VECTOR\'s overlay shows its outline', async () => {
  const { project, workspace } = await drawing();
  await settle(project);
  const bare = cellsKey(project);
  const g = project.addShape(path({ guide: true }));
  await settle(project);
  expect(cellsKey(project)).toEqual(bare);
  workspace.editorTab = 'vector';
  const host = await mount(VectorOverlay, { unit: { x: 10, y: 10 } });
  const guides = host.querySelectorAll('[data-vector-overlay] path.guide');
  expect(guides.length).toBe(1);
  expect(guides[0].getAttribute('d')).toMatch(/^M40 200L240 200/);
  workspace.vectorSelected = [g];
  await nextTick();
  expect(host.querySelectorAll('[data-vector-overlay] path.guide').length).toBe(1); // selected or not
});

test('Merge down of everything leaves the guide a shape, and presses the follower where it showed', async () => {
  const { project } = await drawing();
  const g = project.addShape(path({ guide: true }));
  project.addShape(follower(g));
  await settle(project);
  const cells = cellsKey(project);
  project.mergeShapes();
  await settle(project);
  expect([...project.shapes.keys()]).toEqual([g]);
  expect(cellsKey(project)).toEqual(cells);
  expect(red(project, 14, 10)).toBe(true);
});

test('Bake leaves a guide a shape too', async () => {
  const { project } = await drawing();
  const g = project.addShape(path({ guide: true }));
  project.addShape(follower(g));
  await settle(project);
  const cells = cellsKey(project);
  await project.bake();
  await settle(project);
  expect([...project.shapes.keys()]).toEqual([g]);
  expect(cellsKey(project)).toEqual(cells);
});

test('merging a path presses its followers with it, wherever they\'re stacked', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  project.addShape(follower(p));
  await settle(project);
  const cells = cellsKey(project);
  expect([...project.pressedKeys([p])].length).toBe(2);
  project.mergeShapes([p]);
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
});

test('where the path is erased on a later frame, the follower sits on its own Transform there', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(follower(p));
  project.addFrame('blank');
  project.deleteShapes([p]);
  await settle(project);
  expect(project.shapes.has(p)).toBe(false);
  expect(placedShapes(project).get(f)).toBe(project.shapes.get(f));
  expect(red(project, 5, 2)).toBe(true);
  expect(red(project, 14, 10)).toBe(false);
  project.showFrame(0);
  await settle(project);
  expect(red(project, 14, 10)).toBe(true);
});

test('Vector select finds a follower where it shows, and boxes it there', async () => {
  const { project, workspace } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(follower(p));
  workspace.setActiveTool('vselect');
  const ctx = { project, workspace, view: 'vector', unit: { x: 8, y: 8 } };
  vselect.begin(ctx, { x: 14, y: 19 }, {});
  vselect.end(ctx);
  expect(workspace.vectorSelected).toEqual([f]);
  const box = selectionBox(placedShapes(project), [f]);
  expect(box.center).toEqual({ x: 14, y: 20 });
  workspace.editorTab = 'vector';
  const host = await mount(VectorOverlay, { unit: { x: 10, y: 10 } });
  const corners = host.querySelector('[data-vector-overlay] polygon.box').getAttribute('points');
  expect(corners).toBe('120,180 160,180 160,220 120,220');
});

test('the Keys panel\'s X and Y read where a follower shows', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(follower(p));
  const host = await mount(KeyValues, { part: 'transform', shapeKey: f });
  const [x, y] = [...host.querySelectorAll('input')].map((input) => input.value);
  expect([x, y]).toEqual(['14', '20']);
});

test('Merge down with only a guide selected presses its follower, leaves the guide, and is one undo step', async () => {
  const { project } = await drawing();
  const g = project.addShape(path({ guide: true }));
  const f = project.addShape(follower(g));
  await settle(project);
  const cells = cellsKey(project);
  project.clearHistory();
  project.mergeShapes([g]);
  await settle(project);
  expect([...project.shapes.keys()]).toEqual([g]);
  expect(cellsKey(project)).toEqual(cells);
  project.undo();
  await settle(project);
  expect([...project.shapes.keys()].sort()).toEqual([g, f].sort());
  expect(project.canUndo).toBe(false);
});

test('a lone guide has nothing to merge: no change and no undo step', async () => {
  const { project } = await drawing();
  const g = project.addShape(path({ guide: true }));
  await settle(project);
  project.clearHistory();
  project.mergeShapes([g]);
  project.mergeShapes();
  project.mergeDown({ c0: 0, r0: 0, c1: 29, r1: 14 });
  await settle(project);
  expect([...project.shapes.keys()]).toEqual([g]);
  expect(project.canUndo).toBe(false);
});

test('Merge down is off for a document whose only shapes are guides', async () => {
  const { project, workspace } = await drawing();
  project.addShape(path({ guide: true }));
  const host = await mount(EditToolbar);
  const merge = () => [...host.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Merge down' || b.title.startsWith('Merge down:'));
  for (const tab of ['vector', 'output']) {
    workspace.editorTab = tab;
    await nextTick();
    expect([tab, merge().length > 0, merge().every((b) => b.disabled)]).toEqual([tab, true, true]);
  }
  project.addShape(square(5, 5));
  await nextTick();
  expect(merge().some((b) => !b.disabled)).toBe(true);
});

test('a guide is clicked on its outline, never on its fill', async () => {
  const { project } = await drawing();
  const g = project.addShape(square(14, 14, { guide: true }));
  const placed = placedShapes(project);
  expect(shapeAt(placed, 14, 14, 0.5)).toBe(null);
  expect(shapeAt(placed, 12, 14, 0.5)).toBe(g);
  expect(shapeAt(placed, 16.3, 14, 0.5)).toBe(g);
});

// Follow path, Stop following, Guide and the link's options, as store actions: each one undo step, on every frame.
const recordsOf = (project, key) => project.frames.map((frame) => frame.changes.get(key)?.cell ?? null);
const centerAt = (project, key) => centerOf(placedShapes(project).get(key));
const near = (point, x, y) => expect([Math.round(point.x * 100) / 100, Math.round(point.y * 100) / 100]).toEqual([x, y]);

test('Follow path on a still puts the follower on the path where it was nearest, as one undo step', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(square(10, 8));
  const before = project.shapes.get(f);
  project.clearHistory();
  expect(project.followPath(f, p)).toBe(true);
  expect(project.shapes.get(f).follow).toEqual({ key: p });
  expect(project.shapes.get(f).along).toBeCloseTo(0.3, 3);
  near(centerAt(project, f), 10, 20);
  await settle(project);
  expect(red(project, 10, 10)).toBe(true);
  project.undo();
  expect(project.shapes.get(f)).toEqual(before);
  expect(project.canUndo).toBe(false);
});

// The square keyed at three places on frames 0, 2 and 4 (its middle at x 10, 12 and 14), the path on all of them.
async function threeKeys() {
  const { project, workspace } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(square(10, 8));
  for (let i = 0; i < 4; i++) project.addFrame('blank');
  for (const at of [2, 4]) {
    project.showFrame(at);
    project.updateShapes([[f, transformed(project.shapes.get(f), translation(2, 0))]]);
  }
  project.showFrame(0);
  return { project, workspace, p, f };
}

test('in a three-key movie, Follow path links every key frame, each where it was nearest; undo and redo take all three', async () => {
  const { project, p, f } = await threeKeys();
  const before = recordsOf(project, f);
  project.clearHistory();
  expect(project.followPath(f, p)).toBe(true);
  const after = recordsOf(project, f);
  expect([0, 2, 4].map((at) => [after[at].follow, Math.round(after[at].along * 1000) / 1000])).toEqual([[{ key: p }, 0.3], [{ key: p }, 0.4], [{ key: p }, 0.5]]); // nearestOnOutline's to 1/10000 or so
  for (const [at, x] of [[0, 10], [2, 12], [4, 14]]) {
    project.showFrame(at);
    near(centerAt(project, f), x, 20);
  }
  project.undo();
  expect(recordsOf(project, f)).toEqual(before);
  expect(project.canUndo).toBe(false);
  project.redo();
  expect(recordsOf(project, f)).toEqual(after);
});

test('Stop following puts the follower back on its own Transform on every frame, and leaves no Along keys', async () => {
  const { project, p, f } = await threeKeys();
  const before = recordsOf(project, f);
  project.followPath(f, p);
  expect(listedParts(project.frames, f, 0)).toContain('along');
  project.clearHistory();
  expect(project.stopFollowing([f])).toBe(true);
  expect(recordsOf(project, f)).toEqual(before);
  expect(listedParts(project.frames, f, 0)).toEqual(['transform']);
  for (const [at, x] of [[0, 10], [2, 12], [4, 14]]) {
    project.showFrame(at);
    near(centerAt(project, f), x, 8);
  }
  project.undo();
  expect(project.shapes.get(f).follow).toEqual({ key: p });
  expect(project.canUndo).toBe(false);
});

test('Follow path is refused, with a toast and no undo step, for a follower\'s path, a path\'s follower, and an art layer', async () => {
  const { project } = await drawing();
  const p = project.addShape(path()), other = project.addShape(path({ m: [1, 0, 0, 1, 0, 4] }));
  const f = project.addShape(square(10, 8)), g = project.addShape(square(20, 8));
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 2], art: { cols: 2, rows: 1, cells: [[0, 'A', '#ff0000', null]] } }));
  project.followPath(f, p);
  project.clearHistory();
  const shapes = project.shapes;
  for (const [follower, to, words] of [[g, f, /follows a path itself/], [p, other, /Other shapes follow/], [g, art, /art layer/]]) {
    toastMessage.value = null;
    expect(project.followPath(follower, to)).toBe(false);
    expect(toastMessage.value).toMatch(words);
  }
  expect(project.shapes).toBe(shapes);
  expect(project.canUndo).toBe(false);
});

test('riding the line\'s End, the follower stays on the End as the End tweens', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(square(10, 8));
  for (let i = 0; i < 4; i++) project.addFrame('blank');
  project.updateShapes([[p, withShape(project.shapes.get(p), { end: 0.5 })]]);
  project.showFrame(0);
  project.setKeyEasing(p, [{ part: 'end', at: 0 }], 'linear');
  project.followPath(f, p);
  expect(project.setFollow([f], { ride: 'end' })).toBe(true);
  expect(recordsOf(project, f)[0].follow).toEqual({ key: p, ride: 'end' });
  for (const [at, x] of [[0, 24], [2, 19], [4, 14]]) {
    project.showFrame(at);
    near(centerAt(project, f), x, 20);
  }
});

test('Guide hides a shape from the cells on every frame, as one undo step', async () => {
  const { project } = await drawing();
  project.addFrame('blank');
  project.addFrame('blank');
  const bare = [cellsOf(await project.builtFrame(0)), cellsOf(await project.builtFrame(2))];
  project.showFrame(0);
  const p = project.addShape(path());
  project.showFrame(2);
  project.updateShapes([[p, transformed(project.shapes.get(p), translation(0, -6))]]);
  const shown = async () => [cellsOf(await project.builtFrame(0)), cellsOf(await project.builtFrame(2))];
  const drawn = await shown();
  expect(drawn).not.toEqual(bare);
  project.clearHistory();
  expect(project.setGuide([p], true)).toBe(true);
  expect(recordsOf(project, p).filter(Boolean).map((shape) => shape.guide)).toEqual([true, true]);
  expect(await shown()).toEqual(bare);
  project.undo();
  expect(await shown()).toEqual(drawn);
  expect(project.canUndo).toBe(false);
});

test('a follower copied with its path follows the pasted path; pasted alone, it follows the original', async () => {
  const { project, workspace } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(square(10, 8));
  project.followPath(f, p);
  workspace.vectorSelected = [p, f];
  expect(copyShapes(project, workspace)).toBe(true);
  expect(pasteShapes(project, workspace)).toBe(true);
  const [p2, f2] = workspace.vectorSelected;
  expect(project.shapes.get(f2).follow).toEqual({ key: p2 });
  workspace.vectorSelected = [f];
  copyShapes(project, workspace);
  pasteShapes(project, workspace);
  expect(project.shapes.get(workspace.vectorSelected[0]).follow).toEqual({ key: p });
});

test('a follower pasted from another tab with its path follows the pasted path', async () => {
  const { project, workspace } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(square(10, 8));
  project.followPath(f, p);
  const { shapes, keys } = readClipboardHtml(clipboardHtml({ phosphorShapes: { version: 1, id: 'x', shapes: [project.shapes.get(p), project.shapes.get(f)], keys: [p, f] } })).shapes;
  expect(pasteShapes(project, workspace, shapes, keys)).toBe(true);
  const [p2, f2] = workspace.vectorSelected;
  expect(project.shapes.get(f2).follow).toEqual({ key: p2 });
});

test('Separate on a follower of two outlines leaves the link with the piece that keeps its key', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  const two = makeShape({ ...square(10, 8), more: [[true, square(20, 8).points]] });
  const f = project.addShape(two);
  project.followPath(f, p);
  const [kept, other] = project.separateShape(f);
  expect(kept).toBe(f);
  expect(project.shapes.get(f).follow).toEqual({ key: p });
  expect(project.shapes.get(other)).not.toHaveProperty('follow');
  expect(project.shapes.get(other)).not.toHaveProperty('along');
});

test('Follow path keys Along only where Transform is keyed, eased as Transform is, so a frame keying only its Fill shows it where it was', async () => {
  const { project } = await drawing();
  const p = project.addShape(path());
  const f = project.addShape(square(10, 8));
  for (let i = 0; i < 4; i++) project.addFrame('blank');
  project.showFrame(2);
  project.updateShapes([[f, withShape(project.shapes.get(f), { fill: '#ffffff' })]]);
  project.showFrame(4);
  project.updateShapes([[f, transformed(project.shapes.get(f), translation(4, 0))]]);
  project.showFrame(0);
  project.setKeyEasing(f, [{ part: 'transform', at: 0 }], 'linear');
  project.showFrame(2);
  near(centerAt(project, f), 12, 8);
  expect(project.followPath(f, p)).toBe(true);
  expect([...project.frames[2].parts.get(f)]).toEqual(['fill']);
  expect(project.frames[0].tweens.get(f).get('along')).toBe('linear');
  for (const [at, x] of [[0, 10], [2, 12], [4, 14]]) {
    project.showFrame(at);
    near(centerAt(project, f), x, 20);
  }
});

test('a shape pasted with a link that couldn\'t be made now (its path follows another since the cut) comes in following nothing', async () => {
  const { project, workspace } = await drawing();
  const p = project.addShape(path()), q = project.addShape(path({ m: [1, 0, 0, 1, 0, 4] }));
  const f = project.addShape(square(10, 8));
  project.followPath(f, p);
  workspace.vectorSelected = [f];
  expect(cutShapes(project, workspace)).toBe(true);
  expect(project.followPath(p, q)).toBe(true);
  pasteShapes(project, workspace);
  const pasted = project.shapes.get(workspace.vectorSelected[0]);
  expect(pasted).not.toHaveProperty('follow');
  expect(pasted).not.toHaveProperty('along');
});

test('Add keeps the bottom shape\'s link to its path', async () => {
  await loadBooleans();
  const { project } = await drawing();
  const p = project.addShape(path());
  const bottom = project.addShape(square(10, 8)), top = project.addShape(square(12, 8));
  project.followPath(bottom, p);
  const link = project.shapes.get(bottom).follow;
  expect(project.combineShapes([top, bottom], 'add')).toBe(bottom);
  expect(project.shapes.get(bottom).follow).toEqual(link);
});
