// The Gradient: a drag draws the line, the release fills the Paint Bucket's area from FG at the press to BG.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import gradient from '@/tools/gradient';

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
const row = (project, r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, k) => project.cells[cellIndex(c0 + k, r, project.cols)].char).join('');

const GRADIENT = { editFgColor: '#ff0000', editBgColor: '#0000ff', editFgNone: false, editBgNone: false };
function dragLine(ctx, from, to) {
  const started = gradient.begin(ctx, from, ev);
  if (started) {
    gradient.move(ctx, from, to);
    gradient.end(ctx);
  }
  return started;
}
const paintAt = (project, x, y) => { const p = project.paintLayer?.pixelAt(x, y); return p ? [p.r, p.g, p.b] : null; };

test('Linear, Fill: Normal: each grid pixel its blend, FG at the press and BG past the release, as one undo step', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  project.clearHistory();
  Object.assign(workspace, GRADIENT, { gradientShape: 'linear' });
  expect(dragLine(ctx, { x: 0, y: 15 }, { x: 30, y: 15 })).toBe(true);
  expect(workspace.shapeDrag).toBeNull();
  await settle(project);
  expect(paintAt(project, 0, 3)).toEqual([251, 0, 4]);
  expect(paintAt(project, 29, 50)).toEqual([4, 0, 251]);
  expect(paintAt(project, 15, 0)).toEqual([123, 0, 132]); // square to the line: every row alike
  expect(paintAt(project, 15, 59)).toEqual([123, 0, 132]);
  project.undo();
  expect(project.canUndo).toBe(false);
  expect(paintAt(project, 15, 0)).toBeNull();
});

test('Spherical, PIXEL tab: the press is the center, the line\'s length the radius', async () => {
  const { project, workspace } = await blank(30, 60);
  workspace.editorTab = 'input';
  const ctx = { project, workspace, view: 'input' };
  Object.assign(workspace, GRADIENT, { gradientShape: 'spherical' });
  dragLine(ctx, { x: 15.5, y: 30.5 }, { x: 15.5, y: 40.5 });
  await settle(project);
  expect(paintAt(project, 15, 30)).toEqual([255, 0, 0]);
  expect(paintAt(project, 20, 30)).toEqual([128, 0, 128]); // halfway out, any direction
  expect(paintAt(project, 15, 25)).toEqual([128, 0, 128]);
  expect(paintAt(project, 0, 0)).toEqual([0, 0, 255]);     // past the radius
});

test('Shift snaps the line to 45°', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, GRADIENT, { gradientShape: 'linear', isShiftPressed: true });
  gradient.begin(ctx, { x: 0, y: 10 }, ev);
  gradient.move(ctx, { x: 0, y: 10 }, { x: 20, y: 14 });
  expect(workspace.shapeDrag).toEqual({ from: { x: 0, y: 10 }, to: { x: 20, y: 10 }, line: true });
  gradient.end(ctx);
  workspace.isShiftPressed = false;
  await settle(project);
  expect(paintAt(project, 10, 0)).toEqual(paintAt(project, 10, 59)); // straight across: every row alike
});

test('Linear, Fill: Cells: blend characters in the two colors only, inside the selection, over the paint', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  project.paintStroke([{ x: 3, y: 10, alpha: 1 }], '#00ff00');
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, GRADIENT, { gradientShape: 'linear', bucketFillWith: 'cells', bucketMatch: { fg: true, bg: true, char: false }, editFillTolerance: 100, selection: { c0: 0, r0: 5, c1: 29, r1: 5 } });
  expect(dragLine(ctx, { x: 4, y: 11 }, { x: 24, y: 11 })).toBe(true);
  await settle(project);
  const line = row(project, 5, 0, 29);
  expect(line.slice(0, 4)).toBe('████');
  expect(line.slice(25)).toBe('     ');
  for (const ch of '▓▒░') expect(line).toContain(ch);
  for (let col = 0; col < 30; col++) {
    const cell = project.cells[cellIndex(col, 5, project.cols)];
    expect([cell.fg.hex, cell.bg.hex]).toEqual(['#ff0000', '#0000ff']);
  }
  expect(project.cellHasPaint(3, 5)).toBe(false);
  expect(project.editCellAt(0, 4)).toBeFalsy(); // outside the selection
  expect(project.editCellAt(0, 6)).toBeFalsy();
});

test('a click without a drag fills nothing (the Paint Bucket fills solid); a drag with BG None fills nothing and says why', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, GRADIENT, { gradientShape: 'linear' });
  project.clearHistory();
  dragLine(ctx, { x: 5.2, y: 5.2 }, { x: 5.7, y: 5.6 });
  await settle(project);
  expect(project.canUndo).toBe(false);
  expect(paintAt(project, 20, 40)).toBeNull();

  const { toastMessage } = await import('@/composables/useToast');
  workspace.editBgNone = true;
  dragLine(ctx, { x: 0, y: 0 }, { x: 20, y: 0 });
  await settle(project);
  expect(project.canUndo).toBe(false);
  expect(paintAt(project, 20, 40)).toBeNull();
  expect(toastMessage.value).toMatch(/needs both a foreground and a background color/);
});

test('a press outside the selection starts no line', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  Object.assign(workspace, GRADIENT, { gradientShape: 'spherical', selection: { c0: 0, r0: 0, c1: 4, r1: 4 } });
  expect(gradient.begin(ctx, { x: 20, y: 20 }, ev)).toBe(false);
  expect(workspace.shapeDrag).toBeNull();
  workspace.bucketFillWith = 'cells';
  expect(gradient.begin(ctx, { x: 20, y: 20 }, ev)).toBe(false);
});

test('typed text stays a wall, and with Animate on the gradient lands on the frame showing', async () => {
  const { project, workspace } = await blank(30, 60);
  const ctx = { project, workspace, view: 'output' };
  project.setAnimate(true);
  project.addFrame('blank');
  project.showFrame(1);
  project.typeAt(10, 10, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  await settle(project);
  Object.assign(workspace, GRADIENT, { gradientShape: 'linear' });
  dragLine(ctx, { x: 0, y: 0 }, { x: 30, y: 0 });
  await settle(project);
  expect(project.cellHasPaint(10, 10)).toBe(false);
  expect(project.cellHasPaint(20, 20)).toBe(true);
  project.showFrame(0);
  await settle(project);
  expect(project.cellHasPaint(20, 20)).toBe(false);
});
