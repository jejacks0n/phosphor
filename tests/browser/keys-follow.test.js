// Following a path in the Keys panel: + Add key's Follow a path… starts the pick, a follower's Along row has the menu
// that sets how it moves, faces and steps (or lets it go), a path gets a Guide toggle, and KeyValues shows where a
// follower is (X and Y, not typed while it follows) and its Along as a percent.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage } from '../support/app.js';
import { makeShape, rectShape, withShape } from '@/document/shapes.js';
import KeysPanel from '@/components/KeysPanel.vue';
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

// A path across at y = 20 and a red square, on the second of two frames with Animate on, on VECTOR; the square selected
// (following the path when follow is set).
async function drawing({ follow = false, along = 0.5 } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  project.setAnimate(true);
  const p = project.addShape(makeShape({ points: [[4, 20, 0, 0, 0, 0, 0], [24, 20, 0, 0, 0, 0, 0]], closed: false, stroke: '#00ff00', width: 1 }));
  const square = withShape(rectShape(3, 3, 7, 7, { fill: '#ff0000' }), follow ? { follow: { key: p }, along } : {});
  const f = project.addShape(square);
  project.addFrame('blank');
  Object.assign(workspace, { editorTab: 'vector', vectorSelected: [f] });
  workspace.setActiveTool('vselect');
  return { project, workspace, p, f };
}

const items = () => [...document.querySelectorAll('.dropdown-content button')];
const item = (text) => items().find((b) => b.textContent.trim() === text);
async function open(host, selector) {
  if (document.querySelector('.dropdown-content')) return; // open already
  host.querySelector(`${selector} .dropdown-trigger`).click();
  await nextTick();
}

test('+ Add key lists Follow a path… for a plain shape, after the parts, and choosing it starts the pick', async () => {
  const { workspace, f } = await drawing();
  const host = await mount(KeysPanel);
  await open(host, '.add-key');
  expect(items().at(-1).textContent.trim()).toBe('Follow a path…');
  expect(document.querySelector('.dropdown-content .divider')).not.toBeNull();
  item('Follow a path…').click();
  await nextTick();
  expect(workspace.pickingPath).toBe(f);
});

test('+ Add key has no Follow a path… for a shape that follows one', async () => {
  await drawing({ follow: true });
  const host = await mount(KeysPanel);
  await open(host, '.add-key');
  expect(item('Follow a path…')).toBeUndefined();
});

test('picking ends with nothing done when the picker is deselected, the tool changes, or the tab does', async () => {
  const { project, workspace, f } = await drawing();
  await mount(KeysPanel);
  const version = project.history.version;
  for (const leave of [() => { workspace.vectorSelected = []; }, () => workspace.setActiveTool('vnode'), () => { workspace.editorTab = 'output'; }]) {
    Object.assign(workspace, { editorTab: 'vector', vectorSelected: [f] });
    workspace.setActiveTool('vselect');
    workspace.pickingPath = f;
    await nextTick();
    expect(workspace.pickingPath).toBe(f);
    leave();
    await nextTick();
    expect(workspace.pickingPath).toBe(null);
  }
  expect(project.history.version).toBe(version);
});

test('a follower has an Along row whatever its keys, its name a menu', async () => {
  const { project, f } = await drawing({ follow: true });
  const host = await mount(KeysPanel);
  expect(project.frames[1].parts?.get(f)).toBeUndefined(); // nothing keyed on the frame showing
  const row = host.querySelector('[data-part="along"]');
  expect(row).not.toBeNull();
  expect(row.querySelector('.along .dropdown-trigger').textContent.trim()).toBe('Along ▾');
});

