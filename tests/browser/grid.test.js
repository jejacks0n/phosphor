// Changing the grid's size (docs/layers.md): with nothing on the edit layer it rescales (the image
// refits, the base's pins move with it); with edits it's a canvas resize (everything stays put, the
// grid gains or loses cells at the right and bottom, and what's past the edge comes back when it
// grows). Random characters belong to their cell's position, so they survive a width change.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';

async function grid(cols = 40, rows = 40) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  return { project, workspace };
}

async function resize(project, cols, rows = project.rows) {
  project.cols = cols;
  project.rows = rows;
  await settle(project);
}

const pinned = (project) => [...project.baseRecords.pins.keys()];

test('a rescale with an empty edit layer moves the pins with the picture', async () => {
  const { project } = await grid();
  project.beginEdit();
  project.eraseBase([{ col: 10, row: 5 }]);
  project.commitEdit();
  expect(pinned(project)).toEqual(['10,5']);
  await resize(project, 80, 80);
  const at = pinned(project).map((key) => key.split(',').map(Number));
  expect(at.length).toBeGreaterThan(0);
  for (const [col, row] of at) {
    expect(col >= 20 && col <= 21 && row >= 10 && row <= 11).toBe(true);
    expect(project.cells[cellIndex(col, row, 80)].char).toBe(' ');
  }
});

test('a canvas resize keeps what goes past the edge and brings it back', async () => {
  const { project } = await grid();
  project.typeAt(30, 5, 'X', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  project.paintStroke([{ x: 35, y: 30, alpha: 1 }, { x: 35, y: 31, alpha: 1 }], '#ff0000');
  project.commitEdit();
  const fit = JSON.stringify(project.fit);
  const kept = project.cells.slice(0, 20).map((c) => c.char + c.fg.hex + c.bg.hex);

  await resize(project, 20, 20);
  expect(project.cells).toHaveLength(20 * 10);
  expect(JSON.stringify(project.fit)).toBe(fit); // the picture stays where it is
  expect(project.cells.slice(0, 20).map((c) => c.char + c.fg.hex + c.bg.hex)).toEqual(kept);

  await resize(project, 40, 40);
  expect(project.cells[cellIndex(30, 5, 40)].char).toBe('X');
  const painted = project.cells[cellIndex(35, 15, 40)];
  expect([painted.fg.hex, painted.bg.hex]).toContain('#ff0000');
});

test('random characters stay with their cells when the width changes', async () => {
  const { project } = await grid(40, 40);
  expect(project.processParams.charMode).toBe('random');
  const chars = (cols) => Array.from({ length: 10 }, (_, row) => Array.from({ length: 10 }, (_, col) => project.cells[cellIndex(col, row, cols)].char).join(''));
  const before = chars(40);
  await resize(project, 60, 40);
  expect(chars(60)).toEqual(before);
});
