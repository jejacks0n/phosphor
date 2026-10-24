// Copy and paste: a copy puts the block on Phosphor's clipboard and its characters on the system
// clipboard; Cmd/Ctrl+V pastes whichever was copied last (the browser's paste event says what the
// system clipboard holds), and Phosphor's block when no paste event comes.
import { test, expect, vi, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, loadImage } from '../support/app.js';
import { copySelection } from '@/composables/clipboard';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { cellIndex } from '@/lib/Cells';

const COLS = 20, ATTRS = { fg: '#ffffff', bg: '#000000' };
const SOURCE = { c0: 0, r0: 0, c1: 4, r1: 1 };
let app = null;

afterEach(() => {
  app?.unmount();
  app = null;
  vi.restoreAllMocks();
});

// The editor with its keyboard shortcuts listening, 'ab漢' typed at the top left and copied.
async function editor({ writes = true } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: 20 });
  workspace.editorTab = 'output';
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  for (const [col, char] of [[0, 'a'], [1, 'b'], [2, '漢']]) project.typeAt(col, 0, char, ATTRS);
  project.commitEdit();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => (writes ? Promise.resolve() : Promise.reject(new Error('denied'))));
  copySelection(project, workspace, SOURCE, { base: true, edit: true });
  await Promise.resolve(); await Promise.resolve();
  return { project, workspace, writeText };
}

const chars = (project, row, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, k) => project.cells[cellIndex(c0 + k, row, COLS)].char).join('');

function commandV(text) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, cancelable: true }));
  if (text === undefined) return;
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', text);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }));
}

test('a copy writes the selection\'s characters to the system clipboard, a wide character once', async () => {
  const { project, workspace, writeText } = await editor();
  const text = `ab漢${chars(project, 0, 4, 4)}\n${chars(project, 1, 0, 4)}`; // the trail (col 3) adds nothing
  expect(writeText).toHaveBeenCalledWith(text);
  expect(workspace.clipboardText).toBe(text);
  expect(workspace.clipboard.w).toBe(5);
});

test('Cmd+V with the system clipboard still holding our copy pastes the block', async () => {
  const { project, workspace } = await editor();
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV(workspace.clipboardText);
  expect(chars(project, 4, 10, 12)).toBe('ab漢');
  expect(project.cells[cellIndex(12, 4, COLS)].wide).toBe('lead');
  expect(workspace.selection).toEqual({ c0: 10, r0: 4, c1: 14, r1: 5 });
});

test('Cmd+V with newer text on the system clipboard types it in at the selection', async () => {
  const { project, workspace } = await editor();
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV('hi字\nyo');
  expect(chars(project, 4, 10, 12)).toBe('hi字');
  expect(chars(project, 5, 10, 11)).toBe('yo');
});

test('Cmd+V with no paste event pastes the block', async () => {
  const { project, workspace } = await editor();
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV();
  await vi.waitFor(() => expect(chars(project, 4, 10, 12)).toBe('ab漢'), { timeout: 1000 });
});

test('without clipboard access the block keeps winning', async () => {
  const { project, workspace } = await editor({ writes: false });
  expect(workspace.clipboardText).toBe(null);
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV('something from elsewhere');
  expect(chars(project, 4, 10, 12)).toBe('ab漢');
});
