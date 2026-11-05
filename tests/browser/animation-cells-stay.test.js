// Cells that stay on their frame (the movie's cellsCarry off): a cell drawn on a frame plays there only, the frame
// before's picture shows as the ghost to draw by (only on screen: it's no cell of this frame's), and shapes and
// tweens carry as ever.
import { test, expect } from 'vitest';
import { createTestApp, loadImage } from '../support/app.js';
import { cellIndex } from '@/lib/Cells.js';
import { cellKey } from '@/document/editCells.js';
import { writeProject, readProject } from '@/document/projectIO.js';

const INK = { fg: '#ffee00', bg: '#0044aa' };
const SQUARE = { z: 0, closed: true, fill: '#ff0000', stroke: null, width: 1, m: [1, 0, 0, 1, 0, 0],
  points: [[10, 10, 0, 0, 0, 0, 0], [14, 10, 0, 0, 0, 0, 0], [14, 14, 0, 0, 0, 0, 0], [10, 14, 0, 0, 0, 0, 0]] };

async function animated() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  return { project, workspace };
}
const type = (project, col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };
const charAt = (project, col, row) => project.cells[cellIndex(col, row, project.cols)].char;

// Frame 0 with a shape, frame 1 with A typed at (1, 1), frame 2 a Blank after it, showing frame 2.
async function boing() {
  const { project, workspace } = await animated();
  const shape = project.addShape(SQUARE);
  project.addFrame('blank');
  type(project, 1, 1, 'A');
  project.addFrame('blank');
  project.setCellsCarry(false);
  project.setAnimate(true); // the ghost shows with Animate on
  return { project, workspace, shape };
}

test('a cell drawn on a frame plays there only when cells stay, while shapes carry on', async () => {
  const { project, shape } = await boing();
  expect(project.resolvedOf(1).has(cellKey(1, 1))).toBe(true);
  expect(project.resolvedOf(2).has(cellKey(1, 1))).toBe(false);
  expect(project.resolvedOf(2).has(shape)).toBe(true);
  expect(project.frames[2].changes.size).toBe(0);
});

test('the frame before isn\'t in the frame\'s cells: it shows as its picture, dimmed, only on screen', async () => {
  const { project } = await boing();
  const i = cellIndex(1, 1, project.cols);
  expect(project.editCells.has(cellKey(1, 1))).toBe(false);
  expect(charAt(project, 1, 1)).not.toBe('A'); // cells: what the frame is, and what exports
  await project.buildGhost();
  expect(project.shownCells[i].char).toBe('A');
  expect(project.shownCells[i].fg.hex).not.toBe(INK.fg); // dimmed toward what's under it
  project.addFrame('blank'); // only the frame just before
  await project.buildGhost();
  expect(project.shownCells[i].char).not.toBe('A');
});

test('moving a selection over the ghost doesn\'t make the frame own it', async () => {
  const { project } = await boing();
  await project.buildGhost();
  project.moveSelection({ c0: 0, r0: 0, c1: 3, r1: 3 }, { base: false, edit: true }, 4, 4);
  project.showFrame(0);
  expect(project.frames[2].changes.size).toBe(0);
});

test('drawing beside the ghost leaves it the frame before\'s, and the ghost goes where this frame draws', async () => {
  const { project } = await boing();
  type(project, 5, 5, 'B');
  await project.buildGhost();
  expect(project.shownCells[cellIndex(1, 1, project.cols)].char).toBe('A');
  type(project, 1, 1, 'C');
  expect(project.shownCells[cellIndex(1, 1, project.cols)].char).toBe('C');
  project.showFrame(0);
  expect([...project.frames[2].changes.keys()].sort()).toEqual([cellKey(1, 1), cellKey(5, 5)].sort());
});

test('carrying switched on, a stroke undone and carrying switched off again leave the frame nothing of the frame before\'s', async () => {
  const { project } = await boing();
  type(project, 5, 5, 'B');
  project.setCellsCarry(true); // the frame before's A carries into this one
  type(project, 7, 7, 'C');
  project.setCellsCarry(false);
  project.undo(); // C
  project.undo(); // B
  project.showFrame(0);
  expect(project.frames[2].changes.size).toBe(0);
  expect(project.resolvedOf(2).has(cellKey(1, 1))).toBe(false);
});

test('typing the same character again on the next frame keeps it there', async () => {
  const { project } = await boing();
  type(project, 1, 1, 'A');
  project.showFrame(0);
  expect(project.frames[2].changes.has(cellKey(1, 1))).toBe(true);
  expect(project.resolvedOf(2).has(cellKey(1, 1))).toBe(true);
});

test('with the ghost off, or at 0%, the frame before doesn\'t show', async () => {
  const { project, workspace } = await boing();
  const i = cellIndex(1, 1, project.cols);
  await project.buildGhost();
  workspace.ghostStrength = 0;
  expect(project.shownCells[i].char).not.toBe('A');
  workspace.ghostStrength = 35;
  workspace.ghost = false;
  expect(project.shownCells[i].char).not.toBe('A');
  project.setCellsCarry(true);
  expect(project.shownCells[i].char).toBe('A'); // carried: it's the frame's, shown solid
});

test('turning carrying back on carries the cell again, and a project keeps the choice', async () => {
  const { project } = await boing();
  const parts = await readProject(new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'm.phosphor'));
  expect(parts.animation.cellsCarry).toBe(false);
  project.setCellsCarry(true);
  expect(project.resolvedOf(2).has(cellKey(1, 1))).toBe(true);
  const fresh = await animated();
  expect(fresh.project.cellsCarry).toBe(true);
});

test('deleting a frame leaves the next playing only its own cells', async () => {
  const { project } = await boing();
  type(project, 5, 5, 'B');
  project.showFrame(1);
  project.deleteFrame();
  expect(project.resolvedOf(1).has(cellKey(5, 5))).toBe(true);
  expect(project.resolvedOf(1).has(cellKey(1, 1))).toBe(false); // frame 1's A went with it
});

test('with the ghost off the ghost has no strength, on every view', async () => {
  const { project, workspace } = await boing();
  expect(project.ghostStrength).toBe(workspace.ghostStrength / 100);
  workspace.ghost = false;
  expect(project.ghostStrength).toBe(0);
});

test('what\'s drawn over the ghost shows at once, before the stroke ends', async () => {
  const { project } = await boing();
  await project.buildGhost();
  expect(project.shownCells[cellIndex(1, 1, project.cols)].char).toBe('A');
  project.typeAt(1, 1, 'C', INK); // the typing run still open
  expect(project.shownCells[cellIndex(1, 1, project.cols)].char).toBe('C');
});
