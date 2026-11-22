// A plugin's shapes in the Shape tool (tools/vshape.js): the row, their options, a drag mapped onto the box, a shape
// that fails, and rooms.
import { test, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import { getTool } from '@/tools';
import { createTestApp, loadImage } from '../support/app.js';
import { onPlugin } from '../support/pluginSolvers.js';
import { i18n, t } from '@/i18n/index.js';
import EditToolbar from '@/components/EditToolbar.vue';
import * as shapeTool from '@/tools/vshape.js';
import { usePluginStore } from '@/store/PluginStore';
import { useRoomStore } from '@/store/RoomStore';
import { toastMessage } from '@/composables/useToast';
import { HANG_KEY } from '@/plugins/hangMark';
import { ownHangMark } from '../support/ownHangMark.js';

const vshape = shapeTool.default;
let mounted = null, host = null;
beforeAll(() => page.viewport(1200, 800));
afterAll(() => page.viewport(414, 896));
afterEach(() => { mounted?.unmount(); host?.remove(); mounted = host = null; localStorage.clear(); vi.restoreAllMocks(); useRoomStore().role = null; });

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1L15 15H1z"/></svg>';
const TRIANGLE = [{ closed: true, points: [[0, 0], [1, 0], [0.5, 1]] }];
const shape = (over = {}) => ({
  id: 'triangle', name: 'Triangle', icon: ICON,
  options: [
    { id: 'points', kind: 'slider', name: 'Points', min: 3, max: 12, step: 1, default: 5 },
    { id: 'tint', kind: 'color', name: 'Tint', default: '#ff0000' },
  ],
  outline: () => TRIANGLE, ...over,
});

// The app with a plugin shape on, the Shape tool chosen in VECTOR with that shape, and a drag (begin, a move to each
// point, end).
async function shaper(over = {}, { hash = 'h' } = {}) {
  const app = await createTestApp();
  await loadImage(app.project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  app.workspace.editorTab = 'vector';
  app.workspace.setActiveTool('vshape');
  const [ref] = (await onPlugin({ shapes: [shape(over)] }, { hash })).shapes;
  app.workspace.vectorShapeKind = ref;
  const ctx = { project: app.project, workspace: app.workspace, view: 'vector', unit: { x: 8, y: 8 } };
  const drag = (from, ...to) => {
    vshape.begin(ctx, from, {});
    let at = from;
    for (const p of to) {
      vshape.move(ctx, at, p);
      at = p;
    }
    vshape.end(ctx);
  };
  return { ...app, ref, ctx, drag };
}
const only = (project) => [...project.shapes.values()];
const corners = (points) => points.map((p) => [p[0], p[1]]);
const mount = async () => {
  host = document.createElement('div');
  document.body.append(host);
  mounted = createApp({ render: () => h(EditToolbar) }).use(getActivePinia()).use(i18n);
  mounted.mount(host);
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));
};
const kindRow = () => host.querySelector(`div.segmented[aria-label="${t('tools.shapes.shape')}"]`);

test('a drag maps the outline onto its box: a path in the next shape\'s style, one undo step', async () => {
  const { project, workspace, drag } = await shaper();
  const version = project.history.version;
  drag({ x: 10, y: 10 }, { x: 20, y: 15 }, { x: 30, y: 20 });
  expect(project.history.version).toBe(version + 1);
  const [drawn] = only(project);
  expect(corners(drawn.points)).toEqual([[10, 10], [30, 10], [20, 20]]);
  expect(drawn.closed).toBe(true);
  expect(workspace.vectorSelected).toHaveLength(1);
  // A rectangle drawn the same way has the same style.
  workspace.vectorShapeKind = 'rect';
  drag({ x: 2, y: 2 }, { x: 5, y: 5 });
  const rect = only(project).find((s) => s !== drawn);
  expect([drawn.fill, drawn.stroke, drawn.width]).toEqual([rect.fill, rect.stroke, rect.width]);
});

test('handles are scaled by the box, not moved', async () => {
  const { project, drag } = await shaper({ outline: () => [{ closed: false, points: [[0, 0, 0.1, 0.2, 0.3, 0.4], [1, 1]] }] });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  const [drawn] = only(project);
  expect(drawn.points[0].slice(0, 6)).toEqual([10, 10, 2, 2, 6, 4]);
  expect(drawn.closed).toBe(false);
});

