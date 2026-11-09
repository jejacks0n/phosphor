// The Select tool: floating moves and pastes, around typing, undo and wide characters.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import { rectShape } from '@/document/shapes.js';

const COLS = 30, ATTRS = { fg: '#ffffff', bg: '#000000' };
const LAYERS = ['base', 'edit'];

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
  const block = project.copySelection({ c0: 10, r0: 3, c1: 10, r1: 3 }, ['edit']);
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
  project.floatSelection({ c0: 4, r0: 3, c1: 5, r1: 3 }, ['edit'], 1, 0);
  project.render(); await settle(project);
  expect(cell(project, 5, 3).char).toBe('漢');
  expect(cell(project, 4, 3).char).toBe(before); // the converter's own character, not a space
});

test('stamp leaves a copy and floats the block on; undo takes back only the last move, and the selection goes back to the copy', async () => {
  const { project, workspace } = await scene();
  const EDIT = ['edit'];
  project.typeAt(5, 5, 'A', ATTRS);
  project.commitEdit();
  workspace.selectAll({ c0: 5, r0: 5, c1: 5, r1: 5 });
  workspace.selection = project.stampSelection(workspace.selection, EDIT);
  workspace.selection = project.floatSelection(workspace.selection, EDIT, 3, 0);
  workspace.selection = project.stampSelection(workspace.selection, EDIT);
  workspace.selection = project.floatSelection(workspace.selection, EDIT, 2, 0);
  expect([5, 8, 10].map((c) => cell(project, c, 5).char).join('')).toBe('AAA');
  project.undo();
  await settle(project);
  expect([5, 8].map((c) => cell(project, c, 5).char).join('')).toBe('AA');
  expect(cell(project, 10, 5).char).not.toBe('A');
  expect(workspace.selection).toEqual({ c0: 8, r0: 5, c1: 8, r1: 5 });
});

test('Delete on a moved block takes away the block, not what it covered; one undo brings the block back where it started', async () => {
  const { project, workspace } = await scene();
  for (const [c, ch] of [[5, 'A'], [6, 'B'], [7, 'C']]) project.typeAt(c, 5, ch, ATTRS);
  project.commitEdit();
  const under = [5, 6, 7].map((c) => cell(project, c, 7).char).join('');
  workspace.selectAll({ c0: 5, r0: 5, c1: 7, r1: 5 });
  workspace.selection = project.floatSelection(workspace.selection, LAYERS, 0, 2);
  project.deleteSelection(workspace.selection, LAYERS);
  project.render(); await settle(project);
  expect([5, 6, 7].map((c) => cell(project, c, 7).char).join('')).toBe(under);
  expect([5, 6, 7].map((c) => cell(project, c, 5).char).join('')).not.toContain('A');
  expect(workspace.selection).toBe(null);
  project.undo(); await settle(project);
  expect([5, 6, 7].map((c) => cell(project, c, 5).char).join('')).toBe('ABC');
  expect([5, 6, 7].map((c) => cell(project, c, 7).char).join('')).toBe(under);
});

test('Delete on a stamped block that moved on leaves the stamped copy', async () => {
  const { project, workspace } = await scene();
  const EDIT = ['edit'];
  project.typeAt(5, 5, 'A', ATTRS);
  project.commitEdit();
  workspace.selectAll({ c0: 5, r0: 5, c1: 5, r1: 5 });
  workspace.selection = project.stampSelection(workspace.selection, EDIT);
  workspace.selection = project.floatSelection(workspace.selection, EDIT, 3, 0);
  const under = cell(project, 8, 5).char === 'A';
  expect(under).toBe(true);
  project.deleteSelection(workspace.selection, EDIT);
  project.render(); await settle(project);
  expect(cell(project, 5, 5).char).toBe('A');
  expect(cell(project, 8, 5).char).not.toBe('A');
});

// A block's empty cells (no edit cell, no paint) are see-through: what's on the edit layer where it lands shows
// through them, as it moves and once it's set down.
const EDIT = ['edit'];
const seen = (project, col, row) => JSON.stringify(cell(project, col, row));

