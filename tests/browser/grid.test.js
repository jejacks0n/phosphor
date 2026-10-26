// Changing the grid's size (docs/layers.md): with nothing on the edit layer it rescales (the image
// refits, the base's pins move with it); with edits it's a canvas resize (everything stays put, the
// grid gains or loses cells at the right and bottom, and what's past the edge comes back when it
// grows). Random characters belong to their cell's position, so they survive a width change.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex, MAX_LINES, MAX_CELLS } from '@/lib/Cells';

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

test('a narrow grid runs to the line limit; a wider one stops at the cell budget', async () => {
  const { project } = await grid(80, 40);
  project.aspectLock = false;
  project.updateRows(50_000);
  expect(project.rows).toBe(2 * MAX_LINES);
  expect(project.maxCols).toBe(MAX_CELLS / MAX_LINES);
  project.updateCols(300);
  expect([project.cols, project.rows]).toEqual([MAX_CELLS / MAX_LINES, 2 * MAX_LINES]);
});

test('a tall picture opens at the current width, and can grow as large as the limits allow', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tall.png'); // 40x1200, at the default 80 columns
  expect([project.cols, project.rows]).toEqual([80, 2400]);
  expect([project.maxCols, project.maxRows]).toEqual([182, 5460]); // aspect locked: the cell budget binds
});

test('before there is a picture, the aspect lock has no shape to keep: rows and columns set alone', async () => {
  const { project } = await createTestApp();
  expect(project.aspectLock).toBe(true);
  project.updateRows(2000);
  expect([project.cols, project.rows]).toEqual([80, 2000]);
  expect(project.maxRows).toBe(2 * MAX_LINES);
});

test('a new blank canvas opens at the full line limit', async () => {
  const { project } = await createTestApp();
  project.cols = 80;
  project.rows = 2 * MAX_LINES; // its picture at 10 pixels a cell would be past what a canvas can be
  await project.setBlankCanvas();
  await settle(project);
  expect(project.cells).toHaveLength(80 * MAX_LINES);
  expect(new Set(project.cells.map((c) => c.bg.hex))).toEqual(new Set(['#000000']));
});

test('a picture as long as the grid, longer than the GPU draws, keeps its colors to its last line', async () => {
  const { project } = await createTestApp();
  const picture = Object.assign(document.createElement('canvas'), { width: 80, height: 20_000 }); // past 16384 (8192 here, on software WebGL)
  const ctx = picture.getContext('2d');
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(0, 0, 80, 20_000);
  const blob = await new Promise((resolve) => picture.toBlob(resolve, 'image/png'));
  await project.setImageFromFile(new File([blob], 'long.png', { type: 'image/png' }));
  project.render();
  await settle(project);
  const lines = project.rows / 2;
  expect(lines).toBe(MAX_LINES);
  for (const row of [0, Math.floor(lines / 2), lines - 1]) expect(project.cells[cellIndex(10, row, project.cols)].bg.hex).toBe('#3366cc');
});

// A blank canvas at the full line limit: more rows than software WebGL draws (8192), as on a weaker
// GPU.
async function longBlank() {
  const { project } = await createTestApp();
  project.cols = 80;
  project.rows = 2 * MAX_LINES;
  await project.setBlankCanvas();
  await settle(project);
  return project;
}

test('base edits under VGA keep their colors to the last line, longer than the GPU draws', async () => {
  const project = await longBlank();
  project.quantize = 'vga';
  await settle(project);
  project.beginEdit();
  project.writeBase([100, 101, 9000, 9001].map((y) => ({ x: 10, y, hex: '#ff0000' })));
  project.commitEdit();
  for (const row of [50, 4500]) expect(project.cells[cellIndex(10, row, 80)].bg.hex).toBe('#ff0000');
});

test('Into the image on a grid longer than the GPU processes keeps the drawing (it merges exactly)', async () => {
  const project = await longBlank();
  for (const y of [100, 101, 9000, 9001]) project.paintStroke([{ x: 10, y, alpha: 1 }], '#ff0000');
  project.commitEdit();
  await project.mergeIntoPicture();
  await settle(project);
  for (const row of [50, 4500]) expect(project.cells[cellIndex(10, row, 80)].bg.hex).toBe('#ff0000');
  expect(project.hasPaint).toBe(false);
});
