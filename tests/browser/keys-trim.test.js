// Start and End in the Keys panel: + Add key lists them for a shape with an outline (not an art layer), and the row's
// value is a percent, typed in as a share.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage } from '../support/app.js';
import { makeShape } from '@/document/shapes.js';
import { makeArt } from '@/document/artLayers.js';
import KeysPanel from '@/components/KeysPanel.vue';
import VectorOverlay from '@/components/VectorOverlay.vue';
import KeyValues from '@/components/KeyValues.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import { userEvent } from 'vitest/browser';

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

const LINE = { fill: null, stroke: '#ff0000', width: 2, closed: false, points: [[2, 10, 0, 0, 0, 0, 0], [22, 10, 0, 0, 0, 0, 0]] };

// A line selected on VECTOR with Animate on, on the second of two frames (a Blank one).
async function animatedLine(shape = makeShape(LINE)) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 20 });
  project.setAnimate(true);
  const key = project.addShape(shape);
  project.addFrame('blank');
  Object.assign(workspace, { editorTab: 'vector', activeTool: 'vselect', vectorSelected: [key] });
  return { project, workspace, key };
}

const menu = async (host) => {
  host.querySelector('.add-key button').click();
  await nextTick();
  return [...document.querySelectorAll('.dropdown-content button')].map((b) => b.textContent.trim());
};

test('+ Add key lists Start and End after Style for a line, and choosing End keys it on the frame showing', async () => {
  const { project, key } = await animatedLine();
  const host = await mount(KeysPanel);
  const items = await menu(host);
  expect(items).toEqual(['Transform', 'Outline', 'Fill', 'Stroke', 'Width', 'Style', 'Start', 'End', 'Stack', 'Follow a path…']);
  [...document.querySelectorAll('.dropdown-content button')].find((b) => b.textContent.trim() === 'End').click();
  await nextTick();
  expect(host.querySelector('[data-part="end"]')).not.toBeNull();
  expect(host.querySelector('[data-part="start"]')).toBeNull();
  expect(project.frames[1].parts.get(key).has('end')).toBe(true);
});

test('+ Add key never lists Along: a follower has its row already, and nothing else has one', async () => {
  await animatedLine(makeShape({ ...LINE, follow: { key: 'v:path' } }));
  let host = await mount(KeysPanel);
  expect(await menu(host)).not.toContain('Along');
  expect(host.querySelector('[data-part="along"]')).not.toBeNull();
  app.unmount();
  app = null;
  const art = makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 3, rows: 1, cells: [[0, 'A', '#ff0000', null]] }, follow: { key: 'v:path' } });
  await animatedLine(art);
  host = await mount(KeysPanel);
  expect(await menu(host)).toEqual(['Transform', 'Stack']);
  app.unmount();
  app = null;
  await animatedLine();
  expect(await menu(await mount(KeysPanel))).not.toContain('Along');
});

test('+ Add key gives an art layer neither Start nor End', async () => {
  const art = makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 3, rows: 1, cells: [[0, 'A', '#ff0000', null]] } });
  await animatedLine(art);
  const items = await menu(await mount(KeysPanel));
  expect(items).not.toContain('Start');
  expect(items).not.toContain('End');
});

test('End shows as a percent, and typing 25 sets 0.25 as one history entry', async () => {
  const { project, key } = await animatedLine(makeShape({ ...LINE, end: 0.5 }));
  const host = await mount(KeyValues, { part: 'end', shapeKey: key });
  const input = host.querySelector('input');
  expect(input.value).toBe('50');
  const version = project.history.version;
  input.value = '25';
  input.dispatchEvent(new Event('change'));
  await nextTick();
  expect(project.shapes.get(key).end).toBe(0.25);
  expect(project.history.version).toBe(version + 1);
  expect(input.value).toBe('25');
});

test('a typed Start or End is held to 0 through 100 before it is written', async () => {
  const { project, key } = await animatedLine();
  const start = (await mount(KeyValues, { part: 'start', shapeKey: key })).querySelector('input');
  expect(start.value).toBe('0');
  start.value = '-20';
  start.dispatchEvent(new Event('change'));
  expect(project.shapes.get(key).start).toBeUndefined();
  start.value = '150';
  start.dispatchEvent(new Event('change'));
  expect(project.shapes.get(key).start).toBe(1);
});

test('VECTOR draws a handle on the line for each of Start and End it has a row for, and none without', async () => {
  const { project, key } = await animatedLine();
  const host = await mount(VectorOverlay, { unit: { x: 10, y: 10 } });
  const handles = () => host.querySelectorAll('[data-vector-overlay] circle.handle.trim').length;
  expect(handles()).toBe(0);
  project.addKey(key, 'end');
  await nextTick();
  expect(handles()).toBe(1);
  project.addKey(key, 'start');
  await nextTick();
  expect(handles()).toBe(2);
});

test('while a handle is dragged a label gives its name and percent', async () => {
  const { project, workspace, key } = await animatedLine();
  project.addKey(key, 'end');
  const host = await mount(VectorOverlay, { unit: { x: 10, y: 10 } });
  expect(host.querySelector('.trim-label')).toBeNull();
  workspace.vectorTrim = { part: 'end', share: 0.55 };
  await nextTick();
  expect(host.querySelector('[data-vector-overlay] .trim-label').textContent.trim()).toBe('End 55%');
});

test('the stretch not drawn is dashed in the shape\'s stroke color', async () => {
  const { project, key } = await animatedLine(makeShape({ ...LINE, end: 0.5 }));
  project.addKey(key, 'end');
  const host = await mount(VectorOverlay, { unit: { x: 10, y: 10 } });
  await nextTick();
  const undrawn = host.querySelectorAll('[data-vector-overlay] path.undrawn');
  expect(undrawn.length).toBe(1);
  expect(undrawn[0].style.stroke).toBe('rgb(255, 0, 0)');
});

// Priya's run: in the Transform row's values menu, X typed and then Escape closed the menu and moved the shape there,
// keyed. Escape backs out of the typing: the field goes back to the value in use and the menu closes, the shape as it was.
// The fields get focus the way Tab gives it, their number selected, not by a click: a number field's arrows start near
// its middle, a pixel or two either way by the browser's build, and a triple click landing on one steps X three times.
test('Escape in a key value backs out of the typing, in the row and in its values menu', async () => {
  const { project, key } = await animatedLine();
  const before = project.shapes.get(key);
  const inRow = (await mount(KeyValues, { part: 'transform', shapeKey: key })).querySelector('input');
  const was = inRow.value;
  inRow.focus();
  inRow.select();
  await userEvent.keyboard('5');
  await userEvent.keyboard('{Escape}');
  expect(inRow.value).toBe(was);
  inRow.blur();
  await nextTick();
  expect(project.shapes.get(key)).toBe(before);
  app.unmount();

  const host = await mount({ render: () => h(DropdownMenu, { label: 'Transform values', closeOnSelect: false },
    () => h(KeyValues, { part: 'transform', shapeKey: key })) });
  host.querySelector('.dropdown-trigger').click();
  await nextTick();
  const inMenu = document.querySelector('.dropdown-content input');
  inMenu.focus();
  inMenu.select();
  await userEvent.keyboard('5');
  await userEvent.keyboard('{Escape}');
  await nextTick();
  expect(document.querySelector('.dropdown-content')).toBeNull(); // the menu closes
  expect(project.shapes.get(key)).toBe(before);
});
