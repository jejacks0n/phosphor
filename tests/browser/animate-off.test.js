// With Animate off, nothing of animation shows, even in a document that keeps its frames: the animated exports, the
// Animation shortcuts and the outlines of the shapes a Blank frame carries. Turning it on brings them back.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { getActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import { createTestApp, loadImage } from '../support/app.js';
import { makeShape, rectShape } from '@/document/shapes.js';
import ProjectActions from '@/components/ProjectActions.vue';
import ShortcutsDialog from '@/components/ShortcutsDialog.vue';
import VectorOverlay from '@/components/VectorOverlay.vue';
import KeysPanel from '@/components/KeysPanel.vue';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

// A movie of two Blank frames, the second carrying a shape from the first, with Animate turned off after.
async function framesKept() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.setAnimate(true);
  project.addShape(rectShape(2, 2, 8, 8, { fill: '#ff0000' }));
  project.addFrame('blank');
  project.setAnimate(false);
  return { project, workspace };
}

async function mount(component, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(component, props) }).use(getActivePinia()).use(i18n);
  app.mount(host);
  await nextTick();
  return host;
}

test('the animated exports show only with Animate on', async () => {
  const { project } = await framesKept();
  const host = await mount(ProjectActions);
  const labels = () => [...host.querySelectorAll('button')].map((b) => b.textContent.trim());
  expect(project.hasFrames).toBe(true);
  expect(labels()).not.toContain('Export animated .ans');
  expect(labels()).not.toContain('Export .gif');
  project.setAnimate(true);
  await nextTick();
  expect(labels()).toContain('Export animated .ans');
});

test('the Animation shortcuts show only with Animate on', async () => {
  const { project } = await framesKept();
  await mount(ShortcutsDialog);
  const text = () => document.body.textContent; // the dialog may sit outside its host
  expect(text()).toContain('Tools');
  expect(text()).not.toContain('Animation');
  project.setAnimate(true);
  await nextTick();
  expect(text()).toContain('Animation');
});

test('a Blank frame\'s carried shapes are outlined only with Animate on', async () => {
  const { project, workspace } = await framesKept();
  workspace.editorTab = 'vector';
  expect(project.frame).toBe(1);
  expect(project.inheritedShapes().size).toBe(1);
  const host = await mount(VectorOverlay, { unit: { x: 10, y: 10 } });
  expect(host.querySelectorAll('path.carried').length).toBe(0);
  project.setAnimate(true);
  await nextTick();
  expect(host.querySelectorAll('path.carried').length).toBeGreaterThan(0);
});

test('a trimmed line\'s Start and End handles show only with Animate on', async () => {
  const { project, workspace } = await framesKept();
  project.showFrame(0);
  const key = project.addShape(makeShape({ points: [[2, 10, 0, 0, 0, 0, 0], [18, 10, 0, 0, 0, 0, 0]], closed: false, stroke: '#ff0000', width: 2 }));
  project.setAnimate(true);
  project.showFrame(1);
  project.addKey(key, 'end');
  Object.assign(workspace, { editorTab: 'vector', activeTool: 'vselect', vectorSelected: [key] });
  const host = await mount(VectorOverlay, { unit: { x: 10, y: 10 } });
  expect(host.querySelectorAll('circle.handle.trim').length).toBeGreaterThan(0);
  project.setAnimate(false);
  await nextTick();
  expect(host.querySelectorAll('circle.handle.trim').length).toBe(0);
});

test('picking a path ends when Animate turns off, and a guide\'s outline still shows with it off', async () => {
  const { project, workspace } = await framesKept();
  project.setAnimate(true);
  const g = project.addShape(makeShape({ points: [[2, 10, 0, 0, 0, 0, 0], [18, 10, 0, 0, 0, 0, 0]], closed: false, stroke: '#00ff00', width: 1, guide: true }));
  const f = project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }));
  project.noteFrame(); // into the frame showing's keys
  Object.assign(workspace, { editorTab: 'vector', vectorSelected: [f] });
  workspace.setActiveTool('vselect');
  const host = await mount({ render: () => [h(KeysPanel), h(VectorOverlay, { unit: { x: 10, y: 10 } })] });
  workspace.pickingPath = f;
  await nextTick();
  expect(workspace.pickingPath).toBe(f);
  project.setAnimate(false);
  await nextTick();
  expect(workspace.pickingPath).toBe(null);
  expect(project.shapes.has(g)).toBe(true);
  expect(host.querySelectorAll('[data-vector-overlay] path.guide').length).toBe(1);
});
