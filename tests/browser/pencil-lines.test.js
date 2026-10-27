// The Pencil's Single and Double (ANSI view): drag from cell to cell and each cell gets the box piece
// its path needs, turning corners and joining the lines it crosses or lands on (Connect).
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import pencil from '@/tools/pencil';

async function scene(settings = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(workspace, { pencilDrawWith: 'single', pencilConnect: true, editFgColor: '#ffffff', editBgNone: true }, settings);
  // A drag through cells (col, row): positions at their centers, in grid pixels.
  const at = ([col, row]) => ({ x: col + 0.5, y: 2 * row + 1 });
  const ctx = { project, workspace, view: 'output' };
  const drag = (...cells) => {
    pencil.begin(ctx, at(cells[0]), {});
    for (let i = 1; i < cells.length; i++) pencil.move(ctx, at(cells[i - 1]), at(cells[i]));
    pencil.end(ctx);
  };
  const shiftClick = (cell) => {
    pencil.begin(ctx, at(cell), { shiftKey: true });
    pencil.end(ctx);
  };
  const row = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => project.cells[cellIndex(c0 + i, r, project.cols)].char).join('');
  const col = (c, r0, r1) => Array.from({ length: r1 - r0 + 1 }, (_, i) => project.cells[cellIndex(c, r0 + i, project.cols)].char).join('');
  return { project, workspace, drag, shiftClick, row, col };
}

test('a drag right, then down, draws a line that turns the corner', async () => {
  const { drag, row, col } = await scene();
  drag([2, 2], [8, 2], [8, 6]);
  expect(row(2, 2, 8)).toBe('──────┐');
  expect(col(8, 3, 6)).toBe('││││');
});

test('a drag that comes back across itself joins where it crosses', async () => {
  const { drag, row, col } = await scene();
  drag([5, 2], [5, 8], [8, 8], [8, 5], [2, 5]); // down, right, up, then left across the first leg
  expect(row(5, 2, 8)).toBe('───┼──┐'); // the last corner comes up from below and turns left
  expect(col(5, 2, 8)).toBe('│││┼││└');
});

test('with Connect it joins the lines it crosses or lands on; without, it draws over them', async () => {
  const { drag, row } = await scene();
  drag([10, 1], [10, 9]);           // │ down column 10
  drag([4, 5], [16, 5]);            // ─ across it
  expect(row(5, 9, 11)).toBe('─┼─');
  drag([20, 2], [30, 2]);           // ─ along row 2
  drag([25, 8], [25, 2]);           // up onto it, from below
  expect(row(2, 24, 26)).toBe('─┬─');

  const off = await scene({ pencilConnect: false });
  off.drag([10, 1], [10, 9]);
  off.drag([4, 5], [16, 5]);
  expect(off.row(5, 9, 11)).toBe('───');
});

test('Double draws double lines, and joins single ones with mixed pieces', async () => {
  const { drag, workspace, row, col } = await scene({ pencilDrawWith: 'double' });
  drag([2, 2], [8, 2], [8, 6]);
  expect(row(2, 2, 8)).toBe('══════╗');
  workspace.pencilDrawWith = 'single';
  drag([4, 0], [4, 4]); // a single line down across the double one
  expect(col(4, 1, 3)).toBe('│╪│');
});

test('a stroke is one undo step; a click without a drag draws nothing', async () => {
  const { project, drag, row } = await scene();
  const before = row(3, 2, 10);
  drag([2, 3], [10, 3]);
  expect(row(3, 2, 10)).toBe('─────────');
  project.undo();
  expect(row(3, 2, 10)).toBe(before);
  drag([5, 3]);
  expect(row(3, 2, 10)).toBe(before);
});

test('Shift-click draws a line from where the last stroke ended, turning the corner', async () => {
  const { drag, shiftClick, row, col } = await scene();
  drag([2, 2], [8, 2]);
  shiftClick([8, 6]);
  expect(row(2, 2, 8)).toBe('──────┐');
  expect(col(8, 3, 6)).toBe('││││');
});

test('Normal and Half-block paint as before, and the pixel view always paints', async () => {
  const { project, workspace, drag, row } = await scene({ pencilDrawWith: 'half' });
  drag([2, 3], [6, 3]);
  expect(row(3, 2, 6)).toBe('▄▄▄▄▄');
  workspace.pencilDrawWith = 'normal';
  const before = row(5, 2, 6);
  drag([2, 5], [6, 5]);
  expect(row(5, 2, 6)).toBe(before); // the paint shows through each cell's own character
  workspace.pencilDrawWith = 'single';
  pencil.begin({ project, workspace, view: 'input' }, { x: 2.5, y: 15 }, {});
  pencil.move({ project, workspace, view: 'input' }, { x: 2.5, y: 15 }, { x: 6.5, y: 15 });
  pencil.end({ project, workspace, view: 'input' });
  expect(row(7, 2, 6)).not.toMatch(/─/);
});
