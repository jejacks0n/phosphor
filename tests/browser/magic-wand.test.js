// The Magic Wand: a click selects what matches (cells by FG, BG and/or character in the ANSI view,
// pixels by color in the pixel view; colors within the Tolerance), connected or anywhere, Shift
// adding; Delete takes the edits in it away.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { cellIndex } from '@/lib/Cells';
import wand from '@/tools/wand';

const RED = { fg: '#ff0000', bg: '#000000' }, BLUE = { fg: '#0000ff', bg: '#000000' };

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  Object.assign(workspace, { editorTab: 'output', wandMatch: { fg: true, bg: true, char: true }, wandContiguous: true, wandTolerance: 0 });
  // Rows of text at (col, row), in colors by letter: lower case red, upper case blue.
  const type = (col, row, lines) => {
    lines.forEach((line, r) => [...line].forEach((ch, c) => project.typeAt(col + c, row + r, ch, ch === ch.toLowerCase() ? RED : BLUE)));
    project.commitEdit();
  };
  const click = (col, row, event = {}, view = 'output') => wand.begin({ project, workspace, view }, view === 'output' ? { x: col + 0.5, y: 2 * row + 1 } : { x: col + 0.5, y: row + 0.5 }, event);
  // The wand's mask over a rect of units, as rows of # and .
  const marks = (c0, r0, c1, r1) => Array.from({ length: r1 - r0 + 1 }, (_, r) =>
    Array.from({ length: c1 - c0 + 1 }, (_, c) => (workspace.wand.mask[(r0 + r) * workspace.wand.width + c0 + c] ? '#' : '.')).join(''));
  const read = (c0, r0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, c) => project.cells[cellIndex(c0 + c, r0, project.cols)].char).join('');
  return { project, workspace, type, click, marks, read };
}

test('a click selects the matching cells it touches; Match chooses what must match; not Contiguous, every match', async () => {
  const { workspace, type, click, marks } = await scene();
  type(2, 2, ['aaB', 'a.a', 'aBa']);
  click(2, 2);
  expect(marks(2, 2, 4, 4)).toEqual(['##.', '#..', '#..']);
  workspace.wandMatch = { fg: true, bg: false, char: false }; // red, whatever the character
  click(2, 2);
  expect(marks(2, 2, 4, 4)).toEqual(['##.', '###', '#.#']); // the . is red too
  workspace.wandMatch = { fg: false, bg: false, char: true };
  workspace.wandContiguous = false;
  click(4, 2); // B
  expect(marks(2, 2, 4, 4)).toEqual(['..#', '...', '.#.']);
});

test('Shift-click adds; a Select rectangle keeps the wand inside it', async () => {
  const { workspace, type, click, marks } = await scene();
  type(2, 2, ['aBa', 'aBa']);
  click(2, 2);
  click(4, 2, { shiftKey: true });
  expect(marks(2, 2, 4, 3)).toEqual(['#.#', '#.#']);
  workspace.selection = { c0: 3, r0: 2, c1: 4, r1: 3 };
  workspace.wandContiguous = false;
  click(4, 3);
  expect(workspace.selection).toBe(null); // the wand's selection takes its place
  expect(marks(2, 2, 4, 3)).toEqual(['..#', '..#']);
  click(2, 2, { shiftKey: true }); // Shift-click still keeps to the rectangle it started in
  expect(marks(2, 2, 4, 3)).toEqual(['..#', '..#']);
});

test('Delete takes the edits in the selection away, in one undo step', async () => {
  const { project, workspace, type, click, read } = await scene();
  type(2, 2, ['aBa']);
  workspace.wandMatch = { fg: true, bg: false, char: false };
  workspace.wandContiguous = false;
  const under = read(5, 2, 7); // the picture's own characters, after the typed ones
  click(2, 2); // the red a's
  const version = project.history.version;
  project.deleteInWand(workspace.wand);
  await settle(project);
  expect(read(3, 2, 3)).toBe('B');
  expect(read(2, 2, 2)).not.toBe('a');
  expect(read(5, 2, 7)).toBe(under);
  expect(project.history.version).toBe(version + 1);
  project.undo(); await settle(project);
  expect(read(2, 2, 4)).toBe('aBa');
});

