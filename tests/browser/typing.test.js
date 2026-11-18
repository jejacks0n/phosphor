// Typing at the Text tool's cursor (useTextTool's typeAtCursor and typeText): what fits on the grid,
// and how runs of typing and pastes become undo steps.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { typeText, typeAtCursor } from '@/composables/useTextTool';
import text from '@/tools/text';
import { cellIndex } from '@/lib/Cells';

const COLS = 20, ROWS = 20; // 10 character rows

async function blank() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS });
  workspace.editFgColor = '#ffffff';
  workspace.editBgColor = '#000000';
  return { project, workspace };
}

// Row r's edit cells as characters, '.' where there's none.
const edited = (project, r) => Array.from({ length: COLS }, (_, c) => project.editCellAt(c, r)?.char ?? '.').join('');

// Row r as characters, with a wide character's trail shown as '>'.
const line = (project, r) => Array.from({ length: COLS }, (_, c) => {
  const cell = project.cells[cellIndex(c, r, COLS)];
  return cell.wide === 'trail' ? '>' : cell.char;
}).join('');

const typeAll = (project, workspace, chars) => { for (const ch of chars) typeAtCursor(project, workspace, ch); };

test('a paste drops the lines that have no row left, instead of piling them onto the last row', async () => {
  const { project, workspace } = await blank();
  const last = ROWS / 2 - 1;
  workspace.textCursor = { col: 0, row: last - 1 };
  typeText(project, workspace, 'AAAA\nBBBB\nCC');
  expect(edited(project, last - 1).slice(0, 4)).toBe('AAAA');
  expect(edited(project, last).slice(0, 4)).toBe('BBBB');
});

test('a paste is its own undo step, even right after typing', async () => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 0, row: 0 };
  typeAll(project, workspace, 'ab');
  typeText(project, workspace, 'XYZ'); // within the typing pause
  typeAll(project, workspace, 'c');
  project.undo();
  expect(edited(project, 0).slice(0, 6)).toBe('abXYZ.');
  project.undo();
  expect(edited(project, 0).slice(0, 6)).toBe('ab....');
});

test('a click elsewhere with the Text tool ends the run of typing (two undo steps)', async () => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 0, row: 0 };
  typeAll(project, workspace, 'ab');
  text.begin({ project, workspace }, { x: 0, y: 6 }); // the cell at column 0, row 3
  text.end();
  expect(workspace.textCursor).toEqual({ col: 0, row: 3 });
  typeAll(project, workspace, 'cd');
  project.undo();
  expect(edited(project, 0).slice(0, 2)).toBe('ab');
  expect(edited(project, 3).slice(0, 2)).toBe('..');
});

test('insert mode: typing at the cursor before a wide character pushes it whole', async () => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 0, row: 0 };
  typeText(project, workspace, 'a漢b');
  workspace.typingMode = 'insert';
  workspace.textCursor = { col: 1, row: 0 };
  typeAtCursor(project, workspace, 'x');
  expect(line(project, 0).slice(0, 5)).toBe('ax漢>b');
});

// The three typing modes (workspace.typingMode, docs/characters.md): Overwrite replaces the cell; Insert pushes the
// row's characters and its paint along; Partial pushes the characters and leaves the paint where it is (docs/model.md R1).
const RED_PAINT = { r: 255, g: 0, b: 0, a: 1 };
const paintedCols = (project, r) => Array.from({ length: COLS }, (_, c) => c).filter((c) => project.paintLayer.pixelAt(c, 2 * r));

test.each([['insert', [6, 5, 4]], ['partial', [5, 5, 5]]])('%s mode: typing, Backspace and Delete move the characters after the cursor, and the paint goes to %j', async (mode, [typed, backspaced, deleted]) => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 2, row: 0 };
  typeAll(project, workspace, 'ab');
  project.paintEditPixels([{ x: 5, y: 0, r: 255, g: 0, b: 0, alpha: 1 }, { x: 5, y: 1, r: 255, g: 0, b: 0, alpha: 1 }]);
  project.commitEdit();
  expect(project.typeAt(2, 0, 'x', { fg: '#ffffff' }, { mode })).toBe(true);
  project.commitEdit();
  expect(edited(project, 0).slice(0, 7)).toBe('..xab..');
  expect(paintedCols(project, 0)).toEqual([typed]);
  expect(project.paintLayer.pixelAt(typed, 1)).toMatchObject(RED_PAINT);
  expect(project.backspaceAt(3, 0, { fg: '#ffffff' }, { mode })).toBe(1);
  project.commitEdit();
  expect(edited(project, 0).slice(0, 7)).toBe('..ab...');
  expect(paintedCols(project, 0)).toEqual([backspaced]);
  project.deleteAt(2, 0, { mode });
  project.commitEdit();
  expect(edited(project, 0).slice(0, 7)).toBe('..b....');
  expect(paintedCols(project, 0)).toEqual([deleted]);
  project.undo(); // the Delete
  project.undo(); // the Backspace
  project.undo(); // the typed x: the row and its paint as they were
  expect(edited(project, 0).slice(0, 7)).toBe('..ab...');
  expect(paintedCols(project, 0)).toEqual([5]);
});

