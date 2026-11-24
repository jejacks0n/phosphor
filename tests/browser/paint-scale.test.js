// docs/model.md R7: a new drawing paints at the base's scale, so the base, every cells layer's paint and every vector
// layer share one grid of pixels: moving, hiding or merging a layer never changes what the converter reads. The scale is
// the picture's processing scale, at least 4 pixels a grid pixel (By shape's samples) where the picture has them and a
// layer stays within MAX_LAYER_DIM.
import { test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { ellipseShape } from '@/document/shapes.js';
import { MAX_LAYER_DIM, editScaleFor } from '@/document/PaintLayer.js';
import { workingScale, MOST_SCALE, LEAST_SCALE } from '@/lib/ImageProcessor.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { font8 } from '../support/blockFonts.js';
import WebGLProcessor from '@/lib/WebGLProcessor.js';
import { ctx2d } from '@/lib/Canvas.js';

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

test('the working scale is MOST_SCALE for a picture with that many pixels a grid pixel or more', async () => {
  expect(await scaleOf(80 * MOST_SCALE, 48 * MOST_SCALE, 80, 48)).toBe(MOST_SCALE);
  expect(await scaleOf(4000, 2400, 80, 48)).toBe(MOST_SCALE);
});

test.runIf(MOST_SCALE > LEAST_SCALE)('between LEAST_SCALE and MOST_SCALE the working scale is the picture\'s own', async () => {
  expect(await scaleOf(80 * (LEAST_SCALE + 1), 48 * (LEAST_SCALE + 1), 80, 48)).toBe(LEAST_SCALE + 1);
});

test('a small picture is enlarged to LEAST_SCALE, one smaller than the grid too', async () => {
  expect(await scaleOf(80, 48, 80, 48)).toBe(LEAST_SCALE);
  expect(await scaleOf(40, 24, 80, 48)).toBe(LEAST_SCALE);
});

test('a long grid stays within MAX_LAYER_DIM', async () => {
  expect(await scaleOf(3000, 30000, 300, 3000)).toBe(editScaleFor(Infinity, Infinity, 300, 3000));
  expect(await scaleOf(2000, 6000, 200, 600)).toBe(Math.min(MOST_SCALE, editScaleFor(Infinity, Infinity, 200, 600)));
});

test('a new blank canvas paints at the base\'s scale, LEAST_SCALE or more a grid pixel, big grids too', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 80, rows: 48 });
  await settle(project);
  expect(same(project)).toBeGreaterThanOrEqual(LEAST_SCALE);
  await project.setBlankCanvas({ cols: 200, rows: 300 });
  await settle(project);
  expect(same(project)).toBe(MOST_SCALE); // the blank picture has that many a grid pixel; the old rule took 2 at this size
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
  expect(same(project)).toBe(MOST_SCALE); // the rows stay 40: the picture fits 40 × 40 in the middle, at its own 10 a grid pixel
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

// Every way a new drawing gets a paint layer or a new base keeps the two at one scale.
async function drawing() {
  const app = await createTestApp();
  await loadImage(app.project, '/tests/fixtures/images/photo.jpg', { cols: 40, rows: 40 });
  return app;
}
const painted = (project, workspace, id) => {
  workspace.pickLayer(id);
  project.paintStroke([{ x: 3, y: 3, alpha: 1 }], '#ff0000');
  project.commitEdit();
};

test('a font height change keeps base and paint at one scale', async () => {
  const { project } = await drawing();
  project.setDrawingFont(font8);
  await settle(project);
  same(project);
});

test('a layer added, and a picture added as one, paint at the base\'s scale', async () => {
  const { project, workspace } = await drawing();
  const id = project.addLayer('cells', 'base');
  painted(project, workspace, id); // a layer's paint is made when something's drawn on it
  expect(project.paintOf(id).scale).toBe(project.baseLayer.scale);
  const blob = await (await fetch('/tests/fixtures/images/gradient.png')).blob();
  const added = await project.addPictureToLayer(new File([blob], 'gradient.png', { type: 'image/png' }));
  await settle(project);
  expect(project.paintOf(added).scale).toBe(project.baseLayer.scale);
});

