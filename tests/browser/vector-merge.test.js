// Bake and Merge down with shapes: pressed into the base layer's pixels, with nothing on the canvas changing,
// and one undo bringing them back as shapes. A pin a pressed shape covers goes, so the cell still shows the shape.
// In an animation Bake keeps them shapes, with the sliders burnt into their colors.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { ellipseShape, rectShape } from '@/document/shapes.js';
import { cellIndex } from '@/lib/Cells.js';

const SLIDERS = { brightness: 140, contrast: 160, saturation: 130, hue: 40 };

async function drawing({ cols = 30, rows = 30 } = {}) {
  const app = await createTestApp();
  await loadImage(app.project, '/tests/fixtures/images/gradient.png', { cols, rows });
  return app;
}
const keys = (project) => [...project.shapes.keys()].sort();

test('shapes alone make Bake available on a still, and baking presses them into the base with nothing on the canvas changing; one undo brings them back', async () => {
  const { project } = await drawing();
  expect(project.canBake).toBe(false);
  const a = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000', stroke: '#ffffff', width: 1.5 }));
  const b = project.addShape(ellipseShape(8, 6, 26, 24, { fill: '#0044aa' }));
  expect(project.canBake).toBe(true);
  await settle(project);
  const cells = cellsKey(project);
  await project.bake();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
  project.undo();
  await settle(project);
  expect(keys(project)).toEqual([a, b].sort());
  expect(cellsKey(project)).toEqual(cells);
  project.redo();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
});

test('Bake with sliders and shapes on a still: shapes pressed in, nothing changes', async () => {
  const { project } = await drawing();
  project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' }));
  Object.assign(project, SLIDERS);
  await settle(project);
  const cells = cellsKey(project);
  await project.bake();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
});

// Shapes whose pixels are whole: a soft edge (an outline's antialiasing) is a blend, and the sliders don't
// treat a blend of two colors as the blend of the two colors they make once they clamp, so a soft edge's
// cells can change color when they're baked while the shapes stay shapes (docs/layers.md says so).
test('in an animation, Bake keeps shapes as shapes with the sliders burnt into their colors, and every frame looks as it did', async () => {
  const { project } = await drawing({ cols: 20, rows: 20 });
  const key = project.addShape(rectShape(2, 2, 10, 10, { fill: '#ff0000', stroke: '#00ff00', width: 2 }));
  project.addFrame('blank');
  project.addShape(rectShape(8, 8, 18, 18, { fill: '#0044aa' }));
  project.addFrame('wipe');
  expect(project.canBake).toBe(false); // shapes alone don't make an animation bakeable: they stay shapes
  Object.assign(project, SLIDERS);
  const looks = [];
  for (let i = 0; i < project.frames.length; i++) {
    project.showFrame(i);
    await settle(project);
    looks.push(cellsKey(project));
  }
  await project.bake();
  for (let i = 0; i < project.frames.length; i++) {
    project.showFrame(i);
    await settle(project);
    expect(cellsKey(project), `frame ${i}`).toEqual(looks[i]);
  }
  project.showFrame(0);
  expect(project.shapes.get(key).fill).not.toBe('#ff0000'); // burnt in
  expect(project.shapes.get(key).stroke).not.toBe('#00ff00');
  project.undo();
  project.showFrame(0);
  expect(project.shapes.get(key).fill).toBe('#ff0000');
});

test('a pin under a pressed shape goes, so the cell still shows the shape', async () => {
  const { project } = await drawing();
  project.typeAt(5, 3, 'A', { fg: '#ffff00', bg: '#000000' });
  project.commitEdit();
  project.mergeDown(); // the A is a pin now
  expect(project.baseRecords.pins.get('5,3')).toBe('A');
  project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' }));
  await settle(project);
  const shown = cellsKey(project);
  expect(project.cells[cellIndex(5, 3, project.cols)].char).not.toBe('A');
  project.mergeShapes();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.baseRecords.pins.has('5,3')).toBe(false);
  expect(cellsKey(project)).toEqual(shown);
  project.undo();
  expect(project.baseRecords.pins.get('5,3')).toBe('A');
  expect(project.shapes.size).toBe(1);
});

