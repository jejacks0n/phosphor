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
  workspace.insertMode = true;
  workspace.textCursor = { col: 1, row: 0 };
  typeAtCursor(project, workspace, 'x');
  expect(line(project, 0).slice(0, 5)).toBe('ax漢>b');
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