test("a moved block's empty cells don't cover the edit cells it passes over, and they come back after it", async () => {
  const { project } = await scene();
  for (const [c, ch] of [[5, 'A'], [7, 'C'], [11, 'Z']]) project.typeAt(c, 5, ch, ATTRS);
  project.commitEdit();
  project.render(); await settle(project);
  const before = cellsKey(project);
  const rect = project.floatSelection({ c0: 5, r0: 5, c1: 7, r1: 5 }, EDIT, 5, 0); // A _ C over 10..12: Z in the gap
  project.render(); await settle(project);
  expect([10, 11, 12].map((c) => cell(project, c, 5).char).join('')).toBe('AZC');
  const on = project.floatSelection(rect, EDIT, 1, 0); // A covers Z
  project.render(); await settle(project);
  expect(cell(project, 11, 5).char).toBe('A');
  project.floatSelection(on, EDIT, 3, 0); // moved on: Z as it was
  project.render(); await settle(project);
  expect(cell(project, 11, 5).char).toBe('Z');
  project.undo(); await settle(project); // the whole move
  expect(cellsKey(project)).toEqual(before);
});

test("a moved block's empty cells show the paint under them, and a cell with paint still covers", async () => {
  const { project } = await scene();
  project.typeAt(5, 5, 'A', ATTRS);
  project.paintEditPixels([{ x: 7, y: 10, r: 255, g: 0, b: 0, alpha: 1 }]); // the top half of cell 7,5
  project.commitEdit();
  for (const [c, ch] of [[11, 'Y'], [12, 'Z']]) project.typeAt(c, 5, ch, ATTRS);
  project.paintEditPixels([{ x: 11, y: 11, r: 0, g: 0, b: 255, alpha: 1 }]); // under the gap's landing
  project.commitEdit();
  project.render(); await settle(project);
  const gapUnder = seen(project, 11, 5);
  project.floatSelection({ c0: 5, r0: 5, c1: 7, r1: 5 }, EDIT, 5, 0); // A _ (red) over 10..12
  project.render(); await settle(project);
  expect(seen(project, 11, 5)).toBe(gapUnder);
  expect(cell(project, 12, 5).char).not.toBe('Z'); // the painted cell replaces Z
  project.commitPending();
  project.changeSelection((workspace) => { workspace.selection = null; }); // set down
  project.render(); await settle(project);
  expect(seen(project, 11, 5)).toBe(gapUnder);
});

test("a pasted block's empty cells don't cover what's under them", async () => {
  const { project } = await scene();
  for (const [c, ch] of [[1, 'A'], [3, 'C'], [21, 'Z']]) project.typeAt(c, 1, ch, ATTRS);
  project.commitEdit();
  const block = project.copySelection({ c0: 1, r0: 1, c1: 3, r1: 1 }, EDIT);
  project.pasteSelection(block, 20, 1);
  project.render(); await settle(project);
  expect([20, 21, 22].map((c) => cell(project, c, 1).char).join('')).toBe('AZC');
});

// Shift+arrows select, as in a text editor.
test('in Edit Mode, Shift+arrows select from the cursor with the Select tool, and grow or shrink from where they started', async () => {
  const { project, workspace } = await editor();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 5, row: 5 };
  key('ArrowRight', { shiftKey: true });
  expect(workspace.activeTool).toBe('select');
  expect(workspace.selection).toEqual({ c0: 5, r0: 5, c1: 6, r1: 5 });
  key('ArrowRight', { shiftKey: true });
  key('ArrowDown', { shiftKey: true });
  expect(workspace.selection).toEqual({ c0: 5, r0: 5, c1: 7, r1: 6 });
  for (let i = 0; i < 3; i++) key('ArrowLeft', { shiftKey: true }); // back past where it started
  expect(workspace.selection).toEqual({ c0: 4, r0: 5, c1: 5, r1: 6 });
  project.undo();
  expect(workspace.selection).toEqual({ c0: 5, r0: 5, c1: 5, r1: 6 }); // one press at a time
});

