// Mirror mode on the project store: the edit layer's writes lay a mirrored copy while the store carries a mark.
import { describe, test, expect, beforeEach } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { mirrorAxes, withMirror } from '@/lib/mirror.js';

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
