// The Lines tool (ANSI view): drag from cell to cell and each cell gets the box piece its path needs,
// turning corners and joining the lines it crosses or lands on (Connect), in Single or Double.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import lines from '@/tools/lines';

async function scene(settings = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(workspace, { lineStyle: 'single', lineConnect: true, editFgColor: '#ffffff', editBgNone: true }, settings);
  // A drag through cells (col, row): positions at their centers, in grid pixels.
  const drag = (...cells) => {
    const at = ([col, row]) => ({ x: col + 0.5, y: 2 * row + 1 });
    const ctx = { project, workspace, view: 'output' };
    lines.begin(ctx, at(cells[0]), {});
    for (let i = 1; i < cells.length; i++) lines.move(ctx, at(cells[i - 1]), at(cells[i]));
    lines.end(ctx);
  };
  const row = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => project.cells[cellIndex(c0 + i, r, project.cols)].char).join('');
  const col = (c, r0, r1) => Array.from({ length: r1 - r0 + 1 }, (_, i) => project.cells[cellIndex(c, r0 + i, project.cols)].char).join('');
  return { project, workspace, drag, row, col };
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

  const off = await scene({ lineConnect: false });
  off.drag([10, 1], [10, 9]);
  off.drag([4, 5], [16, 5]);
  expect(off.row(5, 9, 11)).toBe('───');
});

test('Double draws double lines, and joins single ones with mixed pieces', async () => {
  const { drag, workspace, row, col } = await scene({ lineStyle: 'double' });
  drag([2, 2], [8, 2], [8, 6]);
  expect(row(2, 2, 8)).toBe('══════╗');
  workspace.lineStyle = 'single';
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
