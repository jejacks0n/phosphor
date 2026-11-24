// docs/model.md R7: a new drawing paints at the base's scale, so the base, every cells layer's paint and every vector
// layer share one grid of pixels: moving, hiding or merging a layer never changes what the converter reads. The scale is
// the picture's processing scale, at least 4 pixels a grid pixel (By shape's samples) where the picture has them and a
// layer stays within MAX_LAYER_DIM.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { ellipseShape } from '@/document/shapes.js';
import { MAX_LAYER_DIM, editScaleFor } from '@/document/PaintLayer.js';
import { workingScale } from '@/lib/ImageProcessor.js';

const same = (project) => {
  expect(project.paintLayer.scale).toBe(project.baseLayer.scale);
  return project.baseLayer.scale;
};

// The scale of a picture w × h on a cols × rows grid (grid pixels), with the store's other settings.
async function scaleOf(w, h, cols, rows) {
  const { project } = await createTestApp();
  const picture = Object.assign(document.createElement('canvas'), { width: w, height: h });
  return workingScale(picture, { ...project.processParams, cols, rows, fit: null, workScale: null });
}

test('the working scale is 8 for a picture with 8 or more pixels a grid pixel', async () => {
  expect(await scaleOf(800, 480, 80, 48)).toBe(8);
  expect(await scaleOf(4000, 2400, 80, 48)).toBe(8);
});

test('between 4 and 8 the working scale is the picture\'s own', async () => {
  expect(await scaleOf(480, 288, 80, 48)).toBe(6);
});

test('a small picture is enlarged to 4, one smaller than the grid too', async () => {
  expect(await scaleOf(80, 48, 80, 48)).toBe(4);
  expect(await scaleOf(40, 24, 80, 48)).toBe(4);
});

test('a long grid stays within MAX_LAYER_DIM', async () => {
  expect(await scaleOf(3000, 30000, 300, 3000)).toBe(editScaleFor(Infinity, Infinity, 300, 3000));
  expect(await scaleOf(2000, 6000, 200, 600)).toBe(6);
});

test('a new blank canvas paints at the base\'s scale, 4 or more a grid pixel, big grids too', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 80, rows: 48 });
  await settle(project);
  expect(same(project)).toBeGreaterThanOrEqual(4);
  await project.setBlankCanvas({ cols: 200, rows: 300 });
  await settle(project);
  expect(same(project)).toBe(8); // the blank picture has 8 or more a grid pixel; the old rule took 2 at this size
});

test('a long grid keeps every layer within MAX_LAYER_DIM, base and paint alike', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 300, rows: 3000 });
  await settle(project);
  expect(same(project) * 3000).toBeLessThanOrEqual(MAX_LAYER_DIM);
});

test('an opened photo paints at the base\'s scale', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg');
  same(project);
});

test('a new grid keeps the two together: a rescale with nothing drawn, a canvas resize with paint, and its undo', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 40, rows: 40 });
  await settle(project);
  project.cols = 160; // nothing drawn: the picture refits, the base and paint at the new grid's working scale
  await settle(project);
  expect(same(project)).toBe(8); // the rows stay 40: the picture fits 40 × 40 in the middle, at its own 10 a grid pixel
  workspace.pickLayer(project.addLayer('cells', 'base'));
  project.writeEditCells([{ col: 1, row: 1, attrs: { char: 'A', fg: '#ffffff', bg: '#000000' } }]);
  project.commitEdit();
  project.cols = 170; // something drawn: a canvas resize
  await settle(project);
  same(project);
  project.undo();
  await settle(project);
  same(project);
  expect(project.paintOf(project.editId).scale).toBe(project.baseLayer.scale);
});

// The report (a logo's thin strokes on Vector 1, right on the base, with Layer 1 over it): moving Layer 1 under Vector 1
// put the vector layer above a cells layer, where it drew at the paint's scale (6) and not the base's (5), and 58 of its
// cells came out as other characters. With one scale the strokes are the same pixels wherever the layer is.
test('R7: moving a cells layer under a vector layer leaves the vector layer\'s characters as they were', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 80, rows: 48 });
  project.renderStyle = 'ascii';
  project.charChoiceAscii = 'shape';
  const vector = project.addLayer('vector', 'base'), cells = project.addLayer('cells', vector);
  workspace.pickLayer(vector);
  for (let i = 0; i < 6; i++) project.addShape(ellipseShape(4 + 9 * i, 4 + 5 * i, 20 + 9 * i, 40 - 3 * i, { stroke: '#ffffff', width: 1.5 }));
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', vector, cells]);
  const chars = () => project.cells.map((cell) => cell.char).join('');
  const shown = chars();
  expect(shown.trim()).not.toBe('');
  project.moveLayer(cells, 1);
  await settle(project);
  expect(project.lowerGroup.upper).toEqual([vector]);
  expect(chars()).toBe(shown);
});

// A picture enlarged to the working scale's least is enlarged pixel for pixel (nearest), as a small pixel-art picture
// should be: a 4 × 4 picture on a 40 × 40 grid is sixteen blocks of 10 × 10 grid pixels, none smeared into the next.
test('a small picture is enlarged pixel for pixel, not smoothed', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tiny.gif', { cols: 40, rows: 40 });
  const row = project.cells.slice(0, 40).map((cell) => cell.fg.hex);
  expect(new Set(row.slice(0, 10)).size).toBe(1);
  expect(new Set(row.slice(10, 20)).size).toBe(1);
  expect(row[9]).not.toBe(row[10]);
});
