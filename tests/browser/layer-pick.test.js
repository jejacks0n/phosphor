// The picked layer (workspace.pickedLayer) decides the editor tabs: the base and the edit layer show PIXEL and ANSI, the
// vector layer VECTOR (and SAUCE), an art layer stepped into VECTOR and ANSI. followLayerPick keeps the pick in step with
// editorTab, so what sets the tab today still works.
import { test, expect, afterEach } from 'vitest';
import { createApp, h, markRaw } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import EditTabs from '@/components/EditTabs.vue';
import { i18n } from '@/i18n';
import { rectShape } from '@/document/shapes.js';
import { isArt } from '@/document/artLayers.js';
import { withPins } from '@/document/baseRecords.js';
import EditToolbar from '@/components/EditToolbar.vue';
import eraser from '@/tools/eraser';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { toastMessage, closeToast } from '@/composables/useToast.js';

const RED = '#ff0000';
let mounted = null;
afterEach(() => { mounted?.unmount(); mounted = null; closeToast(); });

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

// Selections work on what's shown (workspace.selectionLayers), whatever layer is picked; hiding a layer leaves it out.
async function selecting() {
  const app = await blank();
  const { project, workspace } = app;
  pinUnderEdit(project);
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 4, r1: 4 };
  mounted = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  mounted.mount(document.createElement('div'));
  const press = (key, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...extra }));
  return { ...app, press };
}
const pin = (project) => project.baseRecords.pins.get('3,3');

test('selectionLayers is the shown layers, whatever is picked', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('edit');
  expect(workspace.selectionLayers).toEqual({ base: true, edit: true });
  project.setLayerHidden('base', true);
  expect(workspace.selectionLayers).toEqual({ base: false, edit: true });
  workspace.pickLayer('base');
  project.setLayerHidden('edit', true);
  project.setLayerHidden('base', false);
  expect(workspace.selectionLayers).toEqual({ base: true, edit: false });
});

test('Copy takes every shown layer, the base too with the edit layer picked; a hidden one is left out', async () => {
  const { project, workspace, press } = await selecting();
  press('c', { ctrlKey: true });
  expect(workspace.clipboard.cells.some(Boolean)).toBe(true);
  expect(workspace.clipboard.base.pins).toContain('P');
  project.setLayerHidden('base', true);
  press('c', { ctrlKey: true });
  expect(workspace.clipboard.cells.some(Boolean)).toBe(true);
  expect(workspace.clipboard.base).toBeUndefined();
  project.setLayerHidden('base', false);
  workspace.pickLayer('base');
  press('c', { ctrlKey: true });
  expect(workspace.clipboard.cells.some(Boolean)).toBe(true);   // the edit layer is shown, though the base is picked
  expect(workspace.clipboard.base.pins).toContain('P');
});

test('the toolbar\'s Copy takes the shown layers too', async () => {
  const { project, workspace } = await blank();
  pinUnderEdit(project);
  workspace.editorTab = 'output';
  workspace.pickLayer('edit');
  workspace.setActiveTool('select');
  workspace.selection = { c0: 2, r0: 2, c1: 4, r1: 4 };
  const host = document.createElement('div');
  document.body.append(host);
  mounted = createApp(EditToolbar).use(i18n);
  mounted.mount(host);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const copy = [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Copy ('));
  copy.click();
  host.remove();
  expect(workspace.clipboard.base.pins).toContain('P');
  expect(workspace.clipboard.cells.some(Boolean)).toBe(true);
});

test('Cut takes and removes every shown layer; with the base hidden, only the edit cell', async () => {
  const { project, workspace, press } = await selecting();
  project.setLayerHidden('base', true);
  press('x', { ctrlKey: true });
  expect(workspace.clipboard.base).toBeUndefined();
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe('P');
  project.undo();
  project.setLayerHidden('base', false);
  press('x', { ctrlKey: true });
  expect(workspace.clipboard.base.pins).toContain('P');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe(' ');
});

test('Delete with Select, and a nudge, act on the shown layers; the Wand\'s Delete too', async () => {
  const { project, workspace, press } = await selecting();
  project.setLayerHidden('base', true);
  press('Delete');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe('P');
  project.undo();
  project.setLayerHidden('base', false);
  press('ArrowRight');   // the block moves with the base under it (its pin is vacated)
  expect(project.editCellAt(4, 3)?.char).toBe('E');
  expect(pin(project)).toBe(' ');
  project.undo();

  workspace.selection = null;
  workspace.setActiveTool('wand');
  const mask = new Uint8Array(20 * 10);
  mask[3 * 20 + 3] = 1;
  workspace.wand = markRaw({ view: 'output', width: 20, height: 10, mask, within: null });
  project.setLayerHidden('base', true);
  press('Delete');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe('P');
  project.undo();
  project.setLayerHidden('base', false);
  press('Delete');
  expect(project.editCellAt(3, 3)).toBeUndefined();
  expect(pin(project)).toBe(' ');
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

test('with the base picked, a tool key for a tool the base hasn\'t says where it draws', async () => {
  const { project, workspace } = await blank();
  workspace.editorTab = 'output';
  workspace.pickLayer('base');
  mounted = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  mounted.mount(document.createElement('div'));
  const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
  workspace.setActiveTool('eraser');
  press('p');
  expect(workspace.activeTool).toBe('eraser');
  expect(toastMessage.value).toBe('Pencil draws on Layer 1. Pick it in Layers.');
  closeToast();
  project.renameLayer('edit', 'Ink');
  press('b');
  expect(toastMessage.value).toBe('Brush draws on Ink. Pick it in Layers.');
  closeToast();
  press('i'); // one the base has
  expect(workspace.activeTool).toBe('picker');
  expect(toastMessage.value).toBeFalsy();
});
