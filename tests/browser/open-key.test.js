// Cmd/Ctrl+O opens the file chooser with the Text tool's caret placed (typing never uses the key), and a new document
// puts the caret away.
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
const cmdO = () => {
  const e = new KeyboardEvent('keydown', { key: 'o', metaKey: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

test('Cmd+O asks for the file chooser with the Text tool\'s caret placed, and types nothing', async () => {
  const { project, workspace } = await setup();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 3, row: 2 };
  const [requests, edits] = [workspace.openRequest, project.editVersion];
  expect(cmdO().defaultPrevented).toBe(true);
  expect(workspace.openRequest).toBe(requests + 1);
  expect(project.editVersion).toBe(edits);
  expect(workspace.textCursor).toEqual({ col: 3, row: 2 });
});

test('a new document puts the caret away, and Escape\'s last place with it', async () => {
  const { project, workspace } = await setup();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 3, row: 2 };
  workspace.lastTextCursor = { col: 1, row: 1 };
  project.newDocument();
  expect(workspace.textCursor).toBe(null);
  expect(workspace.lastTextCursor).toBe(null);
});
