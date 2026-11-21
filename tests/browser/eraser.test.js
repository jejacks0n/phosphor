// The Eraser's Hard and Soft: Hard is a square that clears what it covers at once (pixels in the PIXEL view, whole cells
// with their characters in the ANSI view); Soft is round and feathered and takes paint away a little at a time, by its
// Flow, as the Brush lays it, the same in both views. On the base, where erasing is black, Soft lays the black that way.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import eraser from '@/tools/eraser';
import shapes from '@/tools/shapes';
import { isLaid, parseKey } from '@/document/editCells';

const RED = { r: 255, g: 0, b: 0 };

// A 20 x 20 canvas with Layer 1 picked and painted solid red, in the PIXEL view.
async function painted() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.editorTab = 'input';
  workspace.pickLayer('edit');
  const all = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) all.push({ x, y, ...RED, alpha: 1 });
  project.paintEditPixels(all);
  project.commitEdit();
  const ctx = { project, workspace, view: 'input' };
  const click = (x, y, c = ctx) => { eraser.begin(c, { x, y }); eraser.end(c); };
  const alpha = (x, y) => project.paintOf('edit').pixelAt(x, y)?.a ?? 0;
  return { project, workspace, ctx, click, alpha };
}

test('Soft takes paint away a little at a time, round and feathered, more with each pass, until it\'s gone', async () => {
  const { project, workspace, click, alpha } = await painted();
  Object.assign(workspace, { editEraserSize: 6, editEraserSoft: true, editEraserFlow: 50 });
  click(10, 10);
  const once = alpha(10, 10);
  expect(once).toBeGreaterThan(0.5);   // some of it,
  expect(once).toBeLessThan(1);        // not all
  expect(alpha(9, 9)).toBe(once);      // the same all round its middle
  expect(alpha(12, 10)).toBeGreaterThan(once);   // less toward its edge
  expect(alpha(12, 10)).toBeLessThan(1);
  expect(alpha(7, 7)).toBe(1);         // round: the corner of its square is left alone
  expect(alpha(13, 10)).toBe(1);
  click(10, 10);
  expect(alpha(10, 10)).toBeLessThan(once);   // a second pass takes more
  project.undo();                             // each pass is an undo step
  expect(alpha(10, 10)).toBe(once);
  for (let pass = 0; pass < 6; pass++) click(10, 10);
  expect(alpha(10, 10)).toBe(0);              // and enough of them, all of it
  expect(alpha(7, 7)).toBe(1);
});

test('Soft at a low Flow still clears faint paint: every pass takes something', async () => {
  const { workspace, click, alpha } = await painted();
  Object.assign(workspace, { editEraserSize: 6, editEraserSoft: true, editEraserFlow: 1 });
  let before = alpha(10, 10);
  for (let pass = 0; pass < 3; pass++) {
    click(10, 10);
    expect(alpha(10, 10)).toBeLessThan(before);
    before = alpha(10, 10);
  }
});

test('Hard clears its square at once, Soft off or never touched', async () => {
  const { workspace, click, alpha } = await painted();
  expect(workspace.editEraserSoft).toBe(false);   // hard to start
  workspace.editEraserSize = 6;
  click(10, 10);
  expect([alpha(7, 7), alpha(10, 10), alpha(12, 12)]).toEqual([0, 0, 0]);   // the whole square, corners too
  expect([alpha(6, 6), alpha(13, 13)]).toEqual([1, 1]);
});

