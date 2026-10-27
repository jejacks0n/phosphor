// The Pencil's and Brush's Half-block (ANSI view): each cell they paint becomes a real ▄ (the
// paint colors its halves) instead of the paint showing through the cell's own character. Erasing
// that paint in the Pixel view gives the cell its generated character back.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import eraser from '@/tools/eraser';

async function scene(settings = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(workspace, { editFgColor: '#ff0000', pencilDrawWith: 'half', brushDrawWith: 'half', editBrushSize: 3, eraseLayers: { base: false, edit: true } }, settings);
  const use = (tool, view, points) => {
    const ctx = { project, workspace, view };
    tool.begin(ctx, points[0], {});
    for (let i = 1; i < points.length; i++) tool.move(ctx, points[i - 1], points[i]);
    tool.end(ctx);
  };
  const charAt = (col, row) => project.cells[cellIndex(col, row, project.cols)].char;
  return { project, workspace, use, charAt };
}

test('with Half-block, the Pencil and Brush make each cell they paint a ▄; without, the cell keeps its character', async () => {
  const { use, charAt } = await scene();
  const before = charAt(10, 5);
  use(pencil, 'output', [{ x: 10.5, y: 10.5 }]);
  expect(charAt(10, 5)).toBe('▄');
  use(brush, 'output', [{ x: 20.5, y: 10.5 }, { x: 24.5, y: 10.5 }]);
  for (let col = 20; col <= 24; col++) expect(charAt(col, 5)).toBe('▄');

  const off = await scene({ pencilDrawWith: 'normal', brushDrawWith: 'normal' });
  off.use(pencil, 'output', [{ x: 10.5, y: 10.5 }]);
  expect(off.charAt(10, 5)).toBe(before);
});

test('erasing that paint in the Pixel view brings the cell\'s own character back; half of it, the ▄ stays', async () => {
  const { use, charAt, workspace } = await scene();
  const before = [charAt(10, 5), charAt(12, 5)];
  use(pencil, 'output', [{ x: 10.5, y: 10.5 }, { x: 12.5, y: 10.5 }]); // pixel row 10: the top half of cell row 5
  use(pencil, 'output', [{ x: 12.5, y: 11.5 }]);                      // and the bottom half of cell (12, 5)
  workspace.editEraserSize = 1;
  use(eraser, 'input', [{ x: 10.5, y: 10.5 }]);  // all of (10, 5)'s paint
  use(eraser, 'input', [{ x: 12.5, y: 10.5 }]);  // half of (12, 5)'s
  expect(charAt(10, 5)).toBe(before[0]);
  expect(charAt(12, 5)).toBe('▄');
  use(eraser, 'input', [{ x: 12.5, y: 11.5 }]);  // the rest
  expect(charAt(12, 5)).toBe(before[1]);
});

test('a ▄ typed in Edit Mode (it has its own colors) stays when the paint over it is erased', async () => {
  const { project, use, charAt, workspace } = await scene({ pencilDrawWith: 'normal', brushDrawWith: 'normal' });
  project.typeAt(15, 5, '▄', { fg: '#ffffff' });
  project.commitEdit();
  use(pencil, 'input', [{ x: 15.5, y: 10.5 }]);
  workspace.editEraserSize = 1;
  use(eraser, 'input', [{ x: 15.5, y: 10.5 }]);
  expect(charAt(15, 5)).toBe('▄');
});

test('a Shift-click line in Half-block makes each cell along it a ▄', async () => {
  const { project, workspace, charAt } = await scene();
  const ctx = { project, workspace, view: 'output' };
  pencil.begin(ctx, { x: 5.5, y: 20.5 }, {});
  pencil.end(ctx);
  pencil.begin(ctx, { x: 25.5, y: 20.5 }, { shiftKey: true });
  pencil.end(ctx);
  for (let col = 5; col <= 25; col++) expect(charAt(col, 10), `col ${col}`).toBe('▄');
});