test('Tolerance: colors that close match, at 0 only the same one', async () => {
  const { project, workspace, click, marks } = await scene();
  project.typeAt(2, 2, 'a', { fg: '#ff0000', bg: '#000000' });
  project.typeAt(5, 2, 'a', { fg: '#f00000', bg: '#000000' });
  project.commitEdit();
  Object.assign(workspace, { wandMatch: { fg: true, bg: false, char: false }, wandContiguous: false });
  click(2, 2);
  expect(marks(2, 2, 5, 2)).toEqual(['#...']);
  workspace.wandTolerance = 10;
  click(2, 2);
  expect(marks(2, 2, 5, 2)).toEqual(['#..#']);
});

test('the pixel view selects pixels by color, within the Tolerance', async () => {
  const { project, workspace, click } = await scene();
  workspace.editorTab = 'input';
  project.paintStroke([{ x: 3, y: 3, alpha: 1 }, { x: 4, y: 3, alpha: 1 }, { x: 9, y: 9, alpha: 1 }], '#ff00ff');
  project.paintStroke([{ x: 12, y: 12, alpha: 1 }], '#fa00fa');
  project.commitEdit();
  await settle(project);
  workspace.wandContiguous = false;
  click(3, 3, {}, 'input');
  expect(workspace.wand.view).toBe('input');
  const selected = () => [...workspace.wand.mask].filter(Boolean).length;
  expect(selected()).toBe(3);
  workspace.wandTolerance = 10;
  click(3, 3, {}, 'input');
  expect(selected()).toBe(4);
});

test('the wand selection stays as you choose another tool', async () => {
  const { workspace, type, click } = await scene();
  type(2, 2, ['a']);
  workspace.outputActiveTool = 'select';
  workspace.selection = { c0: 1, r0: 1, c1: 3, r1: 3 };
  workspace.setActiveTool('wand');
  expect(workspace.selection).toEqual({ c0: 1, r0: 1, c1: 3, r1: 3 });
  click(2, 2);
  expect(workspace.wand).not.toBe(null);
  workspace.setActiveTool('pencil');
  expect(workspace.wand).not.toBe(null);
});

let app = null;
afterEach(() => { app?.unmount(); app = null; });

test('Delete or Backspace deletes in the wand selection, but Backspace in Edit Mode types', async () => {
  const { project, workspace, type, click, read } = await scene();
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  type(2, 2, ['aBa']);
  workspace.wandContiguous = false;
  click(2, 2);
  workspace.outputActiveTool = 'text';
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }));
  await settle(project);
  expect(workspace.wand).not.toBe(null);
  expect(read(2, 2, 4)).toBe('aBa');
  workspace.outputActiveTool = 'wand';
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
  await settle(project);
  expect(read(3, 2, 3)).toBe('B');
  expect(read(2, 2, 2)).not.toBe('a');
});

test('a wand click outside the rectangle keeps the rectangle and selects nothing', async () => {
  const { workspace, type, click } = await scene();
  type(2, 2, ['aBa']);
  workspace.selection = { c0: 0, r0: 0, c1: 3, r1: 3 };
  click(12, 3);
  expect(workspace.selection).toEqual({ c0: 0, r0: 0, c1: 3, r1: 3 });
  expect(workspace.wand).toBe(null);
});

test('Delete and Backspace leave the wand selection alone with the palette layer open or mid-stroke', async () => {
  const { project, workspace, type, click, read } = await scene();
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  type(2, 2, ['aBa']);
  workspace.wandContiguous = false;
  click(2, 2);
  workspace.outputActiveTool = 'pencil';
  workspace.paletteLayerOpen = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }));
  workspace.paletteLayerOpen = false;
  workspace.isPainting = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
  workspace.isPainting = false;
  await settle(project);
  expect(read(2, 2, 4)).toBe('aBa');
});