test('the Along menu sets Moves, Face the path and Motion, and Stop following, each one history entry', async () => {
  const { project, f, p } = await drawing({ follow: true });
  const host = await mount(KeysPanel);
  await open(host, '.along');
  expect(items().map((b) => b.textContent.trim())).toEqual(['Along it, on its own keys', "With the line's start", "With the line's end", 'Face the path',
    'Smoothly', 'By half cells', 'By whole cells', 'Stop following']);
  expect([...document.querySelectorAll('.dropdown-content .heading')].map((e) => e.textContent.trim())).toEqual(['Moves', 'Motion']);
  expect(item('Along it, on its own keys').getAttribute('aria-pressed')).toBe('true');
  const steps = [["With the line's end", { key: p, ride: 'end' }], ['Face the path', { key: p, ride: 'end', face: true }],
    ['By whole cells', { key: p, ride: 'end', face: true, motion: 'cells' }]];
  for (const [name, follow] of steps) {
    const version = project.history.version;
    await open(host, '.along');
    item(name).click();
    await nextTick();
    expect(project.shapes.get(f).follow).toEqual(follow);
    expect(project.history.version).toBe(version + 1);
  }
  await open(host, '.along');
  expect(item("With the line's end").getAttribute('aria-pressed')).toBe('true');
  expect(item('Face the path').getAttribute('aria-pressed')).toBe('true');
  expect(item('By whole cells').getAttribute('aria-pressed')).toBe('true');
  const version = project.history.version;
  item('Stop following').click();
  await nextTick();
  expect(project.shapes.get(f)).not.toHaveProperty('follow');
  expect(project.history.version).toBe(version + 1);
  expect(host.querySelector('[data-part="along"]')).toBeNull();
});

test('an art layer\'s Along menu has no Face the path', async () => {
  const { project, workspace, p } = await drawing();
  const art = project.addShape({ z: 5, m: [1, 0, 0, 1, 0, 0], art: { cols: 2, rows: 1, cells: [[0, 'A', '#ff0000', null]] }, follow: { key: p } });
  project.noteFrame(); // into the frame showing's keys
  workspace.vectorSelected = [art];
  const host = await mount(KeysPanel);
  await open(host, '.along');
  expect(item('Face the path')).toBeUndefined();
  expect(item('Stop following')).not.toBeUndefined();
});

test('Guide shows for a path with followers and for a guide with none, and not for a plain shape', async () => {
  const { project, workspace, p, f } = await drawing({ follow: true });
  const host = await mount(KeysPanel);
  const guide = () => host.querySelector('.rest button.guide');
  expect(guide()).toBeNull(); // the follower
  workspace.vectorSelected = [p];
  await nextTick();
  expect(guide()).not.toBeNull();
  expect(guide().getAttribute('aria-pressed')).toBe('false');
  expect(guide().nextElementSibling.classList.contains('easing')).toBe(true); // before the easing menu
  const version = project.history.version;
  guide().click();
  await nextTick();
  expect(project.shapes.get(p).guide).toBe(true);
  expect(project.history.version).toBe(version + 1);
  project.stopFollowing([f]);
  await nextTick();
  expect(guide().getAttribute('aria-pressed')).toBe('true'); // a guide, with no followers
  project.setGuide([p], false);
  await nextTick();
  expect(guide()).toBeNull();
});

test('a follower\'s X and Y are off; its Along is a percent typed in as a share', async () => {
  const { project, f } = await drawing({ follow: true, along: 0.25 });
  const transform = await mount(KeyValues, { part: 'transform', shapeKey: f });
  const [x, y, turn] = transform.querySelectorAll('input');
  expect([x.disabled, y.disabled, turn.disabled]).toEqual([true, true, false]);
  expect([x.value, y.value]).toEqual(['9', '20']);
  app.unmount();
  const host = await mount(KeyValues, { part: 'along', shapeKey: f });
  const input = host.querySelector('input');
  expect(input.value).toBe('25');
  const version = project.history.version;
  input.value = '60';
  input.dispatchEvent(new Event('change'));
  await nextTick();
  expect(project.shapes.get(f).along).toBe(0.6);
  expect(project.history.version).toBe(version + 1);
  input.value = '150';
  input.dispatchEvent(new Event('change'));
  expect(project.shapes.get(f).along).toBe(1);
});

test('moving with the line\'s end, the Along value is the tip\'s percent, and off', async () => {
  const { project, f, p } = await drawing({ follow: true });
  project.updateShapes([[p, withShape(project.shapes.get(p), { end: 0.7 })]]);
  project.setFollow([f], { ride: 'end' });
  const input = (await mount(KeyValues, { part: 'along', shapeKey: f })).querySelector('input');
  expect(input.value).toBe('70');
  expect(input.disabled).toBe(true);
});
