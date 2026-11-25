// The layer keys: Alt+] and Alt+[ pick the layer above and below in LAYERS' rows (typing too, past vector layers then,
// so the view stays ANSI and the cursor placed), stopping at the ends; Shift+Alt+N and Shift+Alt+V add a cells or vector
// layer above the pick (not while typing, once a press). The events are built from the table's keys for the platform
// the tests run on (a Mac here, Linux on CI), with the code the keys are matched by.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { i18n } from '@/i18n';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useTextTool } from '@/composables/useTextTool';
import { commandById, commandContext, runCommand } from '@/lib/commands';
import { keysFor, parseKey } from '@/lib/keymap';
import { isMac } from '@/lib/keyLabels';
import { MOST_LAYERS } from '@/document/layerInfo.js';

let app = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

// A blank drawing in the ANSI view, its layers bottom first: the base, Layer 1 ('edit') and Layer 2 above it, with the
// app's keys (the Text tool's first, as AnsiEditor's mount before EditWorkspace's).
async function mount() {
  const { project, workspace, pinia } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 8, rows: 8 });
  await settle(project);
  workspace.editorTab = 'output';
  project.addLayer('cells', 'edit');
  workspace.pickLayer('edit');
  app = createApp({ setup() { useTextTool(project, workspace, null); useKeyboardShortcuts(project, workspace); return () => null; } })
    .use(pinia).use(i18n);
  app.mount(document.createElement('div'));
  return { project, workspace };
}

