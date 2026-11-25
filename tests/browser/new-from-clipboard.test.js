// New from clipboard: a new drawing the size of what the system clipboard holds (read outside a paste event, with
// navigator.clipboard.read), with it in: a Select block or shapes copied in Phosphor, a Moebius block, text or a picture.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { copySelection, newFromClipboard } from '@/composables/clipboard';
import { copyShapes } from '@/composables/vectorClipboard.js';
import { clipboardHtml } from '@/lib/clipboardBlocks';
import { cellIndex, charRowsOf } from '@/lib/Cells';
import { rectShape, shapeBounds } from '@/document/shapes.js';
import { toastMessage, closeToast } from '@/composables/useToast';

afterEach(() => {
  vi.restoreAllMocks();
  closeToast();
});

const ATTRS = { fg: '#ffffff', bg: '#000000' };
// What a copy writes (through a copy event), kept: [{ text, html }].
function copies() {
  const written = [];
  vi.spyOn(document, 'execCommand').mockImplementation((command) => {
    if (command !== 'copy') return false;
    const clipboardData = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData, cancelable: true }));
    written.push({ text: clipboardData.getData('text/plain'), html: clipboardData.getData('text/html') });
    return true;
  });
  return written;
}
// The system clipboard holding these ({ 'text/html': string, 'image/png': Blob, … }), as navigator.clipboard.read gives it.
const holds = (parts) => vi.spyOn(navigator.clipboard, 'read').mockResolvedValue([{
  types: Object.keys(parts),
  getType: async (type) => (parts[type] instanceof Blob ? parts[type] : new Blob([parts[type]], { type })),
}]);
const refuses = () => vi.spyOn(navigator.clipboard, 'read').mockRejectedValue(new DOMException('no', 'NotAllowedError'));
const chars = (project, row) => Array.from({ length: project.cols }, (_, col) => project.cells[cellIndex(col, row, project.cols)].char).join('');
const size = (project) => [project.cols, charRowsOf(project.rows)];

// A drawing with 'ab' and 'cd' typed at its top left, saved (nothing to ask about).
async function drawing() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  workspace.editorTab = 'output';
  [['a', 0, 0], ['b', 1, 0], ['c', 0, 1], ['d', 1, 1]].forEach(([char, col, row]) => project.typeAt(col, row, char, ATTRS));
  project.commitEdit();
  await settle(project);
  project.markSaved();
  return { project, workspace };
}
// The same, with its top-left 3 × 2 cells copied: the html the copy wrote.
async function copied() {
  const app = await drawing(), written = copies();
  copySelection(app.project, app.workspace, { c0: 0, r0: 0, c1: 2, r1: 1 }, ['edit']);
  return { ...app, html: written.at(-1).html };
}

test('a selection copied in another tab opens as a drawing its size, with it on Layer 1', async () => {
  const { project, workspace, html } = await copied();
  workspace.clipboard = workspace.clipboardId = null; // not this tab's copy
  holds({ 'text/html': html, 'text/plain': 'ab\ncd' });
  expect(await newFromClipboard(project, workspace)).toBe(true);
  await settle(project);
  expect(size(project)).toEqual([3, 2]);
  expect([chars(project, 0).slice(0, 2), chars(project, 1).slice(0, 2)]).toEqual(['ab', 'cd']);
  expect(project.layers.map((layer) => layer.id)).toEqual(['base', 'edit']);
  expect(project.cellsOf('edit').size).toBe(4); // on Layer 1, as a paste lands
  expect(workspace.editorTab).toBe('output');
  expect(project.unsavedChanges).toBe(true); // it's nowhere but here
  project.undo(); // the paste is its one step
  await settle(project);
  expect(project.cellsOf('edit').size).toBe(0);
  expect(size(project)).toEqual([3, 2]);
});

test('this tab\'s own copy opens as it is now, also when the browser won\'t let the clipboard be read', async () => {
  for (const read of [holds, refuses]) {
    const { project, workspace, html } = await copied();
    read({ 'text/html': html });
    expect(await newFromClipboard(project, workspace)).toBe(true);
    await settle(project);
    expect(size(project)).toEqual([3, 2]);
    expect(chars(project, 0).slice(0, 2)).toBe('ab');
    vi.restoreAllMocks();
  }
});

test('a block copied in Moebius opens at its size', async () => {
  const { project, workspace } = await drawing();
  const html = clipboardHtml({ columns: 4, rows: 1, data: [...'Moeb'].map((char) => ({ code: char.charCodeAt(0), fg: 7, bg: 1 })) });
  holds({ 'text/html': `<meta charset="utf-8">${html}`, 'text/plain': 'Moeb' });
  expect(await newFromClipboard(project, workspace)).toBe(true);
  await settle(project);
  expect(size(project)).toEqual([4, 1]);
  expect(chars(project, 0)).toBe('Moeb');
});

