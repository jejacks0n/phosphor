// The Number palette (quantize 'count'): its colors are picked from everything you see (the
// picture, the base's own pixels, the paint), so a color you draw with gets a place in it, and
// a picture with no more colors than asked for keeps exactly its own.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape } from '@/document/shapes.js';

const hexes = (project) => project.activePalette.map((p) => p.hex.toLowerCase()).sort();
const line = (y) => Array.from({ length: 10 }, (_, k) => ({ x: 5 + k, y, alpha: 1 }));

// What a full render gives now (the cells a stroke's live update must match).
async function fullRender(project) {
  project.render();
  await settle(project);
  return cellsKey(project);
}

test('a few-color picture keeps its exact colors, and white paint is white', async () => {
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

test('with more colors than asked for, a finished stroke rebalances the palette across the picture', async () => {
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
  project.mergeDown('edit');
  await settle(project);
  expect(hexes(project)).toContain('#ff8800');
  expect(project.hasEdits).toBe(false);
  project.undo();
  project.undo();
  await settle(project);
  expect(hexes(project)).toEqual(before);
  expect(cellsKey(project)).toEqual(cells);
});

// With more colors than asked for.
async function gradient8() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.quantize = 'count';
  project.colorCount = 8;
  await settle(project);
  return { project, workspace };
}
const WHITE = [...line(8), ...line(9), ...line(10), ...line(11)];
// Cells outside the painted rows (char rows 4 and 5) whose look changed.
const untouchedChanged = (before, after) => before.filter((v, i) => Math.floor(i / 40) !== 4 && Math.floor(i / 40) !== 5 && v !== after[i]).length;

test('the palette holds during a stroke (the stroke in its own colors) and catches up when it ends', async () => {
  const { project } = await gradient8();
  const before = hexes(project), cells = cellsKey(project);
  project.paintStroke(WHITE, '#ffffff');
  expect(hexes(project)).toEqual(before);
  expect(untouchedChanged(cells, cellsKey(project))).toBe(0);
  const painted = project.cells[4 * 40 + 8]; // meanwhile the stroke shows in its own color
  expect([painted.fg.hex.toLowerCase(), painted.bg.hex.toLowerCase()]).toEqual(['#ffffff', '#ffffff']);
  project.commitEdit();
  expect(hexes(project)).not.toEqual(before);
  expect(cellsKey(project)).toEqual(await fullRender(project));
});


test('a shape updates the palette once, when it is drawn', async () => {
  const { project, workspace } = await gradient8();
  const { default: shapes } = await import('@/tools/shapes');
  Object.assign(workspace, { shapeKind: 'rect', shapeDrawWith: 'full', editFgColor: '#ffffff', editBgColor: '#ffffff' });
  const before = hexes(project), cells = cellsKey(project);
  const ctx = { project, workspace, view: 'output' };
  shapes.begin(ctx, { x: 4, y: 4 });
  shapes.move(ctx, { x: 4, y: 4 }, { x: 30, y: 30 });
  expect(hexes(project)).toEqual(before); // dragging only previews
  expect(cellsKey(project)).toEqual(cells);
  shapes.end(ctx);
  expect(hexes(project)).not.toEqual(before);
  expect(cellsKey(project)).toEqual(await fullRender(project));
});

test('paint from before an edit keeps its palette color while the edit holds the palette (a Delete pulling a row along)', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40, quantize: 'count' });
  project.typeAt(19, 9, 'A', { fg: '#00ff00', bg: '#0000ff' });
  project.commitEdit();
  project.paintStroke([{ x: 19, y: 19, alpha: 1 }, { x: 20, y: 19, alpha: 1 }], '#ffee00');
  project.commitEdit();
  await settle(project);
  project.typeAt(15, 9, 'X', { fg: '#00ff00' }); // a typing run, left open
  project.deleteAt(15, 9); // the row after it moves left, and every cell there is drawn again
  await settle(project);
  const shown = cellsKey(project);
  expect(shown).toEqual(await fullRender(project));
});

// A block of paint over most of the grid's top half, on the cells layer in use.
const block = (project, hex) => {
  const pixels = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 40; x++) pixels.push({ x, y, alpha: 1 });
  project.paintStroke(pixels, hex);
  project.commitEdit();
};

test('hiding and showing a layer leaves the Number palette as it was', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 40, rows: 80 });
  await settle(project);
  project.quantize = 'count';
  project.colorCount = 4;
  await settle(project);
  block(project, '#ff0000'); // on L1
  await settle(project);
  const shown = hexes(project);
  expect(shown).toContain('#ff0000');
  project.setLayerHidden('edit', true);
  await settle(project);
  expect(hexes(project)).toEqual(shown);
  project.setLayerHidden('edit', false);
  await settle(project);
  expect(hexes(project)).toEqual(shown);
});

test('an old document counts from outputCanvas', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.quantize = 'count';
  project.colorCount = 8;
  await settle(project);
  expect(project.renderer.countCanvas()).toBe(project.renderer.outputCanvas);
});

test('paint on an upper layer is counted', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tiny.gif', { cols: 40, rows: 40 });
  project.quantize = 'count';
  project.colorCount = 8;
  await settle(project);
  project.useLayer(project.addLayer('cells', 'edit')); // above the lower group's cells layer
  await settle(project);
  expect(project.editIsUpper).toBe(true);
  block(project, '#ff00aa');
  await settle(project);
  expect(hexes(project)).toContain('#ff00aa');
});

// Hidden and shown again, the Number palette is the same each time.
async function sameAcrossHide(project, id) {
  await settle(project);
  const shown = hexes(project);
  project.setLayerHidden(id, true);
  await settle(project);
  expect(hexes(project)).toEqual(shown);
  project.setLayerHidden(id, false);
  await settle(project);
  expect(hexes(project)).toEqual(shown);
  return shown;
}
async function blankCount() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 40, rows: 80 });
  await settle(app.project);
  Object.assign(app.project, { quantize: 'count', colorCount: 4 });
  return app;
}

test('hiding a vector layer above the lower group, its shapes still count', async () => {
  const { project, workspace } = await blankCount();
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  project.addShape(rectShape(2, 2, 20, 20, { fill: '#00ff00' }));
  project.commitEdit();
  expect(project.lowerGroup.upper).toContain(vector);
  expect(await sameAcrossHide(project, vector)).toContain('#00ff00');
});

test('hiding a vector layer in the lower group, or the base under its shapes, the shapes still count', async () => {
  const { project, workspace } = await blankCount();
  project.addLayer('vector', 'base');
  workspace.pickLayer('vector');
  project.addShape(rectShape(2, 2, 20, 20, { fill: '#00ff00' }));
  project.commitEdit();
  expect(project.lowerGroup.vectors).toEqual(['vector']);
  expect(await sameAcrossHide(project, 'vector')).toContain('#00ff00');
  expect(await sameAcrossHide(project, 'base')).toContain('#00ff00');
});

test('with Dither on, a hidden layer and paint on the lower group, the cells are a full render\'s', async () => {
  const { project, workspace } = await gradient8();
  project.dither = 60;
  await settle(project);
  block(project, '#ff00aa'); // on Layer 1, the lower group's
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.paintStroke(WHITE, '#ffffff');
  project.commitEdit();
  project.setLayerHidden(top, true);
  await settle(project);
  workspace.pickLayer('edit');
  project.paintStroke(line(30), '#00ffff');
  project.commitEdit();
  await settle(project);
  expect(hexes(project)).toHaveLength(8);
  expect(cellsKey(project)).toEqual(await fullRender(project));
});
