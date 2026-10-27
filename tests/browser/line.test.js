// The Shapes tool's Line: a straight line from where the drag starts to where it ends, in the
// foreground color. Painted one pixel thick in the Pixel view (and as half-blocks in the ANSI view);
// whole cells in Full block or Character; and in Single or Double box lines it runs straight across
// or down, whichever the drag is closer to, joining the lines it crosses with Connect.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';

async function scene(settings) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  const { default: shapes } = await import('@/tools/shapes');
  Object.assign(workspace, { shapeKind: 'line', editFgColor: '#ff0000', editBgColor: '#0000ff', editBgNone: false, editBrushOpacity: 100 }, settings);
  const draw = (view, from, to) => {
    const ctx = { project, workspace, view };
    shapes.begin(ctx, from);
    shapes.move(ctx, from, to);
    shapes.end(ctx);
  };
  const charAt = (col, row) => project.cells[cellIndex(col, row, project.cols)].char;
  return { project, workspace, draw, charAt };
}

const painted = (project) => {
  const out = [];
  for (let y = 0; y < project.rows; y++) for (let x = 0; x < project.cols; x++) {
    const p = project.paintLayer?.pixelAt(x, y);
    if (p) out.push([x, y, p.r, p.g, p.b, Math.round(p.a * 255)]);
  }
  return out;
};

test('in the Pixel view a line paints one pixel per step in the foreground color, and nothing else (no fill)', async () => {
  const { project, draw } = await scene();
  draw('input', { x: 2.5, y: 3.5 }, { x: 12.5, y: 7.5 });
  const pixels = painted(project);
  expect(pixels).toHaveLength(11); // one per column, 2..12
  expect(pixels.every(([, , r, g, b, a]) => r === 255 && g === 0 && b === 0 && a === 255)).toBe(true);
  expect(pixels.map(([x, y]) => `${x},${y}`)).toEqual(expect.arrayContaining(['2,3', '12,7']));
});

test('as Half-block in the ANSI view it paints the same line at grid resolution', async () => {
  const { project, draw } = await scene({ shapeDrawWith: 'half', shapeBlockChars: false });
  draw('output', { x: 2.5, y: 3.5 }, { x: 12.5, y: 7.5 });
  expect(painted(project)).toHaveLength(11);
});

test('as Single it runs straight across, or down, whichever the drag is closer to', async () => {
  const { draw, charAt } = await scene({ shapeDrawWith: 'single', shapeConnect: false });
  draw('output', { x: 3.5, y: 8.5 }, { x: 15.5, y: 12.5 }); // 12 across, 2 rows down: across, on row 4
  for (let col = 3; col <= 15; col++) expect(charAt(col, 4)).toBe('─');
  expect(charAt(15, 6)).not.toBe('─');
  draw('output', { x: 30.5, y: 2.5 }, { x: 33.5, y: 30.5 }); // 3 across, 14 rows down: down, in column 30
  for (let row = 1; row <= 15; row++) expect(charAt(30, row)).toBe('│');
});

test('as Double with Connect it joins the line it crosses', async () => {
  const { draw, charAt } = await scene({ shapeDrawWith: 'double', shapeConnect: true });
  draw('output', { x: 10.5, y: 2.5 }, { x: 10.5, y: 20.5 });  // ║ down column 10, rows 1..10
  draw('output', { x: 4.5, y: 10.5 }, { x: 16.5, y: 10.5 });  // ═ across row 5
  expect(charAt(10, 5)).toBe('╬');
  expect(charAt(4, 5)).toBe('═');
});

test('as Character or Full block it draws whole cells along the line, diagonals too', async () => {
  const { draw, charAt, workspace } = await scene({ shapeDrawWith: 'char' });
  workspace.activeChar = '*';
  draw('output', { x: 2.5, y: 2.5 }, { x: 8.5, y: 14.5 }); // cells (2,1) to (8,7): a diagonal
  for (let i = 0; i <= 6; i++) expect(charAt(2 + i, 1 + i)).toBe('*');
  expect(charAt(3, 1)).not.toBe('*');

  const full = await scene({ shapeDrawWith: 'full', shapeBlockChars: true });
  full.draw('output', { x: 2.5, y: 2.5 }, { x: 8.5, y: 14.5 });
  for (let i = 0; i <= 6; i++) expect(full.charAt(2 + i, 1 + i)).toBe('█');
});
