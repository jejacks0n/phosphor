// Typing's Insert and Partial and the row's right edge. The report (bug bash 2): typing in Insert mode pushed the row's
// end off the canvas for good, so backspacing over what was just typed left the row short of the cells it had. What's
// pushed past the edge is remembered now (in memory: not saved, not sent to a room), and whatever pulls the row left
// again (Backspace in those modes, Delete) brings it back, cell for cell: with Insert its paint too, and on the base as
// on a layer.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';

const COLS = 20, ROWS = 20; // 10 character rows
const WHITE = { fg: '#ffffff', bg: '#000000' };
const INSERT = { mode: 'insert' }, PARTIAL = { mode: 'partial' };

// Layer 1 with "abc" at the row's start and "x.yz" at its end (a gap among them), on rows 0 and 1.
async function rowEnds() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: COLS, rows: ROWS });
  for (const row of [0, 1]) {
    [...'abc'].forEach((char, i) => project.typeAt(i, row, char, WHITE));
    [[16, 'x'], [18, 'y'], [19, 'z']].forEach(([col, char]) => project.typeAt(col, row, char, WHITE));
  }
  project.commitEdit();
  return { project, workspace };
}

// Row r's edit cells as characters, '.' where there's none.
const edited = (project, r) => Array.from({ length: COLS }, (_, c) => project.editCellAt(c, r)?.char ?? '.').join('');
const START = 'abc.............x.yz';

test('Insert pushes the row\'s end past the edge, and Backspace brings it back cell for cell, gaps too', async () => {
  const { project } = await rowEnds();
  [...'123'].forEach((char, i) => project.typeAt(3 + i, 0, char, WHITE, INSERT));
  expect(edited(project, 0)).toBe('abc123.............x'); // '.yz' is past the edge
  expect(project.backspaceAt(6, 0, WHITE, INSERT)).toBe(1);
  expect(edited(project, 0)).toBe('abc12.............x.'); // the gap first: it was the last pushed
  project.backspaceAt(5, 0, WHITE, INSERT);
  expect(edited(project, 0)).toBe('abc1.............x.y');
  project.backspaceAt(4, 0, WHITE, INSERT);
  expect(edited(project, 0)).toBe(START);
  project.backspaceAt(3, 0, WHITE, INSERT); // nothing more past the edge: the row just shortens, as before
  expect(edited(project, 0)).toBe('ab.............x.yz.');
  expect(edited(project, 1)).toBe(START); // the other row was never touched
});

test('it lasts past the run of typing: after a pause (the run committed), and a Delete, which pulls the row left too', async () => {
  const { project } = await rowEnds();
  project.typeAt(3, 0, '1', WHITE, INSERT);
  project.typeAt(4, 0, '2', WHITE, INSERT);
  project.commitEdit(); // the pause that ends a run of typing
  expect(edited(project, 0)).toBe('abc12.............x.');
  project.deleteAt(3, 0); // Delete: the row's pulled left from the cursor
  project.commitEdit();
  expect(edited(project, 0)).toBe('abc2.............x.y');
  project.deleteAt(3, 0);
  expect(edited(project, 0)).toBe(START);
});

test('each row has its own: one row\'s pushed cells never come back on another', async () => {
  const { project } = await rowEnds();
  project.typeAt(3, 0, '1', WHITE, INSERT);
  project.typeAt(0, 1, '9', WHITE, INSERT);
  project.typeAt(0, 1, '8', WHITE, INSERT);
  expect([edited(project, 0), edited(project, 1)]).toEqual(['abc1.............x.y', '89abc.............x.']);
  project.backspaceAt(1, 1, WHITE, INSERT);
  project.backspaceAt(1, 1, WHITE, INSERT); // each takes the character at column 0 and pulls the row left
  expect(edited(project, 1)).toBe(START);
  project.backspaceAt(4, 0, WHITE, INSERT);
  expect(edited(project, 0)).toBe(START);
});

test('undo and redo keep it in step: an undone run\'s cells are on the row again, not past the edge too', async () => {
  const { project } = await rowEnds();
  project.typeAt(3, 0, '1', WHITE, INSERT);
  project.commitEdit(); // run one pushed z
  project.typeAt(4, 0, '2', WHITE, INSERT);
  project.commitEdit(); // run two pushed y
  project.undo(); // run two undone: y is on the row again
  expect(edited(project, 0)).toBe('abc1.............x.y');
  project.backspaceAt(4, 0, WHITE, INSERT); // so this brings back z alone, once
  expect(edited(project, 0)).toBe(START);
  project.commitEdit();
  project.deleteAt(3, 0);
  expect(edited(project, 0)).toBe('abc............x.yz.'); // nothing left past the edge to bring
  project.commitEdit();
  project.undo(); // the Delete
  project.undo(); // the Backspace: z is past the edge again
  project.redo();
  expect(edited(project, 0)).toBe(START);
  project.undo();
  project.undo(); // run one: everything's back on the row
  project.deleteAt(19, 0);
  expect(edited(project, 0)).toBe('abc.............x.y.'); // and nothing comes in from past the edge
});

