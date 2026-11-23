// ] and [ grow and shrink the tool's Size, as in Photoshop: a whole step at a time, within the slider's range, for
// the Brush, the Eraser (each view its own size) and Blur, Dodge and Burn. Not while typing.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

let app = null;
afterEach(() => { app?.unmount(); app = null; });

async function setup() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  workspace.editorTab = 'output';
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  return { project, workspace };
}
const key = (k, init = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
};

test('] grows the Brush a step at a time and [ shrinks it, within the slider\'s 1 to 20', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('brush');
  expect(workspace.editBrushSize).toBe(2.5);
  expect(key(']').defaultPrevented).toBe(true);
  key(']');
  expect(workspace.editBrushSize).toBe(4.5);
  key('['); key('['); key('['); key('[');
  expect(workspace.editBrushSize).toBe(1);
  workspace.editBrushSize = 19.7;
  key(']'); key(']');
  expect(workspace.editBrushSize).toBe(20);
});

test('the Eraser\'s keys change the size of the view it\'s in; Blur\'s change Retouch\'s', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('eraser');
  key(']');
  expect([workspace.editEraserCells, workspace.editEraserSize]).toEqual([2, 5]);
  workspace.editorTab = 'input'; // each view keeps its own tool
  workspace.setActiveTool('eraser');
  key('[');
  expect([workspace.editEraserCells, workspace.editEraserSize]).toEqual([2, 4]);
  workspace.setActiveTool('blur');
  key(']');
  expect(workspace.retouchSize).toBe(7);
  workspace.editorTab = 'output'; // a Soft eraser's Size is the PIXEL one, in the ANSI view too
  workspace.editEraserSoft = true;
  key(']');
  expect([workspace.editEraserCells, workspace.editEraserSize]).toEqual([2, 5]);
});

test('[ and ] change nothing while typing in Edit Mode, or with a tool that has no Size', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('pencil');
  expect(key(']').defaultPrevented).toBe(false);
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 0, row: 0 };
  workspace.editBrushSize = 2.5;
  expect(key(']').defaultPrevented).toBe(false);
  expect(workspace.editBrushSize).toBe(2.5);
});

test('a layout that types [ and ] with Shift keeps the Size keys; Shift on the bracket keys is the hardness\'s', async () => {
  const { workspace } = await setup();
  workspace.setActiveTool('brush');
  expect(key(']', { code: 'Digit9', shiftKey: true }).defaultPrevented).toBe(true); // ] typed with Shift on another key
  expect(workspace.editBrushSize).toBe(3.5);
  key('[', { code: 'Digit8', shiftKey: true });
  expect(workspace.editBrushSize).toBe(2.5);
  key(']', { code: 'BracketRight', shiftKey: true }); // Shift+] by code: Harder, not a size
  expect(workspace.editBrushSize).toBe(2.5);
});