test('Shift squares the box', async () => {
  const { project, workspace, drag } = await shaper();
  workspace.isShiftPressed = true;
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  workspace.isShiftPressed = false;
  expect(corners(only(project)[0].points)).toEqual([[10, 10], [30, 10], [20, 30]]);
});

test('a shape of two outlines makes the second its more', async () => {
  const { project, drag } = await shaper({ outline: () => [...TRIANGLE, { closed: false, points: [[0, 1], [1, 1]] }] });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  const [drawn] = only(project);
  expect(drawn.more).toHaveLength(1);
  expect(drawn.more[0][0]).toBe(false);
  expect(corners(drawn.more[0][1])).toEqual([[10, 20], [30, 20]]);
});

test('outline gets the values set through the toolbar, a color as { r, g, b }, once a drag', async () => {
  const calls = [];
  const { ref, drag } = await shaper({ outline: (options) => { calls.push(options); return TRIANGLE; } });
  await mount();
  const slider = document.getElementById(`${ref}/points`), color = host.querySelector('input[type=color]');
  expect(color.getAttribute('aria-label')).toBe('Tint');
  color.value = '#00ff00';
  color.dispatchEvent(new Event('input'));
  slider.value = '7';
  slider.dispatchEvent(new Event('input'));
  drag({ x: 10, y: 10 }, { x: 15, y: 15 }, { x: 20, y: 20 }, { x: 30, y: 20 });
  expect(calls).toEqual([{ points: 7, tint: { r: 0, g: 255, b: 0 } }]);
});

test('an outline that throws or is refused draws nothing, no undo step, one toast a drag, and the row says so', async () => {
  const cases = [
    [() => { throw new Error('boom'); }, 'boom'],
    [() => [{ closed: true, points: [[NaN, 0], [1, 1]] }], t('plugins.errors.scriptShape', { field: 'outline' })],
  ];
  for (const [outline, message] of cases) {
    let calls = 0;
    const { project, ctx } = await shaper({ outline: () => { calls++; return outline(); } });
    const version = project.history.version, last = project.history.last;
    toastMessage.value = null;
    vshape.begin(ctx, { x: 10, y: 10 }, {});
    vshape.move(ctx, { x: 10, y: 10 }, { x: 20, y: 15 });
    const words = toastMessage.value;
    expect(words).toBe(t('plugins.shapeFailed', { name: 'Triangle', message }));
    toastMessage.value = null;
    vshape.move(ctx, { x: 20, y: 15 }, { x: 30, y: 20 });
    vshape.end(ctx);
    expect(toastMessage.value).toBe(null);
    expect(calls).toBe(1);
    expect(project.shapes.size).toBe(0);
    expect([project.history.version, project.history.last]).toEqual([version, last]);
    expect(usePluginStore().problems['phosphor.outlines']).toBe(words);
  }
});

test('a shape\'s first outline of a visit runs under the hang mark, and later ones don\'t', async () => {
  ownHangMark('plugin-shape');
  const marks = [];
  const { drag } = await shaper({ outline: () => { marks.push(localStorage.getItem(HANG_KEY)); return TRIANGLE; } }, { hash: 'hang' });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  drag({ x: 2, y: 30 }, { x: 8, y: 36 }); // away from the first one's handles
  expect(JSON.parse(marks[0]).pluginId).toBe('phosphor.outlines');
  expect(marks.slice(1)).toEqual([null]);
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});

test('the row shows the shape\'s icon after Polygon, and its options only while it\'s chosen', async () => {
  const { workspace, ref } = await shaper();
  workspace.vectorShapeKind = 'rect';
  await mount();
  const buttons = () => [...kindRow().querySelectorAll('button')];
  expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([t('tools.shapes.rectangle'), t('tools.shapes.ellipse'), t('tools.vshape.polygon'), 'Triangle (Midnight)']);
  expect(buttons()[3].querySelector('svg')).toBeTruthy();
  expect(host.querySelector('input[type=color]')).toBe(null);
  buttons()[3].click();
  await nextTick();
  expect(workspace.vectorShapeKind).toBe(ref);
  expect(buttons()[3].classList.contains('on')).toBe(true);
  expect(host.querySelector('input[type=color]')).toBeTruthy();
});

