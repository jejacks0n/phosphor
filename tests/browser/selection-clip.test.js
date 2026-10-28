// A selection stays while you use other tools, and the painting tools change only what's inside it.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import eraser from '@/tools/eraser';

const SEL = { c0: 5, r0: 5, c1: 9, r1: 7 };

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  workspace.editorTab = 'output';
  Object.assign(workspace, { editFgColor: '#ff0000', editBrushSize: 1, pencilDrawWith: 'normal', brushDrawWith: 'normal' });
  // A stroke through grid pixels, in the ANSI view.
  const use = (tool, points) => {
    const ctx = { project, workspace, view: 'output' };
    tool.begin(ctx, points[0], {});
    for (let i = 1; i < points.length; i++) tool.move(ctx, points[i - 1], points[i]);
    tool.end(ctx);
  };
  // The columns of a cell row that have paint, in c0..c1.
  const painted = (row, c0 = 0, c1 = 39) => Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i).filter((col) => project.cellHasPaint(col, row));
  const charAt = (col, row) => project.cells[cellIndex(col, row, project.cols)].char;
  return { project, workspace, use, painted, charAt };
}

const ROW6 = [{ x: 2.5, y: 12.5 }, { x: 14.5, y: 12.5 }]; // across cell row 6, cols 2 to 14
const INSIDE = [5, 6, 7, 8, 9];

test('the selection stays when another tool is chosen, held or released', async () => {
  const { workspace } = await scene();
  workspace.selection = { ...SEL };
  for (const step of [() => workspace.setActiveTool('brush'), () => workspace.setActiveTool('hand'), () => workspace.setActiveTool('picker'),
    () => workspace.holdTool('picker', 'alt'), () => workspace.releaseTool()]) {
    step();
    expect(workspace.selection).toEqual(SEL);
  }
});

test('the Pencil and Brush paint only inside the selection', async () => {
  const { workspace, use, painted, charAt } = await scene();
  workspace.selection = { ...SEL };
  use(pencil, ROW6);
  expect(painted(6)).toEqual(INSIDE);
  use(brush, [{ x: 2.5, y: 14.5 }, { x: 14.5, y: 14.5 }]); // cell row 7
  expect(painted(7)).toEqual(INSIDE);
  workspace.pencilDrawWith = 'half';
  use(pencil, [{ x: 2.5, y: 10.5 }, { x: 14.5, y: 10.5 }]); // cell row 5
  expect([2, 3, 4, 5, 9, 10, 11].map((col) => charAt(col, 5) === '▄')).toEqual([false, false, false, true, true, false, false]);
});

test('a stroke entirely outside the selection changes nothing and leaves no undo step', async () => {
  const { project, workspace, use, painted } = await scene();
  workspace.selection = { ...SEL };
  const version = project.history.version;
  use(pencil, [{ x: 20.5, y: 30.5 }, { x: 30.5, y: 30.5 }]);
  expect(painted(15)).toEqual([]);
  expect(project.history.version).toBe(version);
});

test('the Eraser erases only inside the selection, on both layers', async () => {
  const { project, workspace, use, painted } = await scene();
  use(pencil, ROW6);
  workspace.selection = { ...SEL };
  Object.assign(workspace, { editEraserSize: 1, eraseLayers: { base: true, edit: true } });
  use(eraser, ROW6);
  expect(painted(6, 2, 14)).toEqual([2, 3, 4, 10, 11, 12, 13, 14]);
  expect([3, 5, 9, 11].map((col) => project.baseColorAt(col, 12) === '#000000')).toEqual([false, true, true, false]);
});
