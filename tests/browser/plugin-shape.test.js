// A plugin's shapes in the Shape tool (tools/vshape.js): the row, their options, a drag mapped onto the box, a shape
// that fails, and rooms.
import { test, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
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
  const { workspace, drag } = await shaper({ outline: (options) => { calls.push(options); return TRIANGLE; } });
  await mount();
  const slider = vshape.options.find((o) => o.label === 'Points'), color = host.querySelector('input[type=color]');
  expect(color.getAttribute('aria-label')).toBe('Tint');
  color.value = '#00ff00';
  color.dispatchEvent(new Event('input'));
  slider.set(workspace, 7);
  drag({ x: 10, y: 10 }, { x: 15, y: 15 }, { x: 20, y: 20 }, { x: 30, y: 20 });
  expect(calls).toEqual([{ points: 7, tint: { r: 0, g: 255, b: 0 } }]);
});

test('an outline that throws or is refused draws nothing, no undo step, one toast a drag, and the row says so', async () => {
  for (const outline of [() => { throw new Error('boom'); }, () => [{ closed: true, points: [[NaN, 0], [1, 1]] }]]) {
    let calls = 0;
    const { project, ctx } = await shaper({ outline: () => { calls++; return outline(); } });
    const version = project.history.version, last = project.history.last;
    toastMessage.value = null;
    vshape.begin(ctx, { x: 10, y: 10 }, {});
    vshape.move(ctx, { x: 10, y: 10 }, { x: 20, y: 15 });
    const words = toastMessage.value;
    expect(words).toMatch(/^Triangle couldn't draw: /);
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