test('Bake and Blend into source image keep base and paint at one scale', async () => {
  const { project, workspace } = await drawing();
  const id = project.addLayer('cells', 'base');
  painted(project, workspace, id);
  project.brightness = 130;
  await settle(project);
  await project.bake();
  await settle(project);
  same(project);
  await project.mergeIntoPicture(null, id);
  await settle(project);
  same(project);
});

test('a drawing reopened with no scales saved (as autosave keeps one with nothing drawn) paints at the base\'s', async () => {
  const { project } = await drawing();
  const parts = await project.projectParts();
  parts.settings = { ...parts.settings, paintScale: null, baseScale: null };
  const file = await writeProject({ ...parts, imageBuffer: project.imageBuffer });
  await project.loadProject(new File([await file.arrayBuffer()], 'x.phosphor'));
  await settle(project);
  same(project);
});

test('a file saved with its own scales keeps them', async () => {
  const { project } = await createTestApp();
  const bytes = await (await fetch('/tests/fixtures/projects/vector-strokes-ascii.phosphor')).arrayBuffer();
  const { settings } = await readProject(new File([bytes], 'x.phosphor'));
  await project.loadProject(new File([bytes], 'x.phosphor'));
  await settle(project);
  expect([project.baseLayer.scale, project.paintLayer.scale]).toEqual([settings.baseScale, settings.paintScale]);
  expect(project.paintLayer.scale).not.toBe(project.baseLayer.scale);
});

// The picture reduced to the working size before processing is averaged, not sampled: the main texture has no mipmaps, so
// a picture many times the working size, sampled bilinearly, loses what falls between two samples.
const gpuPixels = (gpu, image, w, h, params = {}) => {
  gpu.process(image, { brightness: 100, pluginFilters: [], ...params }, w, h);
  const copy = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = ctx2d(copy);
  ctx.drawImage(gpu.canvas, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
};
const stripes = (w, h, every) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = ctx2d(canvas);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  for (let x = 0; x < w; x += every) ctx.fillRect(x, 0, 1, h);
  return canvas;
};

test('a fine pattern reduces to its average, not aliased', () => {
  const gpu = new WebGLProcessor();
  const out = gpuPixels(gpu, stripes(1600, 960, 10), 160, 96); // a one-pixel line every 10, ten pixels a working pixel
  for (let i = 0; i < out.length; i += 4) expect(Math.abs(out[i] - 25.5)).toBeLessThanOrEqual(2);
});

test('sliders moved make no new upload of the picture', () => {
  const gpu = new WebGLProcessor();
  const picture = stripes(1600, 960, 10);
  const upload = vi.spyOn(gpu.gl, 'texImage2D');
  const uploads = () => upload.mock.calls.filter((call) => call.length === 6).length; // the main texture's form
  gpuPixels(gpu, picture, 160, 96, { brightness: 110 });
  gpuPixels(gpu, picture, 160, 96, { brightness: 130 });
  expect(uploads()).toBe(1);
});

// A transparent pixel reads the same at every size: the color a PNG keeps under alpha 0 doesn't show at its own size and
// go black resized.
test('a transparent picture reads the same at its own size and enlarged', async () => {
  const gpu = new WebGLProcessor();
  const picture = new Image();
  picture.src = '/tests/fixtures/images/rgba.png'; // 48 × 48, its first rows clear with a color kept under them
  await picture.decode();
  const own = gpuPixels(gpu, picture, 48, 48), twice = gpuPixels(gpu, picture, 96, 96);
  for (let y = 0; y < 48; y += 4) {
    for (let x = 0; x < 48; x += 4) {
      const a = (y * 48 + x) * 4, b = (y * 2 * 96 + x * 2) * 4;
      expect([...twice.slice(b, b + 3)]).toEqual([...own.slice(a, a + 3)]);
    }
  }
});
