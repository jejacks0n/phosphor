// Flatten: everything the drawing shows (the picture as converted, shapes and art layers, edit cells, paint) becomes
// plain ANSI cells exactly as they show, on the edit layer or the base, and the image is removed (docs/layers.md,
// Flattening).
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { rectShape } from '@/document/shapes';
import { makeArt } from '@/document/artLayers.js';
import { charRowsOf } from '@/lib/Cells';
import { slidersAtDefaults } from '@/store/settings';

const shown = (project) => cellsKey(project).map((key) => key.toLowerCase());

// The photo converted every way that makes a cell's look more than its two pixels (CGA, Best match, Dither, contrast
// moved), with a typed letter, paint (opaque and see-through), a shape and an art layer on it.
async function drawing(patch = {}) {
  const app = await createTestApp(), { project } = app;
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 60, rows: 60 });
  Object.assign(project, { quantize: 'cga', charChoice: 'best', dither: 60, ...patch });
  project.setSlider('contrast', 130);
  project.typeAt(3, 3, 'A', { fg: '#ffee00' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 10 + k, y: 20, alpha: 1 })), '#ff3300');
  project.commitEdit();
  project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 10 + k, y: 23, alpha: 0.5 })), '#33ff66');
  project.commitEdit();
  project.addShape(rectShape(30, 30, 44, 40, '#00ff00'));
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 40, 8], art: { cols: 2, rows: 1, cells: [[0, 'Z', null, '#ff0000'], [1, '╬', '#0000ff', '#ffffff']] } }));
  project.render();
  await settle(project);
  return { ...app, art };
}

for (const layer of ['edit', 'base']) {
  test(`nothing on the canvas changes (${layer})`, async () => {
    const { project } = await drawing();
    const before = shown(project);
    expect(await project.flattenDrawing({ layer })).toBe(true);
    await settle(project);
    expect(shown(project)).toEqual(before);
    expect(project.shapes.size).toBe(0);
    expect(project.hasPaint).toBe(false);
    expect(slidersAtDefaults(project)).toBe(true);
    expect(project.renderStyle).toBe('ansi');
    expect(Number(project.dither)).toBe(0);
    expect(project.charChoice).toBe('random');
    expect(project.history.canUndo).toBe(true);
  });
}

test('edit puts the grid on the edit layer over a black base', async () => {
  const { project } = await drawing();
  await project.flattenDrawing({ layer: 'edit' });
  await settle(project);
  expect(project.editCells.size).toBe(project.cols * charRowsOf(project.rows));
  expect(project.baseColorAt(0, 0)).toBe('#000000');
  expect(project.baseRecords.pins.size).toBe(0);
});

test('base stamps the grid onto the base, every character pinned', async () => {
  const { project } = await drawing();
  await project.flattenDrawing({ layer: 'base' });
  await settle(project);
  expect(project.editCells.size).toBe(0);
  expect(project.baseRecords.pins.size).toBe(project.cols * charRowsOf(project.rows));
});

test('nothing converts any more: a full render leaves every cell as it was', async () => {
  for (const layer of ['edit', 'base']) {
    const { project } = await drawing();
    const before = shown(project);
    await project.flattenDrawing({ layer });
    project.render();
    await settle(project);
    expect(shown(project), layer).toEqual(before);
  }
});

test('the eyedropper reads each cell\'s shown colors', async () => {
  for (const layer of ['edit', 'base']) {
    const { project } = await drawing();
    await project.flattenDrawing({ layer });
    await settle(project);
    const rows = charRowsOf(project.rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < project.cols; col++) {
        const cell = project.cells[row * project.cols + col], picked = project.underlyingAt(col, row, { withPaint: false });
        expect(`${picked.fg}${picked.bg}`.toLowerCase(), `${layer} ${col},${row}`).toBe(`${cell.fg.hex}${cell.bg.hex}`.toLowerCase());
      }
    }
  }
});

test('a Number palette is kept as its colors', async () => {
  const { project } = await drawing({ quantize: 'count', colorCount: 8 });
  const before = shown(project);
  await project.flattenDrawing({ layer: 'edit' });
  project.render();
  await settle(project);
  expect(project.quantize).toBe('palette');
  expect(project.palette.split(' ')).toHaveLength(8);
  expect(shown(project)).toEqual(before);
});

test('ASCII styles become ANSI as they showed', async () => {
  for (const renderStyle of ['colorAscii', 'ascii']) {
    const { project } = await drawing({ renderStyle });
    const before = shown(project);
    await project.flattenDrawing({ layer: 'edit' });
    project.render();
    await settle(project);
    expect(project.renderStyle).toBe('ansi');
    expect(project.quantize).toBe(renderStyle === 'colorAscii' ? 'none' : 'cga'); // Color ASCII's in-between colors aren't CGA's
    expect(shown(project), renderStyle).toEqual(before);
  }
});

test('a wide character keeps its layout', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 12, rows: 8 });
  project.typeAt(2, 2, '漢', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.render();
  await settle(project);
  const before = project.cells.map((c) => `${c.char}${c.wide ?? ''}${c.fg.hex}${c.bg.hex}`);
  await project.flattenDrawing({ layer: 'edit' });
  project.render();
  await settle(project);
  expect(project.cells.map((c) => `${c.char}${c.wide ?? ''}${c.fg.hex}${c.bg.hex}`)).toEqual(before);
});

test('undo brings it all back, redo flattens again', async () => {
  const { project } = await drawing();
  const image = project.image, before = shown(project), shapes = project.shapes.size;
  await project.flattenDrawing({ layer: 'edit' });
  await settle(project);
  const flattened = shown(project);
  project.undo();
  await settle(project);
  expect(project.image).toBe(image);
  expect(Number(project.contrast)).toBe(130);
  expect(project.charChoice).toBe('best');
  expect(Number(project.dither)).toBe(60);
  expect(project.shapes.size).toBe(shapes);
  expect(project.hasPaint).toBe(true);
  expect(shown(project)).toEqual(before);
  project.redo();
  await settle(project);
  expect(project.image).not.toBe(image);
  expect(shown(project)).toEqual(flattened);
});

test('off in an animation', async () => {
  const { project } = await drawing();
  project.addFrame('blank');
  const image = project.image;
  expect(project.canFlatten).toBe(false);
  expect(await project.flattenDrawing()).toBe(false);
  expect(project.image).toBe(image);
});

test('steps out of an art layer first', async () => {
  const { project, art } = await drawing();
  const before = shown(project);
  project.enterArt(art);
  await settle(project);
  await project.flattenDrawing({ layer: 'edit' });
  await settle(project);
  expect(project.artInside).toBe(null);
  expect(shown(project)).toEqual(before);
});
