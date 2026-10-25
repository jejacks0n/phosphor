// The Paint Bucket: drawn text and box lines are walls the fill stops at and never covers.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import shapes from '@/tools/shapes';
import bucket from '@/tools/bucket';

async function blank(cols = 30, rows = 30) {
  const { project, workspace } = await createTestApp();
  project.cols = cols;
  project.rows = rows;
  await project.setBlankCanvas();
  project.render();
  await settle(project);
  workspace.editorTab = 'output';
  return { project, workspace };
}

const ev = { stopPropagation() {} };

test('a fill inside a box drawn with Shapes (Double) stays inside it, and the frame keeps its character', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  workspace.shapeDrawWith = 'double';
  workspace.editBgNone = true;
  workspace.editFgColor = '#ffffff';
  shapes.begin(ctx, { x: 5.5, y: 10.5 });
  shapes.move(ctx, { x: 5.5, y: 10.5 }, { x: 20.5, y: 30.5 });
  shapes.end(ctx);
  expect(project.cells[cellIndex(5, 5, project.cols)].char).toBe('╔');
  await settle(project);

  workspace.editFgColor = '#ff0000';
  bucket.begin(ctx, { x: 10.5, y: 20.5 }, ev);
  await settle(project);
  expect(project.paintLayer.colorAt(10, 20)).not.toBeNull(); // inside
  expect(project.paintLayer.colorAt(0, 0)).toBeNull();       // outside
  expect(project.cellHasPaint(5, 5)).toBe(false);            // the frame
});

test('a fill on the background leaves typed text readable', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  project.typeAt(2, 2, 'A', { fg: '#ffffff', bg: '#000000' });
  project.typeAt(4, 2, '漢', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  workspace.editFgColor = '#ff0000';
  bucket.begin(ctx, { x: 20.5, y: 20.5 }, ev);
  await settle(project);
  for (const col of [2, 4, 5]) expect(project.cellHasPaint(col, 2)).toBe(false);
  const cell = project.cells[cellIndex(2, 2, project.cols)];
  expect(cell.char).toBe('A');
  expect(cell.fg.hex).not.toBe(cell.bg.hex);
});

test('a box hidden under paint of one color isn\'t a wall: the fill covers what you see', async () => {
  const { project, workspace } = await blank();
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, { shapeKind: 'rect', shapeDrawWith: 'single', editBgNone: true, editFgColor: '#ffffff' });
  shapes.begin(ctx, { x: 8.5, y: 8.5 });
  shapes.move(ctx, { x: 8.5, y: 8.5 }, { x: 20.5, y: 20.5 });
  shapes.end(ctx); // cells 8..20, rows 4..10
  const pixels = [];
  for (let y = 4; y < 26; y++) for (let x = 4; x < 26; x++) pixels.push({ x, y, alpha: 1 });
  project.paintStroke(pixels, '#00aa00'); // over the whole box: its lines are green on green
  project.commitEdit();
  await settle(project);

  workspace.editFgColor = '#ff0000';
  bucket.begin(ctx, { x: 5.5, y: 5.5 }, ev);
  await settle(project);
  expect(project.paintLayer.colorAt(14, 14)).toEqual({ r: 255, g: 0, b: 0 }); // inside the hidden box
});