test('insert mode moves a paint block and a frozen cell with their paint, and pushes the last cell off the row', async () => {
  const { project } = await blank();
  project.paintEditPixels([4, COLS - 1].flatMap((x) => [{ x, y: 0, r: 255, g: 0, b: 0, alpha: 1 }, { x, y: 1, r: 255, g: 0, b: 0, alpha: 1 }]));
  project.writeEditCells([{ col: 4, row: 0, attrs: { char: '▄' } }]);
  project.commitEdit();
  project.setEditCells(new Map([...project.editCells, [`${COLS - 2},0`, Object.freeze({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true })]]), [`${COLS - 2},0`]);
  project.commitEdit();
  project.typeAt(1, 0, 'x', { fg: '#ffffff' }, { mode: 'insert' });
  project.commitEdit();
  expect(project.editCellAt(5, 0)).toEqual({ char: '▄' }); // the block, over its paint
  expect(project.editCellAt(4, 0)).toBeUndefined();
  expect(project.editCellAt(COLS - 1, 0)).toEqual({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true });
  expect(paintedCols(project, 0)).toEqual([5]); // the last column's paint went off the row
});

test('overwrite mode: typing replaces the cell and moves nothing; Delete pulls the characters, not the paint', async () => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 2, row: 0 };
  typeAll(project, workspace, 'ab');
  project.paintEditPixels([{ x: 5, y: 0, r: 255, g: 0, b: 0, alpha: 1 }]);
  project.commitEdit();
  project.typeAt(2, 0, 'x', { fg: '#ffffff' });
  project.commitEdit();
  expect(edited(project, 0).slice(0, 5)).toBe('..xb.');
  project.deleteAt(2, 0);
  project.commitEdit();
  expect(edited(project, 0).slice(0, 5)).toBe('..b..');
  expect(paintedCols(project, 0)).toEqual([5]);
});

test('the Insert key goes from Overwrite to Insert to Partial and back', async () => {
  const { workspace } = await blank();
  const seen = [workspace.typingMode];
  for (let k = 0; k < 3; k++) { workspace.cycleTypingMode(); seen.push(workspace.typingMode); }
  expect(seen).toEqual(['overwrite', 'insert', 'partial', 'overwrite']);
});

// A space has no ink: typing one sets the cell's background and leaves the foreground it had (docs/characters.md).
test('a typed space, and the space Backspace leaves, take the background and no foreground', async () => {
  const { project } = await blank();
  const ATTRS = { fg: '#ff0000', bg: '#0000ff', fgIndex: 9, bgIndex: 12 };
  project.typeAt(2, 0, ' ', ATTRS);
  project.typeAt(3, 0, '\u00a0', ATTRS); // a no-break space is as empty
  project.typeAt(5, 0, 'A', { fg: '#00ff00' });
  project.typeAt(5, 0, ' ', ATTRS); // over a letter: its foreground stays, unseen
  project.typeAt(8, 0, 'B', ATTRS);
  expect(project.backspaceAt(9, 0, ATTRS)).toBe(1);
  project.commitEdit();
  expect(project.editCellAt(2, 0)).toEqual({ char: ' ', bg: '#0000ff', bgIndex: 12 });
  expect(project.editCellAt(3, 0)).toEqual({ char: '\u00a0', bg: '#0000ff', bgIndex: 12 });
  expect(project.editCellAt(5, 0)).toEqual({ char: ' ', fg: '#00ff00', bg: '#0000ff', bgIndex: 12 });
  expect(project.editCellAt(8, 0)).toEqual({ char: ' ', fg: '#ff0000', bg: '#0000ff', fgIndex: 9, bgIndex: 12 }); // B's own, kept
});

test('Delete in overwrite mode removes a cell typed in the same run', async () => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 0, row: 0 };
  typeAll(project, workspace, 'abc');
  project.deleteAt(1, 0);
  expect(edited(project, 0).slice(0, 3)).toBe('ac.');
});

test('a grid resize right after typing leaves the typing undoable', async () => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 0, row: 0 };
  typeAll(project, workspace, 'abc');
  project.cols = COLS + 4; // within the typing pause
  project.render();
  await new Promise((r) => setTimeout(r, 50));
  project.ensureLayer();
  project.undo();
  expect(project.editCellAt(0, 0)).toBeUndefined();
});

test('undo puts the cursor back where the undone typing started', async () => {
  const { project, workspace } = await blank();
  workspace.textCursor = { col: 2, row: 1 };
  typeAll(project, workspace, 'Hello');
  expect(workspace.textCursor).toEqual({ col: 7, row: 1 });
  project.undo();
  expect(edited(project, 1).slice(2, 7)).toBe('.....');
  expect(workspace.textCursor).toEqual({ col: 2, row: 1 });
});