test('Overwrite pushes nothing, and its Backspace brings nothing back', async () => {
  const { project } = await rowEnds();
  project.typeAt(3, 0, '1', WHITE, INSERT); // z is past the edge
  project.backspaceAt(19, 0, WHITE); // Overwrite: a space over the cell before, no shift
  expect(edited(project, 0)).toBe('abc1.............x y');
  project.typeAt(5, 0, 'q', WHITE);
  expect(edited(project, 0)).toBe('abc1.q...........x y');
});

test('at another canvas width it starts over: the edge it was past isn\'t the edge now', async () => {
  const { project } = await rowEnds();
  project.typeAt(3, 0, '1', WHITE, INSERT); // z is past the edge, at 20 columns
  project.commitEdit();
  project.cols = COLS + 2;
  await settle(project);
  project.backspaceAt(4, 0, WHITE, INSERT);
  const wide = Array.from({ length: COLS + 2 }, (_, c) => project.editCellAt(c, 0)?.char ?? '.').join('');
  expect(wide).toBe('abc.............x.y...'); // nothing comes in at the new edge
});

test('Clear layer forgets it: nothing of the cleared layer comes back on a Backspace', async () => {
  const { project } = await rowEnds();
  project.typeAt(3, 0, '1', WHITE, INSERT); // z is past the edge
  project.commitEdit();
  project.clearEditLayer();
  project.typeAt(0, 0, 'n', WHITE, INSERT);
  project.typeAt(1, 0, 'e', WHITE, INSERT);
  project.backspaceAt(2, 0, WHITE, INSERT);
  expect(edited(project, 0)).toBe('n...................');
});

test('a wide character typed pushes two cells, and Backspace over it brings both back', async () => {
  const { project } = await rowEnds();
  expect(project.typeAt(3, 0, '漢', WHITE, INSERT)).toBe(true);
  expect(edited(project, 0)).toBe('abc漢 .............x.'); // its trail's cell is a space
  expect(project.backspaceAt(5, 0, WHITE, INSERT)).toBe(2);
  expect(edited(project, 0)).toBe(START);
});

test('Insert takes the row\'s paint along and brings it back with the row; Partial brings back the characters alone', async () => {
  const { project } = await rowEnds();
  const RED = { r: 255, g: 0, b: 0, alpha: 1 };
  project.paintEditPixels([{ x: 17, y: 0, ...RED }, { x: 17, y: 1, ...RED }]); // the gap among the row's last cells: paint, no character
  project.commitEdit();
  const painted = () => Array.from({ length: COLS }, (_, col) => (project.paintLayer.pixelAt(col, 0) ? col : null)).filter((col) => col !== null);
  [...'123'].forEach((char, i) => project.typeAt(3 + i, 0, char, WHITE, INSERT)); // z, then y, then the painted gap go past the edge
  expect(edited(project, 0)).toBe('abc123.............x');
  expect(painted()).toEqual([]);
  project.backspaceAt(6, 0, WHITE, INSERT);
  expect(painted()).toEqual([19]); // the gap is back, with its paint and no character
  expect(project.editCellAt(19, 0)).toBeUndefined();
  project.backspaceAt(5, 0, WHITE, INSERT);
  project.backspaceAt(4, 0, WHITE, INSERT);
  expect(edited(project, 0)).toBe(START);
  expect(painted()).toEqual([17]);
  project.commitEdit();

  project.typeAt(3, 0, '1', WHITE, PARTIAL); // the characters move over the paint, which stays: z is past the edge
  expect([edited(project, 0), painted()]).toEqual(['abc1.............x.y', [17]]);
  project.backspaceAt(4, 0, WHITE, PARTIAL);
  expect([edited(project, 0), painted()]).toEqual([START, [17]]);
  project.commitEdit();

  [...'123'].forEach((char, i) => project.typeAt(3 + i, 0, char, WHITE, INSERT)); // pushed with their paint,
  project.backspaceAt(6, 0, WHITE, PARTIAL); // and pulled without: the painted gap had no character to bring
  expect([edited(project, 0), painted()]).toEqual(['abc12.............x.', []]);
  project.backspaceAt(5, 0, WHITE, PARTIAL);
  expect(edited(project, 0)).toBe('abc1.............x.y'); // y had one
});

test('on the base too: a pinned character pushed past the edge comes back with its pixels', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: COLS, rows: ROWS });
  await settle(project);
  workspace.pickLayer('base');
  project.beginEdit();
  project.writeBaseCells([{ col: 19, row: 0, char: 'Z', fg: '#ff0000', bg: '#0000ff' }]);
  project.commitEdit();
  const last = () => [project.baseRecords.pins.get('19,0'), project.baseColorAt(19, 0), project.baseColorAt(19, 1)];
  expect(last()).toEqual(['Z', '#0000ff', '#ff0000']); // a cell's background is its top pixel
  for (const mode of [INSERT, PARTIAL]) {
    expect(project.typeAt(3, 0, '1', WHITE, mode)).toBe(true);
    expect(last()[0]).not.toBe('Z');
    project.backspaceAt(4, 0, WHITE, mode);
    expect(last()).toEqual(['Z', '#0000ff', '#ff0000']);
    project.commitEdit();
  }
});
