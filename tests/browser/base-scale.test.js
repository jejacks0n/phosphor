// The base layer at the pipeline's processing scale: m x m pixels per grid pixel, so a moved block
// of the picture keeps every pixel the converter made from it.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import PaintLayer from '@/document/PaintLayer';
import { ctx2d } from '@/lib/Canvas';
import { cellIndex } from '@/lib/Cells';
import { workingScale } from '@/lib/ImageProcessor';

const FIT = { dx: 0, dy: 0, dw: 2, dh: 2 };
const fill = (layer, x, y, hex) => {
  const ctx = ctx2d(layer.canvas);
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, 1, 1);
};

test('averageAt averages a grid pixel\'s block and ignores transparency', () => {
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 2, smooth: false });
  fill(layer, 0, 0, '#000000');
  fill(layer, 1, 0, '#000000');
  fill(layer, 0, 1, '#ffffff');
  fill(layer, 1, 1, '#ffffff');
  expect(layer.averageAt(0, 0)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  expect(layer.averageAt(1, 1)).toBe(null);
});

test('version changes with every edit', () => {
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 2, smooth: false });
  let last = layer.version;
  const changed = () => {
    expect(layer.version).toBeGreaterThan(last);
    last = layer.version;
  };
  layer.paint([{ x: 0, y: 0, r: 255, g: 0, b: 0, alpha: 1 }]);
  changed();
  layer.erase([{ x: 0, y: 0 }]);
  changed();
  layer.pasteCells(layer.copyCells({ c0: 0, r0: 0, c1: 0, r1: 0 }), 1, 0, 1, 1);
  changed();
  layer.restore(null);
  changed();
});

test('resize can change the scale and keeps uniform blocks exact', () => {
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 2, smooth: false });
  layer.paint([{ x: 1, y: 1, r: 255, g: 0, b: 0, alpha: 1 }]);
  layer.resize(2, 2, FIT, FIT, 3);
  expect(layer.scale).toBe(3);
  expect(layer.averageAt(1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
});

// An 800 x 800 picture (hue across, light down, with a fine checker), big enough that the processing
// scale follows the grid (400 / the grid's longer side) rather than the image's size.
async function bigImageUrl() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 800;
  const ctx = ctx2d(canvas);
  for (let x = 0; x < 800; x += 8) {
    for (let y = 0; y < 800; y += 8) {
      ctx.fillStyle = `hsl(${(x / 800) * 360}, ${((x + y) / 8) % 2 ? 90 : 40}%, ${15 + (y / 800) * 70}%)`;
      ctx.fillRect(x, y, 8, 8);
    }
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return URL.createObjectURL(blob);
}
const unpinned = (project) => workingScale(project.image, { ...project.processParams, workScale: null });
const shownAt = (project, col, row) => cellsKey(project)[cellIndex(col, row, project.cols)];

test('the base layer is at the pipeline\'s processing scale', async () => {
  const { project } = await createTestApp();
  await loadImage(project, await bigImageUrl(), { cols: 30, rows: 30 });
  expect(project.baseLayer.scale).toBe(unpinned(project));
  expect(project.baseLayer.scale).toBeGreaterThan(1);
});

test('a rescale moves the base to the new grid\'s scale', async () => {
  const { project } = await createTestApp();
  await loadImage(project, await bigImageUrl(), { cols: 30, rows: 30 });
  project.floatSelection({ c0: 2, r0: 2, c1: 6, r1: 6 }, { base: true, edit: false }, 3, 0);
  project.cols = 80; // only the base is edited: a rescale
  project.render(); await settle(project);
  expect(project.baseLayer.scale).toBe(unpinned(project));
  expect(project.baseLayer.scale).toBeGreaterThan(1);
});

test('a canvas resize keeps the processing scale and the picture', async () => {
  const { project } = await createTestApp();
  await loadImage(project, await bigImageUrl(), { cols: 30, rows: 30 });
  project.typeAt(2, 2, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  project.render(); await settle(project);
  const scale = project.baseLayer.scale;
  const before = [];
  for (let row = 0; row < 15; row++) for (let col = 0; col < 20; col++) before.push(shownAt(project, col, row));
  project.cols = 45; // there are edits: a canvas resize
  project.render(); await settle(project);
  expect(project.baseLayer.scale).toBe(scale);
  const after = [];
  for (let row = 0; row < 15; row++) for (let col = 0; col < 20; col++) after.push(shownAt(project, col, row));
  expect(after).toEqual(before);
});

test('an image smaller than the grid keeps a scale-1 base', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tiny.gif', { cols: 80, rows: 80 });
  expect(project.baseLayer.scale).toBe(1);
  expect(workingScale(project.image, project.processParams)).toBe(null);
});

// A block of photo.jpg (30 x 30 grid, 3 processed pixels per grid pixel) moved 15 columns right.
const RECT = { c0: 2, r0: 2, c1: 11, r1: 11 };
async function photo(settings) {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 30, rows: 30 });
  Object.assign(project, settings);
  project.render(); await settle(project);
  return project;
}
const colorsIn = (project, { c0, r0, c1, r1 }, dc = 0) => {
  const out = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const { fg, bg } = project.cells[cellIndex(col + dc, row, project.cols)];
      out.push({ fg, bg });
    }
  }
  return out;
};
const hexes = (colors) => colors.map(({ fg, bg }) => fg.hex + bg.hex);

test('a moved block keeps its colors under CGA and VGA with adjustments', async () => {
  for (const settings of [{ quantize: 'cga' }, { quantize: 'cga', brightness: 150 }, { quantize: 'cga', contrast: 150 }, { quantize: 'cga', saturation: 200 }, { quantize: 'vga', brightness: 150 }]) {
    const project = await photo(settings);
    const before = hexes(colorsIn(project, RECT));
    project.floatSelection(RECT, { base: true, edit: true }, 15, 0);
    project.render(); await settle(project);
    expect(hexes(colorsIn(project, RECT, 15)), JSON.stringify(settings)).toEqual(before);
    project.undo();
    project.render(); await settle(project);
    expect(hexes(colorsIn(project, RECT)), `${JSON.stringify(settings)}, undone`).toEqual(before);
  }
});

test('a moved block in full color stays within rounding', async () => {
  const project = await photo({ brightness: 150 });
  const before = colorsIn(project, RECT);
  project.floatSelection(RECT, { base: true, edit: true }, 15, 0);
  project.render(); await settle(project);
  colorsIn(project, RECT, 15).forEach(({ fg, bg }, i) => {
    for (const k of ['r', 'g', 'b']) {
      expect(Math.abs(fg[k] - before[i].fg[k])).toBeLessThanOrEqual(2);
      expect(Math.abs(bg[k] - before[i].bg[k])).toBeLessThanOrEqual(2);
    }
  });
});

test('flipping a base cell under CGA with brightness swaps its two shown colors', async () => {
  const project = await photo({ quantize: 'cga', brightness: 150 });
  const row = 5;
  const col = [...Array(project.cols).keys()].find((c) => {
    const { fg, bg } = project.cells[cellIndex(c, row, project.cols)];
    return fg.hex !== bg.hex;
  });
  const { fg, bg } = project.cells[cellIndex(col, row, project.cols)];
  project.flipCell(col, row, { base: true, edit: false });
  project.commitEdit();
  project.render(); await settle(project);
  const flipped = project.cells[cellIndex(col, row, project.cols)];
  expect([flipped.fg.hex, flipped.bg.hex]).toEqual([bg.hex, fg.hex]);
});
