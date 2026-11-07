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
import { placedShapes } from '@/store/project/shared.js';
import vselect, { selectionBox } from '@/tools/vselect.js';
import VectorOverlay from '@/components/VectorOverlay.vue';
import KeyValues from '@/components/KeyValues.vue';

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
