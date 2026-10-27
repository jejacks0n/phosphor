// Shift-click with the Pencil or Brush draws a straight line from where the last stroke ended, as one
// undo step; then the stroke goes on as usual.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';

async function canvas() {
  const { project, workspace } = await createTestApp();
  project.cols = 40;
  project.rows = 40;
  await project.setBlankCanvas();
  await settle(project);
  Object.assign(workspace, { editorTab: 'input', editFgColor: '#ff0000' });
  const ctx = { project, workspace, view: 'input' };
  const stroke = (tool, points, shiftKey = false) => {
    tool.begin(ctx, points[0], { shiftKey });
    for (let i = 1; i < points.length; i++) tool.move(ctx, points[i - 1], points[i]);
    tool.end(ctx);
  };
  const paintedAt = (x, y) => !!project.paintLayer?.pixelAt(x, y);
  return { project, stroke, paintedAt };
}

test('Shift-click with the Pencil draws a line from where the last stroke ended, one undo step', async () => {
  const { project, stroke, paintedAt } = await canvas();
  stroke(pencil, [{ x: 2.5, y: 2.5 }, { x: 5.5, y: 2.5 }]);
  stroke(pencil, [{ x: 15.5, y: 2.5 }], true);
  for (let x = 5; x <= 15; x++) expect(paintedAt(x, 2), `x ${x}`).toBe(true);
  project.undo();
  expect(paintedAt(10, 2)).toBe(false); // the line, and only the line, is undone
  expect(paintedAt(4, 2)).toBe(true);
});

test('a plain click paints just where it is; Shift-click before anything was painted is a plain click', async () => {
  const { stroke, paintedAt } = await canvas();
  stroke(pencil, [{ x: 20.5, y: 20.5 }], true); // nothing painted yet: no line
  expect(paintedAt(20, 20)).toBe(true);
  expect(paintedAt(10, 20)).toBe(false);
  stroke(pencil, [{ x: 30.5, y: 20.5 }]);
  expect(paintedAt(25, 20)).toBe(false);
});

test('Shift-click with the Brush draws its line too, and it carries on from the Pencil\'s last stroke', async () => {
  const { stroke, paintedAt } = await canvas();
  stroke(pencil, [{ x: 5.5, y: 10.5 }]);
  stroke(brush, [{ x: 25.5, y: 10.5 }], true);
  for (let x = 6; x <= 25; x++) expect(paintedAt(x, 10), `x ${x}`).toBe(true);
});
