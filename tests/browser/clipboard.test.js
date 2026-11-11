// Copy and paste: a copy puts the block on Phosphor's clipboard, and on the system clipboard its
// characters as text and, in the HTML slot, Moebius's block with Phosphor's alongside. Cmd/Ctrl+V
// pastes a Phosphor block (this tab's own as it is now, another tab's as it came), else a Moebius
// block, else the text; Phosphor's block when no paste event comes or the browser refused the copy.
import { test, expect, vi, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { copySelection, decodeBlock } from '@/composables/clipboard';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { readClipboardHtml } from '@/lib/clipboardBlocks';
import { cellIndex } from '@/lib/Cells';

const COLS = 20, ATTRS = { fg: '#ffffff', bg: '#000000' };
const SOURCE = { c0: 0, r0: 0, c1: 4, r1: 1 };
let app = null;

afterEach(() => {
  app?.unmount();
  app = null;
  vi.restoreAllMocks();
});

const listen = (project, workspace) => {
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
};

// The system clipboard's write, faked: a copy is written through a copy event (execCommand), and
// the text alone through writeText when that's refused. written: what went ({ text, html }).
function fakeClipboard({ writes = true, copyEvents = writes } = {}) {
  const written = [];
  const write = vi.spyOn(document, 'execCommand').mockImplementation((command) => {
    if (command !== 'copy' || !copyEvents) return false;
    const clipboardData = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData, cancelable: true }));
    written.push({ text: clipboardData.getData('text/plain'), html: clipboardData.getData('text/html') });
    return true;
  });
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => (writes ? Promise.resolve() : Promise.reject(new Error('denied'))));
  return { written, write, writeText };
}

// The editor with its keyboard shortcuts listening, 'ab漢' typed at the top left and copied.
async function editor({ writes = true } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: 20 });
  workspace.editorTab = 'output';
  listen(project, workspace);
  for (const [col, char] of [[0, 'a'], [1, 'b'], [2, '漢']]) project.typeAt(col, 0, char, ATTRS);
  project.commitEdit();
  const clipboard = fakeClipboard({ writes });
  copySelection(project, workspace, SOURCE, ['base', 'edit']);
  await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalledTimes(writes ? 0 : 1));
  if (writes) await vi.waitFor(() => expect(workspace.clipboardText).not.toBe(null));
  return { project, workspace, ...clipboard };
}

const chars = (project, row, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, k) => project.cells[cellIndex(c0 + k, row, COLS)].char).join('');
const moebius = async (name) => (await fetch(`/tests/fixtures/clipboard/${name}.html`)).text();

function commandV(text, html) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, cancelable: true }));
  if (text === undefined) return;
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', text);
  if (html !== undefined) clipboardData.setData('text/html', html);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true }));
}

test('a copy writes the characters as text, a wide character once, and the block as Moebius\'s with Phosphor\'s', async () => {
  const { project, workspace, written } = await editor();
  const text = `ab漢${chars(project, 0, 4, 4)}\n${chars(project, 1, 0, 4)}`; // the trail (col 3) adds nothing
  expect(written[0].text).toBe(text);
  expect(workspace.clipboardText).toBe(text);
  const html = JSON.parse(written[0].html);
  expect([html.columns, html.rows, html.data.length]).toEqual([5, 2, 10]);
  expect(html.data[0]).toMatchObject({ code: 97, fg: 15, bg: 0, fg_rgb: { r: 255, g: 255, b: 255 } });
  expect(html.phosphor).toMatchObject({ version: 1, id: workspace.clipboardId, w: 5, h: 2 });
  expect(html.phosphor.cells[0]).toEqual({ char: 'a', ...ATTRS });
});

test('a cell that shows nothing copies as a space, as it exports', async () => {
  const { project, workspace, written } = await editor();
  const hidden = { char: '▒', fg: { ...ATTRS, hex: '#000000' }, bg: { ...ATTRS, hex: '#000000' } };
  project.cells[cellIndex(1, 1, COLS)] = hidden;
  copySelection(project, workspace, SOURCE, ['base', 'edit']);
  expect(written.at(-1).text.split('\n')[1][1]).toBe(' ');
});

test('where the copy event is refused, the text alone is written', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: 20 });
  const { writeText } = fakeClipboard({ copyEvents: false });
  copySelection(project, workspace, SOURCE, ['base', 'edit']);
  await vi.waitFor(() => expect(workspace.clipboardText).not.toBe(null));
  expect(writeText).toHaveBeenCalledWith(workspace.clipboardText);
});