test('Soft on the base lays black a little at a time; Hard turns it black at once', async () => {
  const { project, workspace, click } = await painted();
  workspace.pickLayer('base');
  project.beginEdit();
  const all = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) all.push({ x, y, hex: '#ff0000' });
  project.writeBase(all);
  project.commitEdit();
  Object.assign(workspace, { editEraserSize: 6, editEraserSoft: true, editEraserFlow: 50 });
  const red = (x, y) => parseInt(project.baseColorAt(x, y).slice(1, 3), 16);
  click(10, 10);
  expect(red(10, 10)).toBeLessThan(255);
  expect(red(10, 10)).toBeGreaterThan(100);
  expect(project.baseColorAt(7, 7)).toBe('#ff0000');
  const once = red(10, 10);
  click(10, 10);
  expect(red(10, 10)).toBeLessThan(once);
  workspace.editEraserSoft = false;
  click(10, 10);
  expect(project.baseColorAt(10, 10)).toBe('#000000');
  expect(project.baseColorAt(7, 7)).toBe('#000000');
});

test('Hard in the ANSI view erases whole cells, characters with them', async () => {
  const { project, workspace, ctx, alpha } = await painted();
  project.typeAt(10, 5, 'A', { fg: '#ffffff' });
  project.commitEdit();
  workspace.editEraserCells = 1;
  const ansi = { ...ctx, view: 'output' };
  eraser.begin(ansi, { x: 10.5, y: 10.5 });   // cell (10, 5): grid pixels (10, 10) and (10, 11)
  eraser.end(ansi);
  expect([alpha(10, 10), alpha(10, 11)]).toEqual([0, 0]);
  expect([alpha(9, 10), alpha(11, 10), alpha(10, 9), alpha(10, 12)]).toEqual([1, 1, 1, 1]);
  expect(project.editCellAt(10, 5)).toBeUndefined();
});

// Soft is the same eraser in both views, as the Brush is the same brush: round, in grid pixels at the PIXEL view's Size,
// taking paint away by its Flow. It works on paint, so a character someone typed stays, as it does under the Eraser in
// the PIXEL view; Hard is what takes characters.
test('Soft in the ANSI view takes paint away as it does in PIXEL, and leaves typed characters where they are', async () => {
  const { project, workspace, ctx, alpha } = await painted();
  project.typeAt(3, 2, 'A', { fg: '#ffffff' });   // typing clears the paint in its cell: the next cell along still has it
  project.commitEdit();
  Object.assign(workspace, { editEraserSize: 6, editEraserCells: 1, editEraserSoft: true, editEraserFlow: 50 });
  const ansi = { ...ctx, view: 'output' };
  const click = (x, y) => { eraser.begin(ansi, { x, y }); eraser.end(ansi); };
  click(10, 10);
  const once = alpha(10, 10);
  expect(once).toBeGreaterThan(0.5);
  expect(once).toBeLessThan(1);
  expect(alpha(12, 10)).toBeGreaterThan(once);   // feathered
  expect(alpha(7, 7)).toBe(1);                   // round, and six pixels across: not one cell
  click(10, 10);
  expect(alpha(10, 10)).toBeLessThan(once);
  click(4, 5);   // over the typed A, cell (3, 2), and the paint beside it
  expect(project.editCellAt(3, 2)?.char).toBe('A');
  expect(alpha(4, 5)).toBeLessThan(1);
});

test('the options row: Hard or Soft in both views; Soft brings Flow and the PIXEL Size to the ANSI view, and its outline is a circle', async () => {
  const { workspace } = await painted();
  const offered = (view) => {
    workspace.editorTab = view;
    return eraser.options.filter((o) => (!o.views || o.views.includes(view)) && (!o.when || o.when(workspace))).map((o) => o.key);
  };
  expect(offered('input')).toEqual(['editEraserSize', 'editEraserSoft']);
  expect(offered('output')).toEqual(['editEraserCells', 'editEraserSoft']);
  expect([eraser.preview.soft(workspace, 'input'), eraser.preview.soft(workspace, 'output')]).toEqual([false, false]);
  expect([eraser.preview.size(workspace, 'input'), eraser.preview.size(workspace, 'output')]).toEqual([5, 1]);
  workspace.editEraserSoft = true;
  expect(offered('input')).toEqual(['editEraserSize', 'editEraserSoft', 'editEraserFlow']);
  expect(offered('output')).toEqual(['editEraserSize', 'editEraserSoft', 'editEraserFlow']);
  expect([eraser.preview.soft(workspace, 'input'), eraser.preview.soft(workspace, 'output')]).toEqual([true, true]);
  expect([eraser.preview.size(workspace, 'input'), eraser.preview.size(workspace, 'output')]).toEqual([5, 5]);   // grid pixels in both
});

