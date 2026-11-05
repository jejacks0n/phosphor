// Cells that stay on their frame (the movie's cellsCarry off): a cell drawn on a frame plays there only, the frame
// before shows as the ghost to draw by, and shapes and tweens carry as ever.
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

test('the frame before shows as the ghost, owned by neither, and only the frame just before', async () => {
  const { project } = await boing();
  expect(charAt(project, 1, 1)).toBe('A');
  expect(project.inheritedCells().has(cellIndex(1, 1, project.cols))).toBe(true);
  project.showFrame(0);
  project.showFrame(2);
  expect(project.frames[2].changes.size).toBe(0);
  project.addFrame('blank');
  expect(charAt(project, 1, 1)).not.toBe('A');
});

test('typing the same character again on the next frame keeps it there', async () => {
  const { project } = await boing();
  type(project, 1, 1, 'A');
  project.showFrame(0);
  expect(project.frames[2].changes.has(cellKey(1, 1))).toBe(true);
  expect(project.resolvedOf(2).has(cellKey(1, 1))).toBe(true);
});

test('with the ghost off, the frame before doesn\'t show', async () => {
  const { project, workspace } = await boing();
  const i = cellIndex(1, 1, project.cols);
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
