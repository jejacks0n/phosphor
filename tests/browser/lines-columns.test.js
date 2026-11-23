// Lines and columns (Edit mode's Alt+arrows, Moebius's Insert Row, Delete Row, Insert Column, Delete Column): each moves
// everything the picked layer has, and only that layer, a line down or up or a column right or left, in one undo step.
// The grid keeps its size and what's pushed past the bottom or right edge goes; the layer's memory of what typing pushed
// past the edge (pastEdge) goes with it.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { toastMessage } from '@/composables/useToast.js';
import { makeArt, artBytes, MOST_ART_BYTES } from '@/document/artLayers.js';
import { cellIndex } from '@/lib/Cells.js';

const WHITE = { fg: '#ffffff', bg: '#000000' }, RED = '#ff0000';

// A blank canvas 4 columns by 4 character rows with a layer, A–D typed down column 0.
async function blank({ cols = 4, rows = 8 } = {}) {
  const app = await createTestApp(), { project } = app;
  await project.setBlankCanvas({ withLayer: true, cols, rows });
  await settle(project);
  [...'ABCD'].forEach((char, row) => project.typeAt(0, row, char, WHITE));
  project.commitEdit();
  return app;
}

// Column c's or row r's edit cells as characters, '.' where there's none.
const column = (project, c = 0) => Array.from({ length: 4 }, (_, r) => project.editCellAt(c, r)?.char ?? '.').join('');
const line = (project, r) => Array.from({ length: 4 }, (_, c) => project.editCellAt(c, r)?.char ?? '.').join('');
const wide = (project, r) => Array.from({ length: 4 }, (_, c) => (project.cells[cellIndex(c, r, project.cols)].wide === 'trail' ? '>' : project.editCellAt(c, r)?.char ?? '.')).join('');

test('insertLine pushes the lines below down, the last one off the bottom; one undo brings it all back', async () => {
  const { project } = await blank();
  const version = project.history.version;
  expect(project.insertLine(1)).toBe(true);
  expect(column(project)).toBe('A.BC');
  expect(project.history.version).toBe(version + 1);
  project.undo();
  expect(column(project)).toBe('ABCD');
  project.redo();
  expect(column(project)).toBe('A.BC');
});

test('deleteLine pulls the lines below up and leaves a blank last line', async () => {
  const { project } = await blank();
  expect(project.deleteLine(1)).toBe(true);
  expect(column(project)).toBe('ACD.');
});

test('insertColumn and deleteColumn push a row right and pull it left', async () => {
  const { project } = await blank();
  [...'BCD'].forEach((char, i) => project.typeAt(i + 1, 0, char, WHITE));
  project.commitEdit();
  expect(line(project, 0)).toBe('ABCD');
  expect(project.insertColumn(0)).toBe(true);
  expect(line(project, 0)).toBe('.ABC');
  expect(column(project, 1)).toBe('ABCD'); // every row moved
  project.undo();
  expect(project.deleteColumn(0)).toBe(true);
  expect(line(project, 0)).toBe('BCD.');
});

test('R1: a line takes its paint with it', async () => {
  const { project } = await blank();
  project.paintEditPixels([{ x: 0, y: 2, r: 255, g: 0, b: 0, alpha: 1 }, { x: 0, y: 3, r: 255, g: 0, b: 0, alpha: 1 }]); // under B
  project.commitEdit();
  project.insertLine(1);
  expect(project.cellHasPaint(0, 2)).toBe(true);
  expect(project.cellHasPaint(0, 1)).toBe(false);
  project.undo();
  expect(project.cellHasPaint(0, 1)).toBe(true);
  expect(project.cellHasPaint(0, 2)).toBe(false);
});

test('what typing pushed past the edge is forgotten: a Backspace after a line moved brings nothing back', async () => {
  const { project } = await blank();
  [...'BCD'].forEach((char, i) => project.typeAt(i + 1, 0, char, WHITE));
  project.commitEdit();
  project.typeAt(0, 0, 'X', WHITE, { mode: 'insert' }); // D is past the edge of row 0
  expect(line(project, 0)).toBe('XABC');
  project.insertLine(0);
  expect(line(project, 1)).toBe('XABC');
  project.backspaceAt(1, 0, WHITE, { mode: 'insert' }); // row 0's memory would bring D back here
  project.backspaceAt(1, 1, WHITE, { mode: 'insert' });
  project.commitEdit();
  expect(line(project, 0)).toBe('....');
  expect(line(project, 1)).toBe('ABC.');
});