test('dropScript while it\'s chosen: the kind reads Rectangle, a drag draws one, and the row lights Rectangle', async () => {
  const { project, workspace, drag } = await shaper();
  await mount();
  usePluginStore().dropScript('phosphor.outlines');
  await nextTick();
  expect(shapeTool.shapeKind(workspace)).toBe('rect');
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  expect(corners(only(project)[0].points)).toEqual([[10, 10], [30, 10], [30, 20], [10, 20]]);
  const lit = [...kindRow().querySelectorAll('button.on')].map((b) => b.getAttribute('aria-label'));
  expect(lit).toEqual([t('tools.shapes.rectangle')]);
  expect(kindRow().querySelectorAll('button')).toHaveLength(3);
});

test('in a room it isn\'t in the row, and a drag draws a rectangle', async () => {
  const { project, workspace, ref, drag } = await shaper();
  useRoomStore().role = 'host';
  expect(vshape.options[0].choices.map((c) => c.value)).toEqual(['rect', 'ellipse', 'polygon']);
  expect(shapeTool.shapeKind(workspace)).toBe('rect');
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  expect(only(project)[0].points).toHaveLength(4);
  useRoomStore().role = null;
  expect(shapeTool.shapeKind(workspace)).toBe(ref);
});

test('a brush and a shape of one id in one plugin keep their values apart, in the browser too', async () => {
  const { workspace, ref } = await shaper();
  const option = { id: 'points', kind: 'slider', name: 'Points', min: 1, max: 12, step: 1, default: 5 };
  const brush = { id: 'triangle', name: 'Triangle', icon: ICON, options: [option], move() {} };
  usePluginStore().useScript('phosphor.outlines', 'h', { brushes: [brush], shapes: [shape({ options: [option] })] });
  const brushOption = getTool(ref).options[0], shapeOption = vshape.options.find((o) => o.label === 'Points');
  brushOption.set(workspace, 2);
  shapeOption.set(workspace, 9);
  expect([brushOption.get(workspace), shapeOption.get(workspace)]).toEqual([2, 9]);
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const pinia = getActivePinia();
  setActivePinia(createPinia());
  const fresh = useWorkspaceStore();
  expect([brushOption.get(fresh), shapeOption.get(fresh)]).toEqual([2, 9]);
  setActivePinia(pinia);
});

// An outline of as many corners as its Points, round its box (so a change shows in the count).
const ROUND = ({ points }) => [{ closed: true, points: Array.from({ length: points }, (_, i) => [0.5 + 0.5 * Math.cos((2 * Math.PI * i) / points), 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / points)]) }];
const optionOf = (label) => vshape.options.find((option) => option.label === label);
const set = (workspace, label, value) => optionOf(label).set(workspace, value);

test('a drawn shape keeps what made it; selected, its options show its values and a change draws it again in its box', async () => {
  const { project, workspace, ref, drag } = await shaper({ outline: ROUND });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  const [key] = workspace.vectorSelected, drawn = project.shapes.get(key);
  expect(drawn.made).toEqual({ kind: ref, box: [10, 10, 30, 20], values: { points: 5, tint: '#ff0000' } });
  expect(drawn.points).toHaveLength(5);
  // Moved and recolored, it's still the shape it made; a change keeps where it was moved to and its colors.
  const { withShape } = await import('@/document/shapes.js');
  project.updateShapes([[key, withShape(drawn, { m: [1, 0, 0, 1, 4, 2], fill: '#0000ff' })]]);
  const moved = project.shapes.get(key);
  const version = project.history.version;
  set(workspace, 'Points', 8);
  optionOf('Points').commit();
  const again = project.shapes.get(key);
  expect(project.history.version).toBe(version + 1);
  expect(again.points).toHaveLength(8);
  expect(again.made).toEqual({ ...moved.made, values: { points: 8, tint: '#ff0000' } });
  expect([again.m, again.fill, again.z]).toEqual([moved.m, moved.fill, moved.z]);
  expect(Math.max(...again.points.map((p) => p[0]))).toBe(30); // in its box
  expect(optionOf('Points').get(workspace)).toBe(8);
  expect(workspace.pluginTools[`shape:${ref}`].points).toBe(8); // and the next shape's
  project.undo();
  expect(project.shapes.get(key).points).toHaveLength(5);
  // With nothing selected the options are the tool's, and a change touches no shape.
  workspace.vectorSelected = [];
  set(workspace, 'Points', 3);
  expect(project.shapes.get(key).points).toHaveLength(5);
  expect(optionOf('Points').get(workspace)).toBe(3);
});

