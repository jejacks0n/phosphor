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
import { withPins } from '@/document/baseRecords.js';
import EditToolbar from '@/components/EditToolbar.vue';
import eraser from '@/tools/eraser';

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

// A cell with a pin under an edit cell: col 3, row 3.
function pinUnderEdit(project) {
  project.setBaseRecords(withPins(project.baseRecords, [{ col: 3, row: 3, char: 'P' }]));
  project.typeAt(3, 3, 'E', { fg: RED });
  project.commitEdit();
}

test('with the base picked, the toolbar offers only the base\'s tools', async () => {
  const { workspace } = await blank();
  workspace.editorTab = 'output';
  workspace.pickLayer('base');
  const host = document.createElement('div');
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  const ids = async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return [...host.querySelectorAll('[data-tool]')].map((b) => b.dataset.tool);
  };
  expect(await ids()).toEqual(['eraser', 'picker', 'wand', 'select', 'hand', 'zoom', 'flip']);
  workspace.pickLayer('edit');
  expect(await ids()).toContain('pencil');
});

test('the base picked while the Pencil is out takes the eraser', async () => {
  const { workspace } = await blank();
  workspace.inputActiveTool = 'brush';
  workspace.outputActiveTool = 'pencil';
  workspace.pickLayer('base');
  expect([workspace.inputActiveTool, workspace.outputActiveTool]).toEqual(['eraser', 'eraser']);
  workspace.outputActiveTool = 'select';
  workspace.pickLayer('edit');
  workspace.pickLayer('base');
  expect(workspace.outputActiveTool).toBe('select'); // a tool the base has stays
});

test('the eraser on the base erases the base, on the edit layer the edit layer', async () => {
  const { project, workspace } = await blank();
  pinUnderEdit(project);
  workspace.editEraserSize = 1;
  const ctx = { project, workspace, view: 'output' };
  const erase = () => { eraser.begin(ctx, { x: 3.5, y: 6.5 }); eraser.end(ctx); };
  workspace.pickLayer('base');
  erase();
  expect(project.baseRecords.pins.get('3,3')).toBe(' '); // the base erased to a pinned space
  expect(project.editCellAt(3, 3)?.char).toBe('E');
  project.setBaseRecords(withPins(project.baseRecords, [{ col: 3, row: 3, char: 'P' }]));
  workspace.pickLayer('edit');
  erase();
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(project.baseRecords.pins.get('3,3')).toBe('P');
});

test('Copy takes the picked layer', async () => {
  const { project, workspace } = await blank();
  pinUnderEdit(project);
  const rect = { c0: 2, r0: 2, c1: 4, r1: 4 };
  workspace.pickLayer('edit');
  expect(project.copySelection(rect, workspace.toolLayers).base).toBeUndefined();
  expect(project.copySelection(rect, workspace.toolLayers).cells.some(Boolean)).toBe(true);
  workspace.pickLayer('base');
  const block = project.copySelection(rect, workspace.toolLayers);
  expect(block.cells).toBeUndefined();
  expect(block.base.pins).toContain('P');
});

test('a new document opens on the edit layer, whatever was picked before', async () => {
  const { project, workspace } = await blank();
  workspace.editorTab = 'output';
  workspace.pickLayer('base');
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(workspace.pickedLayer).toBe('edit');

  workspace.pickLayer('base');
  const blob = await (await fetch('/tests/fixtures/ansi/past-the-edge.ans')).blob();
  await project.openArtFile(new File([blob], 'past-the-edge.ans'));
  await settle(project);
  expect(workspace.pickedLayer).toBe('edit');
});