// What the key types on a US layout: on a Mac, Option's characters.
const TYPED = isMac ? { BracketRight: '‘', BracketLeft: '“', KeyN: '˜', KeyV: '◊' } : { BracketRight: ']', BracketLeft: '[', KeyN: 'N', KeyV: 'V' };
const press = (id, init = {}) => {
  const k = parseKey(keysFor(commandById(id).keys)[0]);
  const e = new KeyboardEvent('keydown', { code: k.code, key: TYPED[k.code], altKey: k.alt, shiftKey: k.shift,
    ctrlKey: k.ctrl, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
};
const ids = (project) => project.layers.map((layer) => layer.id);

test('Alt+] picks the layer above, stopping at the top; Alt+[ twice reaches the base', async () => {
  const { project, workspace } = await mount();
  const [, , top] = ids(project);
  expect(press('layer.above').defaultPrevented).toBe(true);
  expect(workspace.pickedLayer).toBe(top);
  press('layer.above');
  expect(workspace.pickedLayer).toBe(top);
  press('layer.below');
  press('layer.below');
  expect(workspace.pickedLayer).toBe('base');
  press('layer.below');
  expect(workspace.pickedLayer).toBe('base');
});

test('Alt+] onto a vector layer goes to VECTOR, and Alt+[ back', async () => {
  const { project, workspace } = await mount();
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer('edit');
  press('layer.above');
  expect(workspace.pickedLayer).toBe(vector);
  expect(workspace.editorTab).toBe('vector');
  press('layer.below');
  expect(workspace.pickedLayer).toBe('edit');
  expect(workspace.editorTab).toBe('output');
});

test('on VECTOR before its first shape (its pick not in the stack yet) the steps do nothing', async () => {
  const { project, workspace } = await mount();
  workspace.editorTab = 'vector'; // the pick: the vector layer that shape will bring
  expect(workspace.pickedLayer).toBe('vector');
  press('layer.below');
  press('layer.above');
  expect(workspace.pickedLayer).toBe('vector');
  expect(workspace.editorTab).toBe('vector');
  expect(project.layers).toHaveLength(3);
});

test('Shift+Alt+N adds a cells layer above the pick and picks it, a held repeat adds no more; Shift+Alt+V a vector layer', async () => {
  const { project, workspace } = await mount();
  expect(press('layer.newCells').defaultPrevented).toBe(true);
  expect(project.layers).toHaveLength(4);
  const added = project.layers[2];
  expect(added.kind).toBe('cells');
  expect(workspace.pickedLayer).toBe(added.id);
  press('layer.newCells', { repeat: true });
  expect(project.layers).toHaveLength(4);
  press('layer.newVector');
  expect(project.layers[3].kind).toBe('vector');
  expect(workspace.pickedLayer).toBe(project.layers[3].id);
  expect(workspace.editorTab).toBe('vector');
});

test('at the most layers Shift+Alt+N adds none and says why in the command list', async () => {
  const { project, workspace } = await mount();
  while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit');
  expect(press('layer.newCells').defaultPrevented).toBe(true);
  press('layer.newVector');
  expect(project.layers).toHaveLength(MOST_LAYERS);
  expect(commandById('layer.newCells').available(commandContext(project, workspace))).toEqual(['layers.full', { n: MOST_LAYERS }]);
});

test('with Edit mode\'s cursor placed, Alt+] skips a vector layer to the cells layer above it and types nothing; Shift+Alt+N adds no layer', async () => {
  const { project, workspace } = await mount();
  const [, , top] = ids(project);
  project.addLayer('vector', 'edit');
  workspace.pickLayer('edit');
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 2, row: 1 };
  const before = cellsKey(project), version = project.history.version;
  expect(press('layer.above').defaultPrevented).toBe(true);
  expect(workspace.pickedLayer).toBe(top);
  expect(workspace.editorTab).toBe('output');
  expect(workspace.textCursor).toEqual({ col: 2, row: 1 });
  expect(cellsKey(project)).toEqual(before); // no ‘ typed
  expect(project.history.version).toBe(version);
  press('layer.below');
  expect(workspace.pickedLayer).toBe('edit');

  press('layer.newCells');
  expect(project.layers).toHaveLength(4);
  expect(workspace.textCursor).not.toBe(null);
});

// Run from the command list, with the cursor placed, the step keeps to the cells layers too: the list's context isn't
// typing, but the cursor is still there when the list has shut.
test('Layer above from the command list with the cursor placed skips the vector layer', async () => {
  const { project, workspace } = await mount();
  const [, , top] = ids(project);
  project.addLayer('vector', 'edit');
  workspace.pickLayer('edit');
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  runCommand('layer.above', commandContext(project, workspace));
  expect(workspace.pickedLayer).toBe(top);
  expect(workspace.editorTab).toBe('output');
});

// Review Focus 3: the eyedropper Alt holds goes before the step, so it isn't handed back to the wrong view.
test('Alt held as the eyedropper with the Pencil, Alt+] onto a vector layer, Alt up: VECTOR\'s tool is as it was, and ANSI\'s is the Pencil', async () => {
  const { project, workspace } = await mount();
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  workspace.setActiveTool('vshape');
  workspace.pickLayer('edit');
  workspace.setActiveTool('pencil');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', altKey: true, bubbles: true }));
  expect(workspace.activeTool).toBe('picker');
  press('layer.above');
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true }));
  expect(workspace.editorTab).toBe('vector');
  expect(workspace.activeTool).toBe('vshape');
  expect(workspace.heldTool).toBe(null);
  workspace.pickLayer('edit');
  expect(workspace.editorTab).toBe('output');
  expect(workspace.activeTool).toBe('pencil');
});

test('the layer keys leave a field\'s keys alone', async () => {
  const { project, workspace } = await mount();
  const field = document.body.appendChild(Object.assign(document.createElement('input'), { type: 'text' }));
  try {
    field.focus();
    for (const id of ['layer.above', 'layer.newCells']) {
      const k = parseKey(keysFor(commandById(id).keys)[0]);
      const e = new KeyboardEvent('keydown', { code: k.code, key: TYPED[k.code], altKey: true, shiftKey: k.shift, bubbles: true, cancelable: true });
      field.dispatchEvent(e);
      expect(e.defaultPrevented, id).toBe(false);
    }
    expect(workspace.pickedLayer).toBe('edit');
    expect(project.layers).toHaveLength(3);
  } finally {
    field.remove();
  }
});
