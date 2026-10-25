// The Select tool: floating moves and pastes, around typing, undo and wide characters.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';

const COLS = 30, ATTRS = { fg: '#ffffff', bg: '#000000' };
const LAYERS = { base: true, edit: true };

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: 30 });
  return { project, workspace };
}
const cell = (project, col, row) => project.cells[cellIndex(col, row, project.cols)];

test('text typed (a paste from another app) while a block floats is not undone by the next nudge', async () => {
  const { project } = await scene();
  for (const [c, ch] of [[5, 'A'], [6, 'B'], [7, 'C']]) project.typeAt(c, 5, ch, ATTRS);
  project.commitEdit();
  // Float the block A B C two cells down.
  const rect = project.floatSelection({ c0: 5, r0: 5, c1: 7, r1: 5 }, LAYERS, 0, 2);
  expect(rect).toEqual({ c0: 5, r0: 7, c1: 7, r1: 7 });
  // Cmd+V with text copied elsewhere types it at the selection (useKeyboardShortcuts _handlePaste ->
  // typeText): a typing run, left open for a second.
  project.typeAt(5, 7, 'x', ATTRS);
  // An arrow key nudges the selection right, within that second.
  project.floatSelection(rect, LAYERS, 1, 0);
  project.render(); await settle(project);
  // Expected: the typed x stays (it's part of the block now, or at least not undone) and the block
  // moved one right: x B C at 6..8. Nothing from the erased source (black spaces) lands on it.
  const row = [6, 7, 8].map((c) => cell(project, c, 7).char).join('');
  expect(row).toBe('xBC');
});

test('a block pasted just right of a wide character shows its first column (the wide character breaks, as typing does)', async () => {
  const { project } = await scene();
  project.typeAt(10, 3, 'Z', ATTRS);
  project.commitEdit();
  const block = project.copySelection({ c0: 10, r0: 3, c1: 10, r1: 3 }, { base: false, edit: true });
  project.typeAt(4, 3, '漢', ATTRS); // lead 4, trail 5
  project.commitEdit();
  expect(cell(project, 5, 3).wide).toBe('trail');
  project.pasteSelection(block, 5, 3); // onto the trail
  // Typing Z at col 5 would turn the lead into a space and show Z; a paste of the same cell hides it.
  expect(cell(project, 5, 3).char).toBe('Z');
});

test('typing at the same place breaks the wide character (the behavior a paste should match)', async () => {
  const { project } = await scene();
  project.typeAt(4, 3, '漢', ATTRS);
  project.commitEdit();
  project.typeAt(5, 3, 'Z', ATTRS);
  project.commitEdit();
  expect(cell(project, 5, 3).char).toBe('Z');
  expect(cell(project, 4, 3).char).toBe(' ');
});

test('a paste dragged off the right edge and back comes back whole', async () => {
  const { project } = await scene();
  for (const [c, ch] of [[1, 'A'], [2, 'B'], [3, 'C']]) project.typeAt(c, 1, ch, ATTRS);
  project.commitEdit();
  const block = project.copySelection({ c0: 1, r0: 1, c1: 3, r1: 1 }, LAYERS);
  const rect = project.pasteSelection(block, 28, 5); // clipped: A B
  expect(rect).toEqual({ c0: 28, r0: 5, c1: 29, r1: 5 });
  project.floatSelection(rect, LAYERS, -10, 0);
  project.render(); await settle(project);
  expect([18, 19, 20].map((c) => cell(project, c, 5).char).join('')).toBe('ABC');
});

test('undo of a move puts the cells back', async () => {
  const { project } = await scene();
  project.typeAt(5, 5, 'A', ATTRS);
  project.commitEdit();
  const before = cellsKey(project);
  project.floatSelection({ c0: 5, r0: 5, c1: 5, r1: 5 }, LAYERS, 3, 0);
  project.undo(); await settle(project);
  expect(cellsKey(project)).toEqual(before);
});

// The same, through the real keys: useKeyboardShortcuts mounted, as tests/browser/clipboard.test.js does.
import { createApp } from 'vue';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { afterEach } from 'vitest';

let app = null;
afterEach(() => { app?.unmount(); app = null; });
async function editor() {
  const { project, workspace } = await scene();
  workspace.editorTab = 'output';
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  return { project, workspace };
}
const key = (k, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true, ...extra }));
function pasteText(text) {
  key('v', { metaKey: true });
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', text);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }));
}

test('nudge a block, Cmd+V text from another app, nudge again: the block and the text survive', async () => {
  const { project, workspace } = await editor();
  for (const [c, ch] of [[5, 'A'], [6, 'B'], [7, 'C']]) project.typeAt(c, 5, ch, ATTRS);
  project.commitEdit();
  workspace.selectAll({ c0: 5, r0: 5, c1: 7, r1: 5 });
  key('ArrowDown'); // the block floats one row down
  expect(workspace.selection).toEqual({ c0: 5, r0: 6, c1: 7, r1: 6 });
  pasteText('x'); // nothing on Phosphor's clipboard: the text types at the selection
  expect(cell(project, 5, 6).char).toBe('x');
  key('ArrowRight');
  project.render(); await settle(project);
  expect([6, 7, 8].map((c) => cell(project, c, 6).char).join('')).toBe('xBC');
});

test('undo after a nudge: the selection goes back with the cells', async () => {
  const { project, workspace } = await editor();
  project.typeAt(5, 5, 'A', ATTRS);
  project.commitEdit();
  workspace.selectAll({ c0: 5, r0: 5, c1: 5, r1: 5 });
  key('ArrowRight'); key('ArrowRight'); key('ArrowRight');
  expect(cell(project, 8, 5).char).toBe('A');
  key('z', { metaKey: true });
  await settle(project);
  expect(cell(project, 5, 5).char).toBe('A'); // the cells went back
  expect(workspace.selection).toEqual({ c0: 5, r0: 5, c1: 5, r1: 5 });
});

test('a nudge after text typed onto a moved block: one undo brings the block back with the text', async () => {
  const { project } = await scene();
  for (const [c, ch] of [[5, 'A'], [6, 'B'], [7, 'C']]) project.typeAt(c, 5, ch, ATTRS);
  project.commitEdit();
  let rect = project.floatSelection({ c0: 5, r0: 5, c1: 7, r1: 5 }, LAYERS, 0, 2);
  project.typeAt(5, 7, 'x', ATTRS);
  project.floatSelection(rect, LAYERS, 1, 0);
  project.undo(); await settle(project);
  const row = [5, 6, 7].map((c) => cell(project, c, 7).char).join('');
  expect(row).toBe('xBC'); // fails if the typed x was lost
});

test('moving a wide character one column right leaves nothing behind where it was', async () => {
  const { project } = await scene();
  const before = cell(project, 4, 3).char;
  project.typeAt(4, 3, '漢', ATTRS); // lead 4, trail 5
  project.commitEdit();
  project.floatSelection({ c0: 4, r0: 3, c1: 5, r1: 3 }, { base: false, edit: true }, 1, 0);
  project.render(); await settle(project);
  expect(cell(project, 5, 3).char).toBe('漢');
  expect(cell(project, 4, 3).char).toBe(before); // the converter's own character, not a space
});