test('a slider\'s drag in the toolbar is one undo step, and a color picked is another', async () => {
  const { project, workspace, ref, drag } = await shaper({ outline: ROUND });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  const [key] = workspace.vectorSelected;
  await mount();
  const slider = document.getElementById(`${ref}/points`), color = host.querySelector('input[type=color]');
  expect(slider.value).toBe('5');
  const version = project.history.version;
  for (const value of ['6', '7', '9']) {
    slider.value = value;
    slider.dispatchEvent(new Event('input'));
  }
  slider.dispatchEvent(new Event('change'));
  expect(project.shapes.get(key).points).toHaveLength(9);
  expect(project.history.version).toBe(version + 1);
  for (const value of ['#00ff00', '#0000ff']) {
    color.value = value;
    color.dispatchEvent(new Event('input'));
  }
  color.dispatchEvent(new Event('change'));
  expect(project.shapes.get(key).made.values.tint).toBe('#0000ff');
  expect(project.history.version).toBe(version + 2);
  expect(project._stroke).toBe(null);
});

test('points edited by hand make it a path: its options are the tool\'s again and a change leaves it', async () => {
  const { project, workspace, ref, drag } = await shaper({ outline: ROUND });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  const [key] = workspace.vectorSelected;
  const { movePoint } = await import('@/document/shapes.js');
  project.updateShapes([[key, movePoint(project.shapes.get(key), 0, 2, 0)]]);
  const edited = project.shapes.get(key);
  expect(edited.made).toBe(undefined);
  set(workspace, 'Points', 9);
  expect(project.shapes.get(key)).toBe(edited);
  // Nor is it offered while another kind is chosen.
  workspace.vectorShapeKind = 'rect';
  expect(optionOf('Points').when(workspace)).toBe(false);
  workspace.vectorShapeKind = ref;
});

test('only the chosen kind\'s options show, whatever is selected; chosen, they change every selected shape of the kind', async () => {
  const { project, workspace, ref, drag } = await shaper({ outline: ROUND });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  drag({ x: 2, y: 30 }, { x: 8, y: 36 });
  const keys = [...project.shapes.keys()];
  workspace.vectorSelected = keys;
  const showing = () => vshape.options.filter((option) => option.when?.(workspace)).map((option) => option.label);
  // Another kind chosen with the plugin's shapes selected: that kind's options alone, and they leave the selection be.
  workspace.vectorShapeKind = 'polygon';
  expect(showing()).toEqual([t('tools.vshape.sides')]);
  set(workspace, 'Sides', 9);
  expect(keys.map((k) => project.shapes.get(k).points.length)).toEqual([5, 5]);
  workspace.vectorShapeKind = 'rect';
  expect(showing()).toEqual([]);
  // Their own kind chosen again: its options, showing the first one's values, and a change is both shapes'.
  workspace.vectorShapeKind = ref;
  expect(showing()).toEqual(['Points', 'Tint']);
  set(workspace, 'Points', 4);
  expect(keys.map((k) => project.shapes.get(k).points.length)).toEqual([4, 4]);
  expect(project.shapes.get(keys[1]).made.box).toEqual([2, 30, 8, 36]);
  // Its plugin turned off, it's a path until it's back: no option of it shows.
  usePluginStore().plugins.find(({ id }) => id === 'phosphor.outlines').enabled = false;
  expect(vshape.options.some((option) => option.label === 'Points')).toBe(false);
  expect(project.shapes.get(keys[0]).made.kind).toBe(ref);
});