test('R1: with the base picked, its cells move with their pins, and the line left behind is erased', async () => {
  const { project, workspace } = await blank();
  project.beginEdit();
  project.writeBaseCells([...'abcd'].map((char, row) => ({ col: 1, row, char, fg: RED, bg: '#000000' })));
  project.commitEdit();
  const layer = project.editId;
  workspace.pickLayer('base');
  const pins = () => Array.from({ length: 4 }, (_, row) => project.baseRecords.pins.get(`1,${row}`) ?? '.').join('');
  expect(project.insertLine(0)).toBe(true);
  await settle(project);
  expect(pins()).toBe(' abc');
  expect([1, 2, 3].map((row) => project.baseCellAt(1, row).char).join('')).toBe('abc');
  expect(project.baseCellAt(1, 1).fg).toBe(RED);
  expect(project.baseCellAt(1, 0).bg).toBe('#000000');
  expect([...project.cellsOf(layer).keys()].sort()).toEqual(['0,0', '0,1', '0,2', '0,3']); // only the picked layer moves
  project.undo();
  await settle(project);
  expect(pins()).toBe('abcd');
  expect(project.deleteColumn(0)).toBe(true);
  expect(Array.from({ length: 4 }, (_, row) => project.baseRecords.pins.get(`0,${row}`) ?? '.').join('')).toBe('abcd');
});

test('a hidden layer is refused, with the words drawing on it gives', async () => {
  const { project } = await blank();
  project.setLayerHidden(project.editId, true);
  toastMessage.value = null;
  expect(project.insertLine(0)).toBe(false);
  expect(toastMessage.value).toBe('Make the layer visible to draw on it');
  expect(column(project)).toBe('ABCD');
});

test('paused, nothing moves', async () => {
  const { project } = await blank();
  project._paused = true;
  expect(project.insertLine(0)).toBeFalsy(); // the guard's undefined
  expect(column(project)).toBe('ABCD');
});

test('a wide character moves whole: a column put in at its trail goes before it, one taken at its lead takes it', async () => {
  const { project } = await blank();
  project.typeAt(1, 0, '漢', WHITE);
  project.typeAt(3, 0, 'b', WHITE);
  project.commitEdit();
  expect(wide(project, 0)).toBe('A漢>b');
  project.insertColumn(2);
  expect(wide(project, 0)).toBe('A.漢>');
  expect(column(project)).toBe('ABCD');
  project.undo();
  project.deleteColumn(1);
  expect(wide(project, 0)).toBe('A b.'); // the trail's space is left
});

test('on a movie, the frame showing changes and the others don\'t', async () => {
  const { project } = await blank();
  project.addFrame('blank');
  expect(project.frame).toBe(1);
  project.insertLine(0);
  expect(column(project)).toBe('.ABC');
  project.showFrame(0);
  expect(column(project)).toBe('ABCD');
  project.showFrame(1);
  expect(column(project)).toBe('.ABC');
});

test('inside an art layer, its own drawing moves, and one made too big is refused', async () => {
  const { project } = await blank();
  const key = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 0], art: { cols: 1, rows: 2, cells: [[0, 'X', null, RED], [1, 'Y', null, RED]] } }));
  expect(project.enterArt(key)).toBe(true);
  expect(project.insertLine(1)).toBe(true);
  expect(project.shapes.get(key).art).toEqual({ cols: 1, rows: 3, cells: [[0, 'X', null, RED], [2, 'Y', null, RED]] });
  project.leaveArt();
  expect(column(project)).toBe('ABCD');
});

test('inside an art layer, a line that would make it too big is refused with art.tooBigEdit, nothing changed', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 200, rows: 40 });
  await settle(project);
  // Just under the limit: a line put in after the first pushes the indexes of 800 to 999 past four digits.
  const cells = [];
  const art = () => makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 200, rows: Math.ceil(cells.length / 200), cells } });
  while (artBytes(art()) <= MOST_ART_BYTES - 32) cells.push([cells.length, 'A', '#123456', '#654321']);
  const key = project.addShape(art());
  expect(project.enterArt(key)).toBe(true);
  const shape = project.shapes.get(key), version = project.history.version;
  toastMessage.value = null;
  project.insertLine(1);
  expect(toastMessage.value).toBe('That would make the art layer too big, so nothing changed.');
  expect(project.shapes.get(key)).toBe(shape);
  expect(project.history.version).toBe(version);
});
