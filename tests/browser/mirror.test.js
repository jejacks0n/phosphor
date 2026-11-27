// Mirror mode on the project store: the edit layer's writes lay a mirrored copy while the store carries a mark.
import { describe, test, expect, beforeEach } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { mirrorAxes, strokeMirror, withMirror } from '@/lib/mirror.js';
import { getTool } from '@/tools';
import { fillSolid } from '@/tools/bucket';

let project, workspace;
beforeEach(async () => {
  ({ project, workspace } = await createTestApp());
  await project.setBlankCanvas({ cols: 80, rows: 10, withLayer: true });
  await settle(project);
});

const mark = () => ({ axes: mirrorAxes(workspace.rulerZero, project.cols), clip: null });
const mirrorWith = (fn) => withMirror(project, mark(), fn);

describe('the edit layer under a mirror mark', () => {
  test('a stroke paints the mirrored pixel too', () => {
    mirrorWith(() => project.paintStroke([{ x: 2, y: 3, alpha: 1 }]));
    expect(project.paintLayer.pixelAt(2, 3)).toBeTruthy();
    expect(project.paintLayer.pixelAt(77, 3)).toBeTruthy();
  });

  test('cells land turned on the other side, and down too when the zero is moved down', async () => {
    mirrorWith(() => project.writeEditCells([{ col: 1, row: 2, attrs: { char: '┌' } }]));
    expect(project.editCellAt(78, 2).char).toBe('┐');
    await project.setBlankCanvas({ cols: 80, rows: 20, withLayer: true }); // 10 cell rows, so the zero at 5 has room below
    await settle(project);
    workspace.rulerZero = { x: 0, y: 5 };
    mirrorWith(() => project.writeEditCells([{ col: 1, row: 2, attrs: { char: '┌' } }]));
    expect(project.editCellAt(1, 7).char).toBe('└');
    expect(project.editCellAt(78, 7).char).toBe('┘');
  });

  test('on the axis itself a cell is written once, and Stack lays its alpha once', async () => {
    await project.setBlankCanvas({ cols: 81, rows: 10, withLayer: true });
    await settle(project);
    mirrorWith(() => project.writeEditCells([{ col: 40, row: 0, attrs: { char: '┌' } }]));
    expect(project.editCellAt(40, 0).char).toBe('┌');
    workspace.editBrushStack = true;
    workspace.editBrushOpacity = 50;
    mirrorWith(() => project.paintStroke([{ x: 40, y: 8, alpha: 1 }]));
    const marked = project.paintLayer.pixelAt(40, 8).a;
    await project.setBlankCanvas({ cols: 81, rows: 10, withLayer: true });
    await settle(project);
    project.paintStroke([{ x: 40, y: 8, alpha: 1 }]);
    expect(marked).toBe(project.paintLayer.pixelAt(40, 8).a);
  });

  test('one undo clears both sides', () => {
    mirrorWith(() => project.writeEditCells([{ col: 1, row: 2, attrs: { char: 'a' } }]));
    project.commitEdit();
    expect(project.editCellAt(78, 2)).toBeTruthy();
    project.undo();
    expect(project.editCellAt(1, 2)).toBeFalsy();
    expect(project.editCellAt(78, 2)).toBeFalsy();
  });

  test('without the mark one side is written', () => {
    project.writeEditCells([{ col: 1, row: 2, attrs: { char: 'a' } }]);
    expect(project.editCellAt(1, 2)).toBeTruthy();
    expect(project.editCellAt(78, 2)).toBeFalsy();
  });

  test('on the base both sides are laid', () => {
    workspace.pickLayer('base');
    mirrorWith(() => project.writeEditCells([{ col: 1, row: 2, attrs: { char: 'a' } }]));
    expect(project.baseRecords.pins.get('1,2')).toBe('a');
    expect(project.baseRecords.pins.get('78,2')).toBe('a');
  });

  test('a soft stroke lays each side once, nested writes included', () => {
    workspace.editBrushStack = true;
    mirrorWith(() => project.paintStroke([{ x: 2, y: 3, alpha: 0.3 }]));
    const a = project.paintLayer.pixelAt(2, 3).a;
    expect(a).toBeGreaterThan(0);
    expect(project.paintLayer.pixelAt(77, 3).a).toBe(a);
  });

  test('Half-block leaves a mirrored cell that is a paint block as it was', () => {
    project.writeBlocks([{ col: 78, row: 2 }]); // no mark: only the mirrored cell is a block
    const before = project.editCells.get('78,2');
    expect(before).toBeTruthy();
    mirrorWith(() => project.paintStroke([{ x: 1, y: 4, alpha: 1 }], undefined, { blockChars: true }));
    expect(project.editCells.get('78,2')).toBe(before);
  });
});