// A 20 x 20 blank canvas with `on` picked ('edit' or 'base'): a steep Half-block line with Half-column detail drawn in the
// ANSI view, and the same characters typed by hand at column 12 on its rows. drawn: the line's cells (on the base, pins).
async function lined(on) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.pickLayer(on);
  Object.assign(workspace, { shapeKind: 'line', shapeDrawWith: 'half', shapeVerticalHalves: true, editFgColor: '#ff0000', editBgNone: true });
  const chars = () => (on === 'base' ? new Map(project.baseRecords.pins) : new Map([...project.editCells].map(([key, entry]) => [key, entry.char])));
  const before = chars(), ctx = { project, workspace, view: 'output' }, from = { x: 4.5, y: 2.5 }, to = { x: 5.5, y: 16.5 };
  shapes.begin(ctx, from);
  shapes.move(ctx, from, to);
  shapes.end(ctx);
  const drawn = [...chars()].filter(([key, char]) => before.get(key) !== char).map(([key, char]) => ({ ...parseKey(key), char }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  for (const { row, char } of drawn) project.typeAt(12, row, char, { fg: '#ff0000' });
  project.commitEdit();
  return { project, workspace, drawn };
}

test('R1: the Soft Eraser in the ANSI view and the Eraser in the PIXEL view take a laid line on a layer; typed characters stay', async () => {
  for (const [view, soft] of [['output', true], ['input', false], ['input', true]]) {
    const { project, workspace, drawn } = await lined('edit');
    expect(drawn.every(({ col, row }) => isLaid(project.editCellAt(col, row)))).toBe(true);
    Object.assign(workspace, { editEraserSoft: soft, editEraserSize: 1, editEraserFlow: 10 });
    const { col, row } = drawn[3];
    const ctx = { project, workspace, view };
    eraser.begin(ctx, { x: col + 0.5, y: 2 * row + 0.5 }); eraser.end(ctx); // the top half alone (grid pixels in both views)
    expect(project.editCellAt(col, row), `${view} ${soft}`).toBeFalsy();
    project.undo();
    expect(isLaid(project.editCellAt(col, row))).toBe(true); // undo brings back the cell and its mark
    eraser.begin(ctx, { x: 12.5, y: 2 * row + 0.5 }); eraser.end(ctx);
    expect(project.editCellAt(12, row)?.char, `${view} ${soft}`).toBe(drawn[3].char); // typed by hand: stays
  }
});

test('R1: a laid line moved with the Select tool is still laid', async () => {
  const { project, drawn } = await lined('edit');
  const { col, row } = drawn[3];
  project.moveSelection({ c0: 0, r0: 0, c1: 19, r1: 9 }, ['edit'], 1, 0);
  expect(isLaid(project.editCellAt(col + 1, row))).toBe(true);
});

test('R1: a laid cell typed over is someone\'s own: the Soft Eraser leaves it', async () => {
  const { project, workspace, drawn } = await lined('edit');
  const { col, row } = drawn[3];
  project.typeAt(col, row, 'x', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  expect(isLaid(project.editCellAt(col, row))).toBe(false);
  Object.assign(workspace, { editEraserSoft: true, editEraserSize: 1 });
  const ctx = { project, workspace, view: 'output' };
  eraser.begin(ctx, { x: col + 0.5, y: 2 * row + 0.5 }); eraser.end(ctx);
  expect(project.editCellAt(col, row)?.char).toBe('x');
});

test('R1: a laid cell tinted by Colors only, or painted over, is someone\'s own: the Soft Eraser leaves it', async () => {
  for (const blockChars of ['plain', false]) {
    const { project, workspace, drawn } = await lined('edit');
    const { col, row, char } = drawn[3];
    project.paintStroke([{ x: col, y: 2 * row, alpha: 1 }], '#0000ff', { blockChars });
    project.commitEdit();
    expect(isLaid(project.editCellAt(col, row)), `${blockChars}`).toBe(false);
    expect(project.editCellAt(col, row)?.char).toBe(char); // tinted, still the line's character
    Object.assign(workspace, { editEraserSoft: true, editEraserSize: 1, editEraserFlow: 10 });
    const ctx = { project, workspace, view: 'output' };
    eraser.begin(ctx, { x: col + 0.5, y: 2 * row + 1.5 }); eraser.end(ctx); // the half the paint didn't reach
    expect(project.editCellAt(col, row)?.char, `${blockChars}`).toBe(char);
  }
});

test('R11: on the base a laid line\'s pin the PIXEL Eraser, or the Soft Eraser in the ANSI view, leaves black is a black space', async () => {
  for (const [view, soft] of [['input', false], ['output', true]]) {
    const { project, workspace, drawn } = await lined('base');
    const { col, row, char } = drawn[3], pin = () => project.baseRecords.pins.get(`${col},${row}`);
    expect(pin()).toBe(char);
    const ctx = { project, workspace, view };
    Object.assign(workspace, { editEraserSoft: soft, editEraserSize: 1, editEraserFlow: 100 });
    // Its red foreground; a line has no background but the canvas's black. Soft lays the black a pass at a time.
    for (let i = 0; i < 20 && pin() === char; i++) { eraser.begin(ctx, { x: col + 0.5, y: 2 * row + 1.5 }); eraser.end(ctx); }
    expect(pin(), `${view} ${soft}`).toBe(' ');
    project.undo();
    if (soft) while (pin() === ' ') project.undo(); // each pass is its own step
    expect(pin()).toBe(char);
  }
});

// A pin red on blue, its indexes kept beside it (a file's 256 colors), the base picked, in the PIXEL view.
async function bluePin() {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.pickLayer('base');
  project.writeBaseCells([{ col: 3, row: 3, char: '▌', fg: '#ff0000', bg: '#0000ff', fgIndex: 196, bgIndex: 21 }]);
  project.commitEdit();
  const ctx = { project, workspace, view: 'input' };
  const click = (x, y) => { eraser.begin(ctx, { x, y }); eraser.end(ctx); };
  return { project, workspace, click, pin: () => project.baseRecords.pins.get('3,3'), indexes: () => project.baseRecords.indexes.get('3,3') };
}

test('R11: a pin left partly colored keeps its character; erased black, it\'s a black space with no indexes, and undo brings them back', async () => {
  const { workspace, project, click, pin, indexes } = await bluePin();
  Object.assign(workspace, { editEraserSoft: false, editEraserSize: 1 });
  click(3.5, 7.5); // the red foreground, and its index with it (black's the pixel's own now): the blue background stays
  expect([pin(), indexes()]).toEqual(['▌', { bgIndex: 21 }]);
  click(3.5, 6.5);
  expect([pin(), indexes()]).toEqual([' ', undefined]);
  project.undo();
  expect([pin(), indexes()]).toEqual(['▌', { bgIndex: 21 }]);
  project.undo();
  expect([pin(), indexes()]).toEqual(['▌', { fgIndex: 196, bgIndex: 21 }]);
});

test('R11: the Soft Eraser on the base: one light pass keeps a pin\'s character, passes that leave it black make it a space', async () => {
  const { workspace, click, pin } = await bluePin();
  Object.assign(workspace, { editEraserSoft: true, editEraserSize: 3, editEraserFlow: 10 });
  click(3.5, 7);
  expect(pin()).toBe('▌');
  workspace.editEraserFlow = 100;
  for (let i = 0; i < 20 && pin() !== ' '; i++) click(3.5, 7);
  expect(pin()).toBe(' ');
});