test('Cmd+V with the system clipboard still holding our copy pastes the block', async () => {
  const { project, workspace, written } = await editor();
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV(written[0].text, written[0].html);
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

test('HTML that isn\'t a block (a web page) leaves the text to type', async () => {
  const { project, workspace } = await editor();
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV('hi', '<meta charset="utf-8"><p>hi</p>');
  expect(chars(project, 4, 10, 11)).toBe('hi');
});

test('Cmd+V with no paste event pastes the block', async () => {
  const { project, workspace } = await editor();
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV();
  await vi.waitFor(() => expect(chars(project, 4, 10, 12)).toBe('ab漢'), { timeout: 1000 });
});

test('without clipboard access the block keeps winning, over text and over a Moebius block', async () => {
  const { project, workspace } = await editor({ writes: false });
  expect(workspace.clipboardText).toBe(null);
  workspace.selection = { c0: 10, r0: 4, c1: 10, r1: 4 };
  commandV('something from elsewhere');
  expect(chars(project, 4, 10, 12)).toBe('ab漢');
  workspace.selection = { c0: 10, r0: 8, c1: 10, r1: 8 };
  commandV('123456\n123456', await moebius('moebius-16-colors'));
  expect(chars(project, 8, 10, 12)).toBe('ab漢');
});

test('a Moebius block pastes with its colors, floating and selected, as one undo step', async () => {
  for (const name of ['moebius-16-colors', 'moebius-24-bit']) {
    const { project, workspace } = await editor();
    workspace.selection = { c0: 2, r0: 6, c1: 2, r1: 6 };
    const before = cellsKey(project);
    commandV('123456\r\n123456', await moebius(name));
    await settle(project);
    expect(chars(project, 6, 2, 7)).toBe('123456');
    expect(chars(project, 7, 2, 7)).toBe('123456');
    expect(workspace.selection).toEqual({ c0: 2, r0: 6, c1: 7, r1: 7 });
    const at = (col) => project.cells[cellIndex(col, 6, COLS)];
    expect([at(2).fg.hex, at(2).bg.hex, at(3).bg.hex]).toEqual(['#ff5555', '#000000', '#aa0000']);
    expect(at(6).fg.hex).toBe(name === 'moebius-24-bit' ? '#87ff5f' : '#5555ff');
    project.undo();
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
  }
});

test('a Moebius block wider than the grid is cut at its edge', async () => {
  const { project, workspace } = await editor();
  const data = Array.from({ length: 40 }, (_, i) => ({ code: 65 + (i % 26), fg: 7, bg: 1 }));
  workspace.selection = { c0: 15, r0: 9, c1: 15, r1: 9 };
  commandV('', JSON.stringify({ columns: 40, rows: 1, data }));
  expect(chars(project, 9, 15, 19)).toBe('ABCDE');
  expect(workspace.selection).toEqual({ c0: 15, r0: 9, c1: 19, r1: 9 });
});

test('our own block on the clipboard, copied before a Bake, pastes as Bake left it', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: COLS, rows: 20 });
  workspace.editorTab = 'output';
  listen(project, workspace);
  const { written } = fakeClipboard();
  copySelection(project, workspace, { c0: 10, r0: 6, c1: 15, r1: 9 }, ['base', 'edit']);
  await vi.waitFor(() => expect(workspace.clipboardText).not.toBe(null));
  project.contrast = 40;
  await settle(project);
  await project.bake();
  await settle(project);
  const baked = workspace.clipboard;
  const paste = vi.spyOn(project, 'pasteSelection');
  workspace.selection = { c0: 0, r0: 0, c1: 0, r1: 0 };
  commandV(written[0].text, written[0].html);
  expect(paste.mock.calls[0][0]).toBe(baked);
});

test('a block from another tab pastes as it would in its own, into a base at another scale', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace);
  const { written } = fakeClipboard();
  const rect = { c0: 10, r0: 6, c1: 35, r1: 26 }; // typed cells, paint, soft paint and a pin
  copySelection(project, workspace, rect, ['base', 'edit']);
  await vi.waitFor(() => expect(written).toHaveLength(1));
  const { phosphor } = readClipboardHtml(written[0].html);
  const scale = project.baseLayer.scale;

  // Pasted into a new document at another grid size (so another base scale).
  const into = async (block) => {
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 50 });
    expect(project.baseLayer.scale).not.toBe(scale);
    project.pasteSelection(block, 2, 3);
    await settle(project);
    return cellsKey(project);
  };
  const own = await into(workspace.clipboard);
  expect(own.join()).toContain('#ff3300'); // the paint came too
  expect(await into(await decodeBlock(phosphor))).toEqual(own);
});

test('copy for other apps takes every shown layer', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: 20 });
  project.typeAt(0, 0, 'a', ATTRS);
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(1, 0, 'b', ATTRS);
  project.commitEdit();
  const { written } = fakeClipboard();
  copySelection(project, workspace, SOURCE, workspace.selectionIds);
  await vi.waitFor(() => expect(written).toHaveLength(1));
  const { phosphor } = readClipboardHtml(written[0].html);
  expect(phosphor.cells.slice(0, 2).map((entry) => entry.char)).toEqual(['a', 'b']);
  expect(workspace.clipboard.parts.map((part) => part.id)).toEqual(['edit', top]);
  project.setLayerHidden(top, true);
  copySelection(project, workspace, SOURCE, workspace.selectionIds);
  await vi.waitFor(() => expect(written).toHaveLength(2));
  expect(readClipboardHtml(written[1].html).phosphor.cells[1].char).not.toBe('b');
  expect(workspace.clipboard.parts.map((part) => part.id)).toEqual(['edit']);
});
