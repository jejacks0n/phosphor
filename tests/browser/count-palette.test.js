// The Number palette (quantize 'count'): its colours are picked from everything you see (the
// picture, the base's own pixels, the paint), so a colour you draw with gets a place in it, and
// a picture with no more colours than asked for keeps exactly its own.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';

const hexes = (project) => project.activePalette.map((p) => p.hex.toLowerCase()).sort();
const line = (y) => Array.from({ length: 10 }, (_, k) => ({ x: 5 + k, y, alpha: 1 }));

// What a full render gives now (the cells a stroke's live update must match).
async function fullRender(project) {
  project.render();
  await settle(project);
  return cellsKey(project);
}

test('a few-colour picture keeps its exact colours, and white paint is white', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tiny.gif', { cols: 20, rows: 20 });
  project.quantize = 'count';
  project.colorCount = 256;
  await settle(project);
  expect(hexes(project)).toEqual(['#0000ff', '#00ff00', '#ff0000'].concat('#000000').sort());

  project.paintStroke([...line(8), ...line(9)], '#ffffff');
  project.commitEdit();
  const painted = project.cells[4 * 20 + 8];
  expect([painted.fg.hex.toLowerCase(), painted.bg.hex.toLowerCase()]).toEqual(['#ffffff', '#ffffff']);
  expect(hexes(project)).toContain('#ffffff');
  expect(cellsKey(project)).toEqual(await fullRender(project));
});

test('with more colours than asked for, a stroke rebalances the palette across the picture, live', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.quantize = 'count';
  project.colorCount = 8;
  await settle(project);
  const before = hexes(project);

  project.paintStroke([...line(8), ...line(9), ...line(10), ...line(11)], '#ffffff');
  project.commitEdit();
  expect(hexes(project)).not.toEqual(before);
  expect(hexes(project)).toHaveLength(8);
  expect(cellsKey(project)).toEqual(await fullRender(project)); // untouched cells moved with it
});

test('base pixels count too, and undo brings the palette back', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tiny.gif', { cols: 20, rows: 20 });
  project.quantize = 'count';
  project.colorCount = 16;
  await settle(project);
  const before = hexes(project), cells = cellsKey(project);
  project.paintStroke(line(8), '#ff8800');
  project.commitEdit();
  project.mergeDown();
  await settle(project);
  expect(hexes(project)).toContain('#ff8800');
  expect(project.hasEdits).toBe(false);
  project.undo();
  project.undo();
  await settle(project);
  expect(hexes(project)).toEqual(before);
  expect(cellsKey(project)).toEqual(cells);
});

// Trial (workspace.countPalette): 'release' recounts once a stroke ends instead of as you draw.
async function gradient8(strategy) {
  const { project, workspace } = await createTestApp();
  workspace.countPalette = strategy;
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.quantize = 'count';
  project.colorCount = 8;
  await settle(project);
  return { project, workspace };
}
const WHITE = [...line(8), ...line(9), ...line(10), ...line(11)];
// Cells outside the painted rows (char rows 4 and 5) whose look changed.
const untouchedChanged = (before, after) => before.filter((v, i) => Math.floor(i / 40) !== 4 && Math.floor(i / 40) !== 5 && v !== after[i]).length;

test('When you let go: the palette holds during a stroke and catches up when it ends', async () => {
  const { project } = await gradient8('release');
  const before = hexes(project), cells = cellsKey(project);
  project.paintStroke(WHITE, '#ffffff');
  expect(hexes(project)).toEqual(before);
  expect(untouchedChanged(cells, cellsKey(project))).toBe(0);
  const painted = project.cells[4 * 40 + 8]; // meanwhile the stroke shows in its own colour
  expect([painted.fg.hex.toLowerCase(), painted.bg.hex.toLowerCase()]).toEqual(['#ffffff', '#ffffff']);
  project.commitEdit();
  expect(hexes(project)).not.toEqual(before);
  expect(cellsKey(project)).toEqual(await fullRender(project));
});

