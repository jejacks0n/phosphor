// Wide characters in the store, laid out the way a terminal shows them (docs/wide-characters.md):
// a two-column character's cell is its lead and the next its trail; writing over either half
// breaks the other into a space; nothing two columns wide goes in the last column.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { terminalGrid } from '../support/terminal.js';
import { snapCursor } from '@/document/wideChars';
import eraser from '@/tools/eraser';
import { AnsiFile } from '@/lib/AnsiFile';
import { cellIndex } from '@/lib/Cells';
import { graphemes, cellWidth } from '@/lib/CharWidth';

const COLS = 20, ATTRS = { fg: '#ffffff', bg: '#000000' };

async function blank() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: 20 });
  return { project, workspace };
}

// Row r as characters, with a trail shown as '>' (what a terminal fills with the lead's right half).
const line = (project, r) => Array.from({ length: COLS }, (_, c) => {
  const cell = project.cells[cellIndex(c, r, COLS)];
  return cell.wide === 'trail' ? '>' : cell.char;
}).join('');

const type = (project, col, row, text, opts) => {
  for (const char of graphemes(text)) {
    if (project.typeAt(col, row, char, ATTRS, opts)) col += cellWidth(char);
  }
  project.commitEdit();
};

test('a wide character takes two columns; the last column refuses it', async () => {
  const { project } = await blank();
  type(project, 0, 0, 'a漢b');
  expect(line(project, 0).slice(0, 4)).toBe('a漢>b');
  expect(project.cells[cellIndex(1, 0, COLS)].wide).toBe('lead');
  expect(project.typeAt(COLS - 1, 1, '漢', ATTRS)).toBe(false);
  expect(project.editCellAt(COLS - 1, 1)).toBeUndefined();
  expect(project.typeAt(COLS - 1, 1, '﷽', ATTRS)).toBe(true); // one column wide, however long it looks
});

test('typing over either half breaks the other into a space', async () => {
  const { project } = await blank();
  type(project, 0, 0, '漢字');
  expect(line(project, 0).slice(0, 4)).toBe('漢>字>');
  project.typeAt(1, 0, 'x', ATTRS); // over the trail: the lead becomes a space
  project.commitEdit();
  expect(line(project, 0).slice(0, 4)).toBe(' x字>');
  project.typeAt(2, 0, 'y', ATTRS); // over a lead: the trail becomes a space
  project.commitEdit();
  expect(line(project, 0).slice(0, 4)).toBe(' xy ');
});

test('a wide character written over a neighbour\'s lead breaks that neighbour', async () => {
  const { project } = await blank();
  type(project, 1, 0, '漢');
  project.typeAt(0, 0, '字', ATTRS); // covers col 1, the old lead: its trail (col 2) becomes a space
  project.commitEdit();
  expect(line(project, 0).slice(0, 3)).toBe('字> ');
});

test('the cursor never rests on a trail', async () => {
  const { project } = await blank();
  type(project, 2, 0, '漢');
  expect(snapCursor(project.cells, COLS, { col: 3, row: 0 }, 1)).toEqual({ col: 4, row: 0 });
  expect(snapCursor(project.cells, COLS, { col: 3, row: 0 }, -1)).toEqual({ col: 2, row: 0 });
  expect(snapCursor(project.cells, COLS, { col: 3, row: 0 }, 0)).toEqual({ col: 2, row: 0 });
});

test('Backspace and Delete take a whole wide character', async () => {
  const { project } = await blank();
  type(project, 0, 0, 'a漢b');
  expect(project.backspaceAt(3, 0, ATTRS, { insert: true })).toBe(2);
  project.commitEdit();
  expect(line(project, 0).slice(0, 2)).toBe('ab');
  type(project, 1, 1, '字');
  project.deleteAt(1, 1);
  project.commitEdit();
  expect(project.editCellAt(1, 1)).toBeUndefined();
  expect(project.cells[cellIndex(1, 1, COLS)].wide).toBeUndefined();
});

test('insert mode shifts the row by the character\'s width', async () => {
  const { project } = await blank();
  type(project, 0, 0, 'abc');
  project.typeAt(1, 0, '漢', ATTRS, { insert: true });
  project.commitEdit();
  expect(line(project, 0).slice(0, 5)).toBe('a漢>bc');
});

test('a shape written over half of a wide character breaks the other half', async () => {
  const { project } = await blank();
  type(project, 4, 2, '漢');
  type(project, 8, 2, '字');
  project.beginEdit();
  project.writeEditCells([{ col: 5, row: 2, attrs: { char: '─' } }, { col: 8, row: 2, attrs: { char: '─' } }]);
  project.commitEdit();
  const row = line(project, 2);
  expect(row.slice(4, 6)).toBe(' ─');
  expect(row.slice(8, 10)).toBe('─ ');
});

test('the eraser on a trail erases its lead too', async () => {
  const { project, workspace } = await blank();
  type(project, 4, 3, '漢');
  workspace.editEraserSize = 1;
  workspace.eraseLayers = { base: false, edit: true };
  const ctx = { project, workspace, view: 'output' };
  eraser.begin(ctx, { x: 5, y: 6 });
  eraser.end(ctx);
  expect(project.editCellAt(4, 3)).toBeUndefined();
  expect(project.cells[cellIndex(4, 3, COLS)].wide).toBeUndefined();
});

test('the result exports to a .utf8ans a terminal lays out column for column', async () => {
  const { project } = await blank();
  type(project, 0, 0, 'a漢b字');
  type(project, COLS - 3, 1, '漢x');
  type(project, 3, 2, 'é👍🏽');
  await settle(project);
  const rows = 10;
  const blob = new AnsiFile(COLS, rows, project.cells).toBlob({ utf8: true, colorMode: 'none', sauce: {} });
  const grid = terminalGrid(new Uint8Array(await blob.arrayBuffer()), COLS);
  expect(grid).toHaveLength(rows);
  expect(grid[0].slice(0, 6)).toEqual(['a', '漢', '', 'b', '字', '']);
  expect(grid[1].slice(COLS - 3)).toEqual(['漢', '', 'x']);
  expect(grid[2].slice(3, 6)).toEqual(['é', '👍🏽', '']);
});
