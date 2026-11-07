// Bake and Merge down with shapes: pressed into the base layer's pixels, with nothing on the canvas changing,
// and one undo bringing them back as shapes. A pin a pressed shape covers goes, so the cell still shows the shape.
// In an animation Bake keeps them shapes, with the sliders burnt into their colors.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { ellipseShape, rectShape, withShape } from '@/document/shapes.js';
import { makeArt } from '@/document/artLayers.js';
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
  const shaded = project.addShape(rectShape(4, 12, 16, 18, { fill: { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [12, 0, 0, 6, 0, 0] } }));
  // A gradient stroke as gentle as the fill, on whole pixels (miter corners): where a pixel's half covered, the cell
  // mixes it with the picture under it, and that mix is off once baked whatever the stroke's color.
  const edged = project.addShape(withShape(rectShape(1, 1, 4, 4, { stroke: { type: 'linear', stops: [[0, '#00ff00'], [1, '#ffffff']], m: [12, 0, 0, 12, 1, 1] }, width: 2 }), { join: 'miter' }));
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
    // Exact but under the gradients: a cell's color is its pixels' average, which the sliders act on live and, baked,
    // on each pixel first; they curve, so a gradient's cells are some levels off, more the steeper it is.
    const now = cellsKey(project), off = (a, b) => a.slice(1).split('#').slice(1).some((hex, j) => {
      const other = b.slice(1).split('#').slice(1)[j];
      return [0, 2, 4].some((c) => Math.abs(parseInt(hex.slice(c, c + 2), 16) - parseInt(other.slice(c, c + 2), 16)) > 12);
    });
    const differ = now.flatMap((cell, n) => (cell === looks[i][n] ? [] : [n]));
    expect(differ.every((n) => now[n][0] === looks[i][n][0] && !off(now[n], looks[i][n])), `frame ${i}`).toBe(true);
    expect(differ.every((n) => (n % 20 >= 4 && n % 20 <= 16 && Math.floor(n / 20) >= 6) || (n % 20 <= 5 && Math.floor(n / 20) <= 2)), `frame ${i}: only under the gradients`).toBe(true);
  }
  project.showFrame(0);
  expect(project.shapes.get(key).fill).not.toBe('#ff0000'); // burnt in
  expect(project.shapes.get(key).stroke).not.toBe('#00ff00');
  const { stroke } = project.shapes.get(edged); // a stroke's too
  expect(stroke.stops).toHaveLength(16);
  expect(stroke.stops[0][1]).not.toBe('#00ff00');
  const { fill } = project.shapes.get(shaded); // a gradient stays one, each stop burnt in
  expect(fill).toMatchObject({ type: 'linear', m: [12, 0, 0, 6, 0, 0] });
  expect(fill.stops).toHaveLength(16); // sampled finer: the sliders aren't straight between stops
  expect([fill.stops[0][0], fill.stops[15][0]]).toEqual([0, 1]);
  expect([fill.stops[0][1], fill.stops[15][1]]).not.toEqual(['#ff0000', '#0000ff']);
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

// Art at (5, 3): A B Ｗ (a wide one, taking col 7 and 8), then C at col 9 with only its bottom half colored.
const BLOCK = () => makeArt({ z: 0, m: [1, 0, 0, 1, 5, 6], art: { cols: 5, rows: 1, cells: [
  [0, 'A', '#0000ff', '#ffff00'], [1, 'B', '#ff00ff', '#00ffff'], [2, 'Ｗ', '#ffffff', '#000000'], [4, 'C', null, '#00ff00'],
] } });

test('Merge down presses an art layer into the base, its characters pinned and showing as before', async () => {
  const { project } = await drawing();
  project.addShape(rectShape(8, 4, 24, 12, { fill: '#aa0000' })); // under the art, reaching some of its cells
  project.addShape(BLOCK());
  project.addShape(rectShape(6, 6, 7, 8, { fill: '#00aa00' }));   // over the art's B only
  await settle(project);
  const cells = cellsKey(project);
  expect(project.cells[cellIndex(5, 3, project.cols)].char).toBe('A');
  expect(project.cells[cellIndex(6, 3, project.cols)].char).not.toBe('B');
  project.mergeShapes();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
  const { pins } = project.baseRecords;
  expect(['5,3', '7,3', '9,3'].map((k) => pins.get(k))).toEqual(['A', 'Ｗ', 'C']);
  expect(pins.has('6,3')).toBe(false); // a shape over it: the converter picked there
  project.undo();
  await settle(project);
  expect(project.shapes.size).toBe(3);
  expect(project.baseRecords.pins.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
});

test('a selection\'s Merge down presses an art layer it touches, and the art is the same on the canvas', async () => {
  const { project } = await drawing();
  project.addShape(BLOCK());
  const apart = project.addShape(rectShape(22, 24, 28, 28, { fill: '#00ff00' }));
  await settle(project);
  const cells = cellsKey(project);
  project.mergeDown({ c0: 4, r0: 2, c1: 10, r1: 4 });
  await settle(project);
  expect(keys(project)).toEqual([apart]);
  expect(project.baseRecords.pins.get('5,3')).toBe('A');
  expect(cellsKey(project)).toEqual(cells);
});

test('Into the image leaves an art layer alone', async () => {
  const { project } = await drawing();
  const art = project.addShape(BLOCK());
  await settle(project);
  const cells = cellsKey(project);
  await project.mergeIntoPicture();
  await settle(project);
  expect([...project.shapes.keys()]).toEqual([art]);
  expect(cellsKey(project)).toEqual(cells);
});