test('an outline that fails while a slider drags is said once and leaves the shapes as they were', async () => {
  let fail = false;
  const { project, workspace, drag } = await shaper({ outline: (options) => { if (fail) throw new Error('boom'); return ROUND(options); } });
  drag({ x: 10, y: 10 }, { x: 30, y: 20 });
  const [key] = workspace.vectorSelected, drawn = project.shapes.get(key);
  fail = true;
  const toasts = [];
  for (const value of [6, 7, 8]) {
    toastMessage.value = null;
    set(workspace, 'Points', value);
    toasts.push(toastMessage.value);
  }
  optionOf('Points').commit();
  expect(toasts.filter(Boolean)).toHaveLength(1);
  expect(project.shapes.get(key)).toBe(drawn);
  expect(project._stroke).toBe(null);
});

test('Polygon: Sides changes the selected polygons, and on a shape with keys only the frame\'s key', async () => {
  const { project, workspace, drag } = await shaper();
  workspace.vectorShapeKind = 'polygon';
  workspace.vectorSides = 5;
  drag({ x: 10, y: 10 }, { x: 30, y: 30 });
  const [key] = workspace.vectorSelected;
  expect(project.shapes.get(key).made).toEqual({ kind: 'polygon', box: [10, 10, 30, 30], values: { sides: 5 } });
  for (let i = 0; i < 4; i++) project.addFrame('blank');
  project.showFrame(4);
  workspace.vectorSelected = [key];
  set(workspace, 'Sides', 7);
  optionOf('Sides').commit();
  expect(project.shapes.get(key).points).toHaveLength(7);
  expect(workspace.vectorSides).toBe(7);
  const sides = (at) => project.resolvedOf(at).get(key).cell;
  expect([sides(0).points.length, sides(2).points.length, sides(4).points.length]).toEqual([5, 5, 7]);
  // Each key frame's shape is still the one it made, so Sides shows its own there.
  expect([sides(0).made.values.sides, sides(4).made.values.sides]).toEqual([5, 7]);
  project.showFrame(0);
  workspace.vectorSelected = [key];
  expect(optionOf('Sides').get(workspace)).toBe(5);
});

test('the row follows the selection: a shape that remembers what made it chooses its kind when it\'s selected, and a click in the row still wins', async () => {
  const { project, workspace, ref, drag } = await shaper({ outline: ROUND });
  drag({ x: 10, y: 10 }, { x: 16, y: 16 });
  const [star] = workspace.vectorSelected;
  workspace.vectorShapeKind = 'polygon';
  drag({ x: 20, y: 10 }, { x: 26, y: 16 });
  const [polygon] = workspace.vectorSelected;
  workspace.vectorShapeKind = 'rect';
  drag({ x: 30, y: 10 }, { x: 36, y: 16 });
  const [rect] = workspace.vectorSelected;
  await mount();
  const select = async (...keys) => { workspace.vectorSelected = keys; await nextTick(); };
  // Picked with Vector select, then the Shape tool: the star's kind is the one chosen, its options showing its values.
  workspace.setActiveTool('vselect');
  await select(star);
  expect(workspace.vectorShapeKind).toBe(ref);
  workspace.setActiveTool('vshape');
  await nextTick();
  expect(kindRow().querySelectorAll('button')[3].classList.contains('on')).toBe(true);
  expect(document.getElementById(`${ref}/points`)).toBeTruthy();
  await select(polygon);
  expect(workspace.vectorShapeKind).toBe('polygon');
  // A rectangle remembers nothing, so the kind stays; with several, the first one's.
  await select(rect);
  expect(workspace.vectorShapeKind).toBe('polygon');
  await select(star, polygon);
  expect(workspace.vectorShapeKind).toBe(ref);
  // A click in the row with the star still selected chooses that kind, and the same selection said again leaves it.
  kindRow().querySelectorAll('button')[2].click();
  await nextTick();
  expect(workspace.vectorShapeKind).toBe('polygon');
  await select(star, polygon);
  expect(workspace.vectorShapeKind).toBe('polygon');
  // A kind that isn't on offer (its plugin off) isn't followed.
  usePluginStore().plugins.find(({ id }) => id === 'phosphor.outlines').enabled = false;
  await select(star);
  expect(workspace.vectorShapeKind).toBe('polygon');
  expect(project.shapes.get(star).made.kind).toBe(ref);
});
