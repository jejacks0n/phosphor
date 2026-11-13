// The Pencil's and Brush's Half-block (ANSI view): each cell they paint becomes a real ▄ (the
// paint colors its halves) instead of the paint showing through the cell's own character. Erasing
// that paint in the Pixel view gives the cell its generated character back.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import eraser from '@/tools/eraser';

async function scene(settings = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(workspace, { editFgColor: '#ff0000', pencilDrawWith: 'half', brushDrawWith: 'half', editBrushSize: 3 }, settings);
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

test('with Colors only, a cell that shows no character (the black of an opened file\'s grown lines) takes the paint as a plain ▄', async () => {
  const { project, workspace } = await createTestApp();
  await project.openArtFile(new File(['ab  \nab  '], 'note.txt'), { layer: 'edit' });
  project.updateRows(40); // lines added under the art: the black base, converted
  await settle(project);
  Object.assign(workspace, { editFgColor: '#ffffff', pencilDrawWith: 'normal', brushDrawWith: 'normal', editBrushSize: 1, editBrushHardness: 100, editBrushFlow: 100 });
  // Grown cells holding a character (the seed is the document's own), each in its own background color.
  const hidden = project.cells.map((cell, i) => i).filter((i) => i >= 2 * project.cols && !['▄', ' '].includes(project.cells[i].char)).slice(0, 2);
  expect(hidden.map((i) => project.cells[i].fg.hex === project.cells[i].bg.hex)).toEqual([true, true]);
  const shows = (i) => { const { char, fg, bg } = project.cells[i]; return [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]; };
  for (const [tool, i] of [[pencil, hidden[0]], [brush, hidden[1]]]) {
    const col = i % project.cols, row = (i - col) / project.cols, ctx = { project, workspace, view: 'output' };
    tool.begin(ctx, { x: col + 0.5, y: 2 * row + 0.5 }, {}); // its top half
    tool.end(ctx);
    await settle(project);
    expect(shows(i), tool.id).toEqual(['▄', '#ffffff', '#000000']);
  }
  project.render(); // a whole render shows them the same way
  await settle(project);
  expect(hidden.map(shows)).toEqual([['▄', '#ffffff', '#000000'], ['▄', '#ffffff', '#000000']]);
});

test('with Colors only on the base, a cell that shows no character is pinned a ▄ the paint colors', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  project.useLayer('base');
  Object.assign(workspace, { editFgColor: '#ffffff', pencilDrawWith: 'normal' });
  const ctx = { project, workspace, view: 'output' };
  pencil.begin(ctx, { x: 0.5, y: 0.5 }, {});
  pencil.move(ctx, { x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }); // the top halves of row 0's first six cells
  pencil.end(ctx);
  await settle(project);
  const row = project.cells.slice(0, 6).map(({ char, fg, bg }) => [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]);
  expect(row).toEqual(Array(6).fill(['▄', '#ffffff', '#000000']));
});

test('with Colors only, a character the stroke itself paints into one color isn\'t made a ▄ by the rest of the stroke', async () => {
  const { project, workspace, charAt } = await scene({ pencilDrawWith: 'normal' });
  const i = project.cells.findIndex((cell) => cell.fg.hex !== cell.bg.hex && !['▄', '▀', '█', ' '].includes(cell.char));
  const col = i % project.cols, row = (i - col) / project.cols, { char, fg } = project.cells[i];
  workspace.editFgColor = fg.hex; // its top half painted in its own foreground: the cell is one color for a moment
  const ctx = { project, workspace, view: 'output' };
  pencil.begin(ctx, { x: col + 0.5, y: 2 * row + 0.5 }, {});
  pencil.move(ctx, { x: col + 0.5, y: 2 * row + 0.5 }, { x: col + 0.5, y: 2 * row + 1.5 }); // then its bottom half
  pencil.end(ctx);
  expect(charAt(col, row)).toBe(char);
});
