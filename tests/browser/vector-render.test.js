// The vector layer's shapes: drawn over the base layer's own pixels and converted with the picture, under
// edit cells and paint; a change redraws only its area and comes out as a full render would; every change
// is one undo step, through the ledger.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { outputKey } from '../support/scenes.js';
import { layoutWide } from '@/lib/Cells';
import { rectShape, ellipseShape, translation, transformed } from '@/document/shapes';

const key = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}${c.wide ?? ''}`);
const at = (project, col, row) => project.cells[row * project.cols + col];
const RED = { fill: '#ff0000' };

function fullRebuild(project) {
  const params = project.processParams;
  return layoutWide(project.renderer.composeAll(project.renderer.cellsFromOutput(params), project.editCells, params), project.cols);
}

// Everything worked out again from scratch, shapes included: what a partial update must equal.
async function fromScratch(project) {
  project.renderer.reset();
  project.render();
  await settle(project);
  return { output: outputKey(project), cells: key(project.cells) };
}

async function gradient(cols = 30, rows = 30) {
  const app = await createTestApp();
  await loadImage(app.project, '/tests/fixtures/images/gradient.png', { cols, rows });
  return app;
}

test('a shape converts with the picture, under edit cells and paint', async () => {
  const { project } = await gradient();
  const bare = at(project, 8, 4);
  const shape = project.addShape(rectShape(4, 4, 14, 12, RED));
  expect(shape).toMatch(/^v:/);
  expect(at(project, 8, 4)).not.toEqual(bare);
  expect(at(project, 8, 4).bg.hex).toBe('#ff0000');
  project.typeAt(6, 3, 'A', { fg: '#00ff00', bg: '#0000ff' });
  project.commitEdit();
  project.paintStroke([{ x: 10, y: 8, alpha: 1 }, { x: 10, y: 9, alpha: 1 }], '#ffffff');
  project.commitEdit();
  expect(at(project, 6, 3).char).toBe('A');
  expect(at(project, 6, 3).bg.hex).toBe('#0000ff');
  expect(at(project, 10, 4).bg.hex).toBe('#ffffff');
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
  const partial = { output: outputKey(project), cells: key(project.cells) };
  expect(await fromScratch(project)).toEqual(partial);
});

test('color sliders and the palette apply to shapes, Blur doesn\'t', async () => {
  const { project } = await gradient();
  project.addShape(rectShape(4, 4, 14, 12, RED));
  project.brightness = 60;
  await settle(project);
  expect(at(project, 8, 4).bg.hex).not.toBe('#ff0000');
  project.brightness = 100;
  await settle(project);
  const sharp = key(project.cells);
  project.blur = 3;
  await settle(project);
  const edge = (cells) => [3, 4, 5, 6, 7].map((row) => cells[row * 30 + 8]); // across the shape's top edge, inside it
  expect(edge(key(project.cells)).slice(1, 4)).toEqual(edge(sharp).slice(1, 4));
  project.quantize = 'cga';
  await settle(project);
  expect(['#aa0000', '#ff5555']).toContain(at(project, 8, 4).bg.hex);
});

test('a shape covers a pin; the pin shows again when it moves off', async () => {
  const { project } = await gradient();
  project.writeBaseCells([{ col: 8, row: 4, char: '#', fg: '#ffffff', bg: '#000000' }]);
  project.commitEdit();
  expect(at(project, 8, 4).char).toBe('#');
  const shape = project.addShape(rectShape(4, 4, 14, 12, RED));
  expect(project.renderer.pinAt(8, 4)).toBeUndefined();
  expect(at(project, 8, 4).char).not.toBe('#');
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
  project.updateShapes([[shape, transformed(project.shapes.get(shape), translation(12, 12))]]);
  expect(project.renderer.pinAt(8, 4)).toBe('#');
  expect(at(project, 8, 4).char).toBe('#');
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
});

// As incremental-cells.test.js has them, and By shape and Best match.
const CASES = [
  ['none', { dither: 0 }], ['vga', { dither: 0, smoothing: 'medium' }], ['count', { dither: 0 }], ['cga', { dither: 0, smoothing: 'low' }],
  ['cga', { dither: 100, ditherStyle: 'floyd' }], ['count', { dither: 70, ditherStyle: 'bayer' }],
  ['cga', { charChoice: 'best', chars: '▄░▒▓█', dither: 0 }], ['cga', { charChoice: 'best', chars: '▄░▒▓█', dither: 100, ditherStyle: 'floyd' }],
  ['cga', { charChoice: 'shape', dither: 0 }], ['vga', { charChoice: 'shape', dither: 80, ditherStyle: 'bayer' }],
  ['cga', { charChoice: 'shape', dither: 100, ditherStyle: 'floyd' }],
];
for (const [quantize, settings] of CASES) {
  test(`moving a shape redraws only its area, and comes out as a full render would (${quantize}, ${JSON.stringify(settings)})`, async () => {
    const { project } = await gradient();
    Object.assign(project, { quantize, ...settings });
    await settle(project);
    project.writeBaseCells([{ col: 3, row: 3, char: '#', fg: '#ffffff', bg: '#000000' }]);
    project.commitEdit();
    project.addShape(ellipseShape(2, 2, 12, 10, { fill: '#33cc66', stroke: '#ffee00', width: 1.5 }));
    const shape = project.addShape(rectShape(5, 6, 9, 14, RED));
    project.beginEdit();
    const start = project.shapes.get(shape);
    for (let k = 1; k <= 5; k++) project.updateShapes([[shape, transformed(start, translation(2.3 * k, 1.7 * k))]]);
    project.commitEdit();
    await settle(project);
    expect(key(project.cells)).toEqual(key(fullRebuild(project)));
    const partial = { output: outputKey(project), cells: key(project.cells) };
    expect(await fromScratch(project)).toEqual(partial);
  });
}

test('undo and redo take a shape back and put it back exactly, through the ledger', async () => {
  const { project } = await gradient();
  const before = key(project.cells);
  const shape = project.addShape(rectShape(4, 4, 14, 12, RED));
  const drawn = key(project.cells);
  expect(project._ledger.strokesBy(project._by)).toHaveLength(1);
  project.beginEdit();
  project.updateShapes([[shape, transformed(project.shapes.get(shape), translation(3, 0))]]);
  project.updateShapes([[shape, transformed(project.shapes.get(shape), translation(3, 0))]]);
  project.commitEdit();
  const moved = key(project.cells);
  project.undo();
  expect(key(project.cells)).toEqual(drawn);
  project.undo();
  expect(project.shapes.size).toBe(0);
  expect(key(project.cells)).toEqual(before);
  project.redo();
  project.redo();
  expect(key(project.cells)).toEqual(moved);
  expect(project.shapes.get(shape).m[4]).toBe(6);
});

test('deleteShapes and restackShapes are one step each; Forward swaps only with a shape it overlaps', async () => {
  const { project } = await gradient();
  const a = project.addShape(rectShape(2, 2, 10, 10, RED));
  const b = project.addShape(rectShape(6, 6, 14, 14, { fill: '#0000ff' }));
  const far = project.addShape(rectShape(20, 20, 24, 24, { fill: '#00ff00' }));
  expect(at(project, 8, 4).bg.hex).toBe('#0000ff');
  project.restackShapes([a], 'forward');
  expect(project.shapes.get(a).z).toBeGreaterThan(project.shapes.get(b).z);
  expect(at(project, 8, 4).bg.hex).toBe('#ff0000');
  const farZ = project.shapes.get(far).z;
  project.restackShapes([far], 'back');
  expect(project.shapes.get(far).z).toBe(farZ); // nothing beneath it overlaps
  project.deleteShapes([a]);
  expect(project.shapes.has(a)).toBe(false);
  project.undo();
  expect(project.shapes.has(a)).toBe(true);
  project.undo();
  expect(at(project, 8, 4).bg.hex).toBe('#0000ff');
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
});

test('Merge up lifts what a shape shows into edit cells', async () => {
  const { project } = await gradient();
  project.addShape(rectShape(4, 4, 14, 12, RED));
  project.mergeUp({ c0: 6, r0: 3, c1: 7, r1: 4 });
  expect(project.editCells.get('6,3').bg).toBe('#ff0000');
});

test('the eraser on the base and a selection\'s move on ANSI leave shapes as they are', async () => {
  const { project } = await gradient();
  const shape = project.addShape(rectShape(4, 4, 14, 12, RED));
  const kept = project.shapes.get(shape);
  project.beginEdit();
  project.eraseBase([{ col: 8, row: 4 }]);
  project.commitEdit();
  project.moveSelection({ c0: 4, r0: 2, c1: 14, r1: 6 }, { base: true, edit: true }, 5, 3);
  expect(project.shapes.get(shape)).toBe(kept);
  expect(at(project, 8, 4).bg.hex).toBe('#ff0000'); // the shape still covers what was moved away
});

test('a shape counts as an edit: a grid change is a canvas resize', async () => {
  const { project } = await gradient();
  project.addShape(rectShape(4, 4, 14, 12, RED));
  expect(project.hasEdits).toBe(true);
  expect(project.hasEditLayer).toBe(false);
});

// Review Focus 2.
test('a grid change keeps shapes in grid pixels, even when the base layer drops its scale', async () => {
  const { project } = await gradient();
  const shape = project.addShape(rectShape(4, 4, 14, 12, RED));
  const kept = project.shapes.get(shape), scale = project.baseLayer.scale;
  project.updateCols(299);
  project.updateRows(9999);
  await settle(project);
  expect(project.baseLayer.scale).toBeLessThan(scale);
  expect(project.shapes.get(shape)).toBe(kept);
  expect(at(project, 8, 4).bg.hex).toBe('#ff0000');
  expect(at(project, 15, 4).bg.hex).not.toBe('#ff0000');
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
});