// A tool's stroke as the viewport runs it: each call under the mark strokeMirror gives that tool.
const drag = (tool, view, ...points) => {
  const ctx = { project, workspace, view };
  const run = (fn) => withMirror(project, strokeMirror(workspace, project, tool), fn);
  run(() => tool.begin(ctx, points[0], { stopPropagation() {} }));
  for (let i = 1; i < points.length; i++) run(() => tool.move(ctx, points[i - 1], points[i]));
  run(() => tool.end(ctx));
};
const at = (col, row) => ({ x: col + 0.5, y: 2 * row + 1 });

describe('the tools under mirror mode', () => {
  beforeEach(() => {
    workspace.mirror = true;
    Object.assign(workspace, { editFgColor: '#ff0000', brushDrawWith: 'normal', pencilDrawWith: 'normal' });
  });

  test('the drawing tools mirror; Text doesn\'t, so typing lays one side', () => {
    for (const id of ['brush', 'pencil', 'eraser', 'shapes', 'blur', 'dodge', 'burn', 'bucket', 'gradient', 'flip']) expect(getTool(id).mirrors, id).toBe(true);
    expect(getTool('text').mirrors).toBeFalsy();
    withMirror(project, strokeMirror(workspace, project, getTool('text')), () => project.typeAt(2, 0, 'L', workspace.typingAttrs()));
    expect(project.editCellAt(2, 0).char).toBe('L');
    expect(project.editCellAt(77, 0)).toBeFalsy();
  });

  test('the Brush in PIXEL paints the other side too', () => {
    drag(getTool('brush'), 'input', { x: 5.5, y: 3.5 }, { x: 7.5, y: 3.5 });
    expect(project.paintLayer.pixelAt(5, 3)).toBeTruthy();
    expect(project.paintLayer.pixelAt(74, 3)).toBeTruthy();
  });

  // A soft Brush's dabs overlap along a move and add up: the other side builds up as much.
  test('a soft Brush comes out as strong on the other side', () => {
    Object.assign(workspace, { editBrushSize: 6, editBrushFlow: 30, editBrushHardness: 0 });
    drag(getTool('brush'), 'input', { x: 5.5, y: 3.5 }, { x: 15.5, y: 3.5 });
    for (const x of [6, 10, 14]) expect(project.paintLayer.pixelAt(79 - x, 3).a, x).toBe(project.paintLayer.pixelAt(x, 3).a);
  });

  test('the Pencil\'s Single lines come out turned on the other side', () => {
    workspace.pencilDrawWith = 'single';
    drag(getTool('pencil'), 'output', at(2, 1), at(8, 1), at(8, 4)); // the canvas is 5 cell rows
    const row = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => project.editCellAt(c0 + i, r)?.char).join('');
    expect(row(1, 2, 8)).toBe('──────┐');
    expect(row(1, 71, 77)).toBe('┌──────');
    for (let r = 2; r <= 4; r++) expect(project.editCellAt(71, r)?.char).toBe('│');
  });

  test('the Eraser\'s exact mode judges each side by its own cells: a typed character there stays', () => {
    const laid = (col) => ({ col, row: 0, attrs: { char: '─', fg: '#aaaaaa', laid: true } });
    project.writeEditCells([laid(3), laid(4), laid(5), laid(74), laid(76), { col: 75, row: 0, attrs: { char: 'A' } }]);
    project.commitEdit();
    Object.assign(workspace, { editEraserSoft: true, editEraserSize: 2, editEraserFlow: 100 });
    drag(getTool('eraser'), 'output', at(3, 0), at(5, 0));
    for (const col of [3, 4, 5, 74, 76]) expect(project.editCellAt(col, 0), `col ${col}`).toBeFalsy();
    expect(project.editCellAt(75, 0)?.char).toBe('A');
  });

  test('the Eraser\'s Hard erases a wide character on the other side from its trail, as it does here', () => {
    mirrorWith(() => project.writeEditCells([{ col: 3, row: 0, attrs: { char: '中' } }])); // its mirror's lead at 75, over 75 and 76
    project.commitEdit();
    expect(project.editCellAt(75, 0)?.char).toBe('中');
    Object.assign(workspace, { editEraserSoft: false, editEraserCells: 1 });
    drag(getTool('eraser'), 'output', at(3, 0)); // mirrored, col 76: the trail
    expect(project.editCellAt(3, 0)).toBeFalsy();
    expect(project.editCellAt(75, 0)).toBeFalsy();
  });

  test('Flip flips the mirrored cell too, and dragged across the axis flips each cell once', () => {
    const cols = [38, 39, 40, 41];
    project.writeEditCells([1, 2].flatMap((row) => cols.map((col) => ({ col, row, attrs: { char: 'X', fg: '#aa0000', bg: '#0000aa' } }))));
    project.commitEdit();
    const colors = (row) => cols.map((col) => project.underlyingAt(col, row, { evenHidden: true }));
    const before = colors(1);
    drag(getTool('flip'), 'output', at(38, 2)); // a click: col 41 is its mirror
    expect(colors(2).map(({ fg }) => fg)).toEqual([before[0].bg, before[1].fg, before[2].fg, before[3].bg]);
    drag(getTool('flip'), 'output', ...cols.map((col) => at(col, 1)));
    expect(colors(1).map(({ fg }) => fg)).toEqual(before.map(({ bg }) => bg));
  });

  test('the Paint Bucket\'s fill, written a frame later, is laid on the other side too', async () => {
    workspace.editorTab = 'input';
    project.paintStroke(Array.from({ length: 10 }, (_, y) => ({ x: 39, y, alpha: 1 })), '#ffffff'); // a wall down the middle
    project.commitEdit();
    await settle(project);
    workspace.editFgColor = '#00ff00';
    const ctx = { project, workspace, view: 'input' };
    await withMirror(project, strokeMirror(workspace, project, getTool('bucket')), () => fillSolid(ctx, { x: 5.5, y: 3.5 }));
    expect(project.paintLayer.pixelAt(5, 3)?.g).toBe(255);
    expect(project.paintLayer.pixelAt(74, 3)?.g).toBe(255);
  });

  test('a Bucket fill begun with mirror mode off stays on its side', async () => {
    workspace.mirror = false;
    workspace.editorTab = 'input';
    project.paintStroke(Array.from({ length: 10 }, (_, y) => ({ x: 39, y, alpha: 1 })), '#ffffff');
    project.commitEdit();
    await settle(project);
    workspace.editFgColor = '#00ff00';
    const ctx = { project, workspace, view: 'input' };
    await withMirror(project, strokeMirror(workspace, project, getTool('bucket')), () => fillSolid(ctx, { x: 5.5, y: 3.5 }));
    expect(project.paintLayer.pixelAt(5, 3)?.g).toBe(255);
    expect(project.paintLayer.pixelAt(74, 3)).toBeFalsy();
  });

  test('the Gradient\'s fill, written a frame later, is laid on the other side too', async () => {
    workspace.editorTab = 'input';
    project.paintStroke(Array.from({ length: 10 }, (_, y) => ({ x: 39, y, alpha: 1 })), '#ffffff');
    project.commitEdit();
    await settle(project);
    Object.assign(workspace, { editFgColor: '#ff0000', editBgColor: '#0000ff', editFgNone: false, editBgNone: false });
    drag(getTool('gradient'), 'input', { x: 2.5, y: 3.5 }, { x: 30.5, y: 3.5 });
    await settle(project);
    const left = project.paintLayer.pixelAt(5, 3);
    expect(left).toBeTruthy();
    expect(project.paintLayer.pixelAt(74, 3)).toEqual(left); // as drawn, not blended again from the other end
  });

  test('the mirrored copy keeps to the selection', () => {
    workspace.selection = { c0: 0, r0: 0, c1: 39, r1: 4 };
    drag(getTool('brush'), 'input', { x: 5.5, y: 3.5 });
    expect(project.paintLayer.pixelAt(5, 3)).toBeTruthy();
    expect(project.paintLayer.pixelAt(74, 3)).toBeFalsy();
  });

  test('Delete, paste and a floating move stay unmirrored', () => {
    const rect = { c0: 2, r0: 0, c1: 4, r1: 1 };
    const ids = [project.editId];
    const lay = (col, char) => project.writeEditCells([{ col, row: 0, attrs: { char, fg: '#ff0000' } }]);
    lay(2, 'A'); lay(77, 'Z');
    project.commitEdit();
    const block = project.copySelection(rect, ids, { shapes: false });
    project.deleteSelection(rect, ids);
    expect(project.editCellAt(2, 0)).toBeFalsy();
    expect(project.editCellAt(77, 0)?.char).toBe('Z'); // the mirrored side of the deleted cell is left
    project.pasteSelection(block, 10, 2);
    expect(project.editCellAt(10, 2)?.char).toBe('A'); // the copy from before the delete
    expect(project.editCellAt(69, 2)).toBeFalsy();
    lay(3, 'M');
    project.commitEdit();
    project.floatSelection(rect, ids, 2, 0);
    expect(project.editCellAt(5, 0)?.char).toBe('M');
    expect(project.editCellAt(74, 0)).toBeFalsy();
    expect(project.editCellAt(76, 0)).toBeFalsy();
  });

  test('a rectangle with Single laid on the left half is turned on the right', () => {
    Object.assign(workspace, { shapeKind: 'rect', shapeDrawWith: 'single', editBgNone: true, editFgColor: '#ffffff' });
    drag(getTool('shapes'), 'output', at(2, 0), at(8, 3));
    const ch = (c, r) => project.editCellAt(c, r)?.char;
    expect([ch(2, 0), ch(8, 0), ch(2, 3), ch(8, 3)]).toEqual(['┌', '┐', '└', '┘']);
    expect([ch(77, 0), ch(71, 0), ch(77, 3), ch(71, 3)]).toEqual(['┐', '┌', '┘', '└']);
  });
});