test("Delete in the pixel view takes away a Half-block's ▄ with its paint, as the Eraser does", async () => {
  const { project, workspace, click } = await scene();
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }, { x: 6, y: 7, alpha: 1 }], '#ff00ff', { blockChars: true });
  project.commitEdit();
  await settle(project);
  expect(project.editCellAt(6, 3)?.char).toBe('▄');
  workspace.editorTab = 'input';
  workspace.wandContiguous = false;
  click(6, 6, {}, 'input');
  project.deleteInWand(workspace.wand);
  await settle(project);
  expect(project.cellHasPaint(6, 3)).toBe(false);
  expect(project.editCellAt(6, 3)).toBe(undefined);
});

test('in the pixel view a Select rectangle keeps the wand inside it too', async () => {
  const { project, workspace, click } = await scene();
  workspace.editorTab = 'input';
  project.paintStroke([{ x: 3, y: 3, alpha: 1 }, { x: 9, y: 9, alpha: 1 }], '#ff00ff');
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, { wandContiguous: false, selection: { c0: 0, r0: 0, c1: 5, r1: 2 } }); // cells: grid pixels 0-5 across, 0-5 down
  click(3, 3, {}, 'input');
  expect(workspace.selection).toBe(null);
  expect([workspace.wand.mask[3 * 20 + 3], workspace.wand.mask[9 * 20 + 9]]).toEqual([1, 0]);
});

test('a selection made in the ANSI view works in the pixel view: Delete takes both pixels of its cells; Shift-click adds pixels', async () => {
  const { project, workspace, type, click } = await scene();
  type(2, 2, ['a']);
  click(2, 2); // the cell: grid pixels (2, 4) and (2, 5)
  project.paintStroke([{ x: 2, y: 4, alpha: 1 }, { x: 2, y: 5, alpha: 1 }, { x: 3, y: 4, alpha: 1 }], '#ff00ff');
  project.commitEdit();
  await settle(project);
  workspace.editorTab = 'input';
  project.deleteInWand(workspace.wand, 'input');
  await settle(project);
  expect([project.rawColorAt(2, 4), project.rawColorAt(2, 5), project.rawColorAt(3, 4)].map((c) => c === '#ff00ff')).toEqual([false, false, true]);

  click(3, 4, { shiftKey: true }, 'input');
  const at = (x, y) => workspace.wand.mask[y * workspace.wand.width + x];
  expect(workspace.wand.view).toBe('input');
  expect([at(2, 4), at(2, 5), at(3, 4), at(3, 5)]).toEqual([1, 1, 1, 0]);
});

test('Delete takes away what is on the layers lit: Edit the drawing, Base the picture (black), in either view', async () => {
  const { project, workspace, type, click } = await scene();
  type(2, 2, ['a']);
  const base = [project.baseColorAt(2, 4), project.baseColorAt(2, 5)];
  click(2, 2);
  project.deleteInWand(workspace.wand, 'output', { base: false, edit: true });
  expect(project.editCellAt(2, 2)).toBe(undefined);
  expect([project.baseColorAt(2, 4), project.baseColorAt(2, 5)]).toEqual(base);
  project.undo();
  project.deleteInWand(workspace.wand, 'output', { base: true, edit: false });
  expect(project.editCellAt(2, 2)?.char).toBe('a');
  expect([project.baseColorAt(2, 4), project.baseColorAt(2, 5)]).toEqual(['#000000', '#000000']);

  workspace.editorTab = 'input';
  click(9, 9, {}, 'input');
  const at = (x, y) => workspace.wand.mask[y * workspace.wand.width + x];
  const out = [[9, 8], [9, 10], [8, 9], [10, 9]].find(([x, y]) => !at(x, y)); // a pixel beside it the wand left out
  const kept = project.baseColorAt(...out);
  project.deleteInWand(workspace.wand, 'input', { base: true, edit: false });
  expect(project.baseColorAt(9, 9)).toBe('#000000');
  expect(project.baseColorAt(...out)).toBe(kept);
});