test('Merge down takes the shapes with it, under the edit cells and paint, and nothing changes on the canvas', async () => {
  const { project } = await drawing();
  project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' }));
  project.typeAt(4, 2, 'B', { fg: '#ffff00', bg: '#0000ff' });
  project.commitEdit();
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }, { x: 7, y: 6, alpha: 1 }], '#00ff00');
  project.commitEdit();
  await settle(project);
  const cells = cellsKey(project);
  project.mergeDown();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.editCells.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
  project.undo();
  await settle(project);
  expect(project.shapes.size).toBe(1);
  expect(cellsKey(project)).toEqual(cells);
});

test('a selection\'s Merge down takes shapes touching it whole, and the overlapping shapes beneath them, and no cell changes', async () => {
  const { project } = await drawing();
  const beneath = project.addShape(rectShape(10, 2, 26, 20, { fill: '#0044aa' }));   // under top, outside the rect
  const top = project.addShape(ellipseShape(4, 4, 16, 14, { fill: '#ff0000' }));     // touches the rect
  const apart = project.addShape(rectShape(22, 24, 28, 28, { fill: '#00ff00' }));    // touches nothing merged
  const above = project.addShape(rectShape(14, 12, 20, 18, { fill: '#ffffff', stroke: '#000000', width: 1 })); // over both, not in the rect
  project.typeAt(3, 2, 'C', { fg: '#ffff00' });
  project.commitEdit();
  await settle(project);
  const cells = cellsKey(project);
  project.mergeDown({ c0: 2, r0: 1, c1: 6, r1: 3 });
  await settle(project);
  expect(keys(project)).toEqual([apart, above].sort());
  expect(project.shapes.has(beneath) || project.shapes.has(top)).toBe(false);
  expect(cellsKey(project)).toEqual(cells);
});

test('VECTOR\'s Merge down merges the selected shapes, or all, and isn\'t offered in an animation', async () => {
  const { project } = await drawing();
  const a = project.addShape(rectShape(2, 2, 8, 8, { fill: '#ff0000' }));
  const b = project.addShape(rectShape(20, 20, 28, 28, { fill: '#00ff00' }));
  await settle(project);
  const cells = cellsKey(project);
  project.mergeShapes([a]);
  await settle(project);
  expect(keys(project)).toEqual([b]);
  expect(cellsKey(project)).toEqual(cells);
  project.mergeShapes();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);

  project.addFrame('blank');
  const c = project.addShape(rectShape(2, 20, 8, 28, { fill: '#ff0000' }));
  project.mergeShapes();
  expect(keys(project)).toEqual([c]);
});

// A pressed shape's soft edge over a partly transparent base can come out on a half step: a pixel whose color,
// unpremultiplied, falls halfway between two values. Chromium reads one either side of it, depending on what else it
// has done to the canvas, so a cell could change by a shade with nothing drawn on it. Pressing keeps off them.
test('shapes pressed over a partly transparent base leave no pixel on a half step', async () => {
  const { project } = await drawing({ cols: 40, rows: 40 });
  const { canvas } = project.baseLayer, ctx = canvas.getContext('2d');
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) image.data.set([(i / 4) % 256, (i / 12) % 256, 255 - ((i / 4) % 256), 2 * (1 + ((i / 4) % 127))], i);
  ctx.putImageData(image, 0, 0);
  project.addShape(ellipseShape(3, 5, 37, 75, { fill: '#33cc66', stroke: '#ff8800', width: 1.5 }));
  project.addShape(ellipseShape(10, 2, 30, 60, { fill: '#2266ee' }));
  const read = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const onHalfStep = (data, i) => {
    const a = data[i + 3];
    return a > 0 && a < 255 && [0, 1, 2].some((j) => (510 * Math.round((data[i + j] * a) / 255)) % (2 * a) === a);
  };
  const halfSteps = (data, only = () => true) => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (only(i) && onHalfStep(data, i)) n++;
    return n;
  };
  const before = read();
  expect(halfSteps(before)).toBeGreaterThan(0); // the base has some to begin with
  project.mergeShapes();
  await settle(project);
  const after = read(), pressed = (i) => [0, 1, 2, 3].some((j) => after[i + j] !== before[i + j]);
  expect(after.filter((v, i) => i % 4 === 0 && pressed(i)).length).toBeGreaterThan(100);
  expect(halfSteps(after, pressed)).toBe(0);
});
