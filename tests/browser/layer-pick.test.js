// The picked layer (workspace.pickedLayer) decides the editor tabs: the base and the edit layer show PIXEL and ANSI, the
// vector layer VECTOR (and SAUCE), an art layer stepped into VECTOR and ANSI. followLayerPick keeps the pick in step with
// editorTab, so what sets the tab today still works.
import { test, expect, afterEach } from 'vitest';
import { createApp, h } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import EditTabs from '@/components/EditTabs.vue';
import { i18n } from '@/i18n';
import { rectShape } from '@/document/shapes.js';
import { isArt } from '@/document/artLayers.js';

const RED = '#ff0000';
let mounted = null;
afterEach(() => { mounted?.unmount(); mounted = null; });

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

// EditTabs, following the workspace's tab as App.vue's EditWorkspace does; the names of the tabs it shows.
async function tabsOf(workspace) {
  const host = document.createElement('div');
  mounted = createApp({ render: () => h(EditTabs, { modelValue: workspace.editorTab }) }).use(i18n);
  mounted.mount(host);
  return async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return [...host.querySelectorAll('[role=tab]')].map((b) => b.textContent.trim());
  };
}

function artLayer(project, workspace) {
  project.typeAt(2, 1, 'H', { fg: RED });
  project.commitEdit();
  workspace.selection = { c0: 1, r0: 0, c1: 6, r1: 2 };
  return project.makeArtLayer();
}

test('picking the vector layer shows VECTOR and SAUCE', async () => {
  const { project, workspace } = await blank();
  const names = await tabsOf(workspace);
  expect(await names()).toEqual(['PIXEL', 'ANSI', 'SAUCE']);
  project.addVectorLayer();
  workspace.pickLayer('vector');
  expect(workspace.pickedLayer).toBe('vector');
  expect(workspace.editorTab).toBe('vector');
  expect(await names()).toEqual(['VECTOR', 'SAUCE']);
});

test('picking the edit layer from VECTOR goes back to the art tab last shown', async () => {
  const { project, workspace } = await blank();
  project.addVectorLayer();
  workspace.editorTab = 'output';
  workspace.viewTab = 'output';
  workspace.pickLayer('vector');
  workspace.pickLayer('edit');
  expect(workspace.pickedLayer).toBe('edit');
  expect(workspace.editorTab).toBe('output');
});

test('the tab chosen decides the pick: VECTOR picks the vector layer, any other art tab the edit layer', async () => {
  const { workspace } = await blank();
  workspace.editorTab = 'vector';
  expect(workspace.pickedLayer).toBe('vector');
  workspace.editorTab = 'input';
  expect(workspace.pickedLayer).toBe('edit');
  workspace.pickLayer('base');
  workspace.editorTab = 'sauce';
  expect(workspace.pickedLayer).toBe('base');
});

test('Make art layer picks the vector layer', async () => {
  const { project, workspace } = await blank();
  expect(artLayer(project, workspace)).not.toBe(null);
  expect(workspace.pickedLayer).toBe('vector');
});

test('inside an art layer: VECTOR, ANSI and SAUCE, the vector row picked', async () => {
  const { project, workspace } = await blank();
  const key = artLayer(project, workspace);
  expect(isArt(project.shapes.get(key))).toBe(true);
  const names = await tabsOf(workspace);
  expect(project.enterArt(key)).toBe(true);
  workspace.editorTab = 'output';
  expect(await names()).toEqual(['VECTOR', 'ANSI', 'SAUCE']);
  expect(workspace.shownPick).toBe('vector');
  workspace.pickLayer('base');
  expect(workspace.pickedLayer).not.toBe('base');
  expect(project.artInside).toBeTruthy();
  workspace.pickLayer('edit');
  expect(project.artInside).toBeFalsy();
  expect(workspace.shownPick).toBe('edit');
  expect(await names()).toEqual(['PIXEL', 'ANSI', 'SAUCE']);
});

test('the vector layer gone while picked falls back to the edit layer', async () => {
  const { project, workspace } = await blank();
  const key = project.addShape(rectShape(10, 10, 16, 20, { fill: RED }));
  expect(project.layerInfo.vector).toBe(null); // there for its shape alone
  workspace.editorTab = 'output';
  workspace.viewTab = 'output';
  workspace.pickLayer('vector');
  expect(workspace.pickedLayer).toBe('vector');
  project.deleteShapes([key]);
  expect(project.hasVectorLayer).toBe(false);
  expect(workspace.pickedLayer).toBe('edit');
  expect(workspace.editorTab).toBe('output');
});

test('an artist can not pick the base', async () => {
  const { project, workspace } = await blank();
  project._sharing = { role: 'artist' };
  workspace.pickLayer('base');
  expect(workspace.pickedLayer).toBe('edit');
  project._sharing = null;
  workspace.pickLayer('base');
  expect(workspace.pickedLayer).toBe('base');
  project._sharing = { role: 'artist' };
  expect(workspace.pickedLayer).toBe('edit');
});