test('with the Select tool, Shift+arrows grow or shrink the selection from its top-left, and stop at the edge', async () => {
  const { workspace } = await editor();
  workspace.selectAll({ c0: 27, r0: 2, c1: 28, r1: 3 });
  key('ArrowRight', { shiftKey: true });
  key('ArrowRight', { shiftKey: true }); // the grid ends at column 29
  key('ArrowUp', { shiftKey: true });
  expect(workspace.selection).toEqual({ c0: 27, r0: 2, c1: 29, r1: 2 });
});

// Edit Mode's cursor: choosing Edit Mode puts it back where it last was, or at the top-left.
test('choosing Edit Mode with no cursor yet puts it at the top-left', async () => {
  const { workspace } = await editor();
  workspace.setActiveTool('text');
  expect(workspace.textCursor).toEqual({ col: 0, row: 0 });
});

test('after Escape puts the cursor away, T brings it back where it was, kept on the grid', async () => {
  const { project, workspace } = await editor();
  workspace.setActiveTool('text');
  workspace.textCursor = { col: 25, row: 7 };
  key('Escape');
  expect(workspace.textCursor).toBe(null);
  key('t');
  expect(workspace.activeTool).toBe('text');
  expect(workspace.textCursor).toEqual({ col: 25, row: 7 });
  key('Escape');
  project.updateCols(20); project.render(); await settle(project); // the grid narrows while it's away
  key('k');
  expect(workspace.textCursor).toEqual({ col: 19, row: 7 });
});

test('Escape or Enter on a selection made from Edit Mode sets it down and goes back to Edit Mode, at the cursor', async () => {
  const { workspace } = await editor();
  for (const done of ['Escape', 'Enter']) {
    workspace.setActiveTool('text');
    workspace.textCursor = { col: 5, row: 5 };
    key('ArrowRight', { shiftKey: true });
    expect(workspace.activeTool).toBe('select');
    key(done);
    expect(workspace.selection, done).toBe(null);
    expect(workspace.activeTool, done).toBe('text');
    expect(workspace.textCursor, done).toEqual({ col: 5, row: 5 });
  }
});

test('Escape on a selection made with the Select tool only clears it', async () => {
  const { workspace } = await editor();
  workspace.setActiveTool('select');
  workspace.selectAll({ c0: 1, r0: 1, c1: 3, r1: 3 });
  key('Escape');
  expect(workspace.selection).toBe(null);
  expect(workspace.activeTool).toBe('select');
});

test('choosing Edit Mode clears the selection and the Magic Wand, an undo step', async () => {
  const { project, workspace } = await editor();
  workspace.setActiveTool('select');
  workspace.selectAll({ c0: 1, r0: 1, c1: 3, r1: 3 });
  key('t');
  expect(workspace.activeTool).toBe('text');
  expect(workspace.selection).toBe(null);
  project.undo();
  expect(workspace.selection).toEqual({ c0: 1, r0: 1, c1: 3, r1: 3 });
});

// Every shown cells layer is in a selection; the shapes are in Copy as the cells they show, and stay whole otherwise.
async function stack({ shape = rectShape(4, 2, 7, 7, { fill: '#00ff00' }) } = {}) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 30, rows: 20 }); // 30 x 10 cells
  await settle(project);
  project.beginEdit();
  project.writeBaseCells([{ col: 1, row: 1, char: 'P', fg: '#ff0000', bg: '#0000aa' }]);
  project.commitEdit();
  project.typeAt(2, 1, 'E', ATTRS);
  project.typeAt(3, 2, 'e', { fg: '#ffff00' }); // only FG: over what shows
  project.commitEdit();
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  project.addShape(shape);
  project.commitEdit();
  const top = project.addLayer('cells', vector);
  workspace.editorTab = 'output';
  workspace.pickLayer(top);
  await settle(project);
  return { project, workspace, vector, top, rect: { c0: 1, r0: 1, c1: 8, r1: 4 } };
}
const looks = (project, { c0, r0, c1, r1 }, dc = 0) => {
  const out = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const { char, fg, bg } = cell(project, c + dc, r);
    out.push(`${char}${fg.hex}${bg.hex}`);
  }
  return out;
};