test('text opens as a text file does: as wide as its widest line, a line a row', async () => {
  const { project, workspace } = await drawing();
  holds({ 'text/html': '<p>Hello</p><p>World!!</p>', 'text/plain': 'Hello\r\nWorld!!' }); // a web page's html isn't a block
  expect(await newFromClipboard(project, workspace)).toBe(true);
  await settle(project);
  expect(size(project)).toEqual([7, 2]);
  expect([chars(project, 0), chars(project, 1)]).toEqual(['Hello  ', 'World!!']);
  expect(workspace.editorTab).toBe('output');
});

test('a picture opens as an image does', async () => {
  const { project, workspace } = await drawing();
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 32 });
  canvas.getContext('2d').fillRect(0, 0, 64, 32);
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  holds({ 'image/png': png, 'text/html': '<img src="x.png">' });
  expect(await newFromClipboard(project, workspace)).toBe(true);
  await settle(project);
  expect([project.image.naturalWidth, project.image.naturalHeight]).toEqual([64, 32]);
  expect(project.layers.map((layer) => layer.id)).toEqual(['base']);
  expect(project.filename).toBe('clipboard');
});

test('shapes open on a canvas the size of their bounds, on whole cells, moved to its corner on a vector layer', async () => {
  const { project, workspace } = await drawing();
  const written = copies();
  workspace.vectorSelected = [project.addShape(rectShape(10, 11, 20, 23, { fill: '#ff0000' })), project.addShape(rectShape(14, 4, 17, 8, { fill: '#00ff00' }))];
  expect(copyShapes(project, workspace)).toBe(true);
  workspace.vectorClipboard = workspace.vectorClipboardKeys = workspace.vectorClipboardId = null; // another tab's
  project.markSaved();
  holds({ 'text/html': written.at(-1).html });
  expect(await newFromClipboard(project, workspace)).toBe(true);
  await settle(project);
  expect([project.cols, project.rows]).toEqual([10, 20]); // 10 to 20 across; 4 to 23 down, from the whole cell above to the one below
  const bounds = [...project.shapes.values()].map((shape) => shapeBounds(shape, project.pixelAspect));
  expect(bounds.map(({ x, y, w, h }) => [x, y, w, h])).toEqual([[0, 7, 10, 12], [4, 0, 3, 4]]);
  expect(project.layers.map((layer) => layer.kind)).toEqual(['cells', 'vector']);
  expect(workspace.editorTab).toBe('vector');
  expect(workspace.vectorSelected).toHaveLength(2);
});

test('with nothing a drawing can be made of, or a clipboard that can\'t be read and nothing copied here, it says so and the drawing stays', async () => {
  const { project, workspace } = await drawing();
  const stays = () => expect([size(project), chars(project, 0).slice(0, 2)]).toEqual([[20, 10], 'ab']);
  holds({ 'text/html': '<b> </b>', 'text/plain': '  \n' });
  expect(await newFromClipboard(project, workspace)).toBe(false);
  expect(toastMessage.value).toBe('The clipboard has nothing to open. Copy a selection or shapes in Phosphor, a block in Moebius, text or a picture first.');
  stays();
  refuses();
  expect(await newFromClipboard(project, workspace)).toBe(false);
  expect(toastMessage.value).toBe('Phosphor couldn\'t read the clipboard. Allow clipboard access for this page, or copy something in this tab first.');
  stays();
});

test('a block wider than a drawing can be says so', async () => {
  const { project, workspace } = await drawing();
  holds({ 'text/html': clipboardHtml({ phosphor: { version: 1, id: 'wide', w: 400, h: 1, cells: Array(400).fill(null) } }) });
  expect(await newFromClipboard(project, workspace)).toBe(false);
  expect(toastMessage.value).toBe('The clipboard holds 400 × 1 cells. A drawing has at most 300 columns, 5,000 lines and 500,000 cells.');
  expect(size(project)).toEqual([20, 10]);
});

test('unsaved work is asked about first, as New project asks, and nothing opens until the answer', async () => {
  const { project, workspace, html } = await copied();
  project.typeAt(5, 5, 'x', ATTRS);
  project.commitEdit();
  expect(project.unsavedChanges).toBe(true);
  holds({ 'text/html': html });
  const opening = newFromClipboard(project, workspace);
  await vi.waitFor(() => expect(workspace.unsavedAsk).toBeTruthy());
  expect(workspace.unsavedAsk.name).toBeNull(); // New project's question
  expect(size(project)).toEqual([20, 10]);
  workspace.unsavedAsk.go();
  expect(await opening).toBe(true);
  await settle(project);
  expect(size(project)).toEqual([3, 2]);
});