test('Copy takes what shapes show; paste onto Layer 2 shows it', async () => {
  const { project, workspace, top, rect } = await stack();
  const shown = looks(project, rect);
  const block = project.copySelection(rect, workspace.selectionIds);
  expect(block.parts.map((part) => part.id)).toEqual(['edit', top]);
  expect(block.base.pins).toContain('P');
  expect(block.shown.some(Boolean)).toBe(true);
  project.pasteSelection(block, rect.c0 + 15, rect.r0);
  project.render(); await settle(project);
  expect(project.cellsOf(top).size).toBeGreaterThan(0); // on the layer picked
  expect(looks(project, rect, 15)).toEqual(shown);
});

for (const [name, sliders] of [
  ['Invert on', { invert: 100 }], ['Brightness moved', { brightness: 60 }],
  ['Color ASCII', { renderStyle: 'colorAscii' }], ['Color ASCII and Invert', { renderStyle: 'colorAscii', invert: 100 }], ['ASCII', { renderStyle: 'ascii' }],
  ['the CGA palette', { quantize: 'cga' }], ['the VGA palette', { quantize: 'vga' }], ['the VGA palette and Brightness', { quantize: 'vga', brightness: 60 }],
]) {
  test(`Copy of what shapes show pastes as it showed, with ${name}`, async () => {
    // a color no palette has, its top row covering only the bottom half of its first cells
    const { project, workspace, top, rect } = await stack({ shape: rectShape(4, 3, 7, 7, { fill: '#33aa77', opacity: 0.6 }) });
    project.$patch(sliders);
    project.render(); await settle(project);
    const shown = looks(project, rect);
    project.pasteSelection(project.copySelection(rect, workspace.selectionIds), rect.c0 + 15, rect.r0);
    project.render(); await settle(project);
    expect(project.cellsOf(top).size).toBeGreaterThan(0);
    expect(looks(project, rect, 15)).toEqual(shown);
  });
}

test('a copied block of what shapes show keeps its look through Bake', async () => {
  const { project, workspace, rect } = await stack();
  project.$patch({ invert: 100 });
  project.render(); await settle(project);
  const shown = looks(project, rect);
  workspace.clipboard = project.copySelection(rect, workspace.selectionIds);
  await project.bake();
  project.render(); await settle(project);
  expect(project.invert).toBe(0);
  project.pasteSelection(workspace.clipboard, rect.c0 + 15, rect.r0);
  project.render(); await settle(project);
  expect(looks(project, rect, 15)).toEqual(shown);
});

test('Cut leaves the shape whole', async () => {
  const { project, workspace, top, rect } = await stack();
  project.typeAt(5, 2, 'T', ATTRS);
  project.commitEdit();
  app = createApp({ setup() { useKeyboardShortcuts(project, workspace); return () => null; } });
  app.mount(document.createElement('div'));
  workspace.selectAll(rect);
  const shapes = project.shapes;
  key('x', { metaKey: true }); // Cut: the copy, then the cells gone from every shown layer
  expect(workspace.clipboard.shown.some(Boolean)).toBe(true);
  expect(project.shapes).toBe(shapes);
  expect(project.cellsOf('edit').size).toBe(0);
  expect(project.cellsOf(top).size).toBe(0);
  expect(project.baseRecords.pins.get('1,1')).toBe(' ');
});

test('a hidden layer is left out of Copy, Cut and moves', async () => {
  const { project, workspace, top, rect } = await stack();
  project.typeAt(5, 2, 'T', ATTRS);
  project.commitEdit();
  project.setLayerHidden('edit', true);
  expect(workspace.selectionIds).toEqual(['base', top]);
  const block = project.copySelection(rect, workspace.selectionIds);
  expect(block.parts.map((part) => part.id)).toEqual([top]);
  project.moveSelection(rect, workspace.selectionIds, 0, 4);
  expect([...project.cellsOf('edit').keys()].sort()).toEqual(['2,1', '3,2']); // left where it was
  expect([...project.cellsOf(top).keys()]).toEqual(['5,6']);
  project.deleteSelection({ ...rect, r0: 5, r1: 8 }, workspace.selectionIds);
  expect(project.cellsOf(top).size).toBe(0);
  expect([...project.cellsOf('edit').keys()].sort()).toEqual(['2,1', '3,2']);
});
