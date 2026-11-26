// Bake and Merge down with shapes: pressed into the base layer's pixels, with nothing on the canvas changing,
// and one undo bringing them back as shapes. A pin a pressed shape covers goes, so the cell still shows the shape.
// In an animation Bake keeps them shapes, with the sliders burnt into their colors.
import { test, expect } from 'vitest';
import { createApp } from 'vue';
import EditToolbar from '@/components/EditToolbar.vue';
import { i18n } from '@/i18n';
import { createTestApp, loadImage, settle, cellsKey, halves } from '../support/app.js';
import { ellipseShape, rectShape, withShape } from '@/document/shapes.js';
import { makeArt } from '@/document/artLayers.js';
import { cellIndex } from '@/lib/Cells.js';
import { asking, useMergeDown } from '@/composables/useMergeDown';
import { toastMessage } from '@/composables/useToast';

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
  project.mergeDown('edit'); // the A is a pin now
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

test('Merge down of the vector layer, then of the layer over it, presses everything in and nothing changes on the canvas', async () => {
  const { project } = await drawing();
  project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' }));
  project.typeAt(4, 2, 'B', { fg: '#ffff00', bg: '#0000ff' });
  project.commitEdit();
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }, { x: 7, y: 6, alpha: 1 }], '#00ff00');
  project.commitEdit();
  await settle(project);
  const cells = cellsKey(project);
  expect(project.mergeDown('edit')).toBe(false); // the vector layer is under it: that goes first
  expect(project.mergeDown('vector')).toBe(true);
  await settle(project);
  expect(project.layers.map((layer) => layer.id)).toEqual(['base', 'edit']);
  expect(project.shapes.size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
  expect(project.mergeDown('edit')).toBe(true);
  await settle(project);
  expect(project.cellsOf('edit').size).toBe(0);
  expect(cellsKey(project)).toEqual(cells);
  project.undo();
  project.undo();
  await settle(project);
  expect(project.shapes.size).toBe(1);
  expect(project.layers.map((layer) => layer.id)).toEqual(['base', 'vector', 'edit']);
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
  project.mergeDown('vector', { c0: 2, r0: 1, c1: 6, r1: 3 });
  await settle(project);
  expect(keys(project)).toEqual([apart, above].sort());
  expect(project.editCellAt(3, 2)?.char).toBe('C'); // the layer over it stays as it was
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
  project.mergeDown('vector', { c0: 4, r0: 2, c1: 10, r1: 4 });
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

test('a base pin under an art cell with colors and no character is still there after Merge down, and the cells are the same', async () => {
  const { project } = await drawing();
  project.typeAt(5, 3, 'Q', { fg: '#ffff00', bg: '#000000' });
  project.commitEdit();
  project.mergeDown('edit'); // the Q is a pin now
  expect(project.baseRecords.pins.get('5,3')).toBe('Q');
  project.addShape(makeArt({ z: 0, m: [1, 0, 0, 1, 5, 6], art: { cols: 1, rows: 1, cells: [[0, null, '#2040a0', '#a0a040']] } }));
  await settle(project);
  const cells = cellsKey(project);
  expect(project.cells[cellIndex(5, 3, project.cols)].char).toBe('Q'); // the pin shows through the art's colors
  project.mergeShapes();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.baseRecords.pins.get('5,3')).toBe('Q');
  expect(cellsKey(project)).toEqual(cells);
});

test('Merge down with paint over a solid art character shows the cell as before', async () => {
  const { project } = await drawing();
  project.addShape(makeArt({ z: 0, m: [1, 0, 0, 1, 5, 6], art: { cols: 1, rows: 1, cells: [[0, '█', '#2040a0', '#a0a040']] } }));
  project.paintStroke([{ x: 5, y: 6, alpha: 1 }], '#00ff00');
  project.commitEdit();
  await settle(project);
  const cells = cellsKey(project);
  project.mergeDown('vector');
  expect(project.mergeDown('edit')).toBe(true);
  await settle(project);
  expect(cellsKey(project)).toEqual(cells);
});

// A vector layer directly on the bottom asks how to merge, as a cells layer does: pressed as it shows, or into the picture.
test('Merge down of a vector layer on the bottom asks how: with shapes, and not when it has none, or shapes are selected', async () => {
  const { project, workspace } = await drawing();
  const { mergeDown, mergePicked } = useMergeDown();
  const key = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(key).layer ?? 'vector';
  expect(project.layers.findIndex((layer) => layer.id === id)).toBe(1); // directly on the bottom
  await settle(project);
  try {
    expect(mergeDown(id)).toBe(false); // asked first: nothing merged yet
    expect(asking.value).toEqual({ id, rect: null });
    expect(project.shapes.size).toBe(1);
    asking.value = null;

    workspace.pickLayer(id);
    workspace.vectorSelected = [key]; // VECTOR's Merge down of a selection: pressed, without asking
    mergePicked(workspace);
    await settle(project);
    expect(asking.value).toBeNull();
    expect(project.shapes.size).toBe(0);
    expect(project.baseLayer.hasPaint).toBe(true);

    await mergeDown(id); // nothing on it now: it just leaves the stack
    await settle(project);
    expect(asking.value).toBeNull();
    expect(project.layerById(id)).toBeUndefined();
  } finally {
    asking.value = null;
  }
});

// Two cells' keys (cellsKey's) alike: one character, and colors no more than a step or two apart on a channel, as the
// same color rounds when it's worked out from the picture's pixels in place of the shape's own (docs/model.md R7).
const alike = (a, b) => {
  const [charA, ...colorsA] = a.split('#'), [charB, ...colorsB] = b.split('#');
  const level = (hex, at) => parseInt(hex.slice(at, at + 2), 16);
  return charA === charB && colorsA.every((hex, i) => [0, 2, 4].every((at) => Math.abs(level(hex, at) - level(colorsB[i], at)) <= 2));
};
const unlike = (now, was) => now.filter((cell, i) => !alike(cell, was[i]));

test('Blend into source image puts a vector layer\'s shapes in the picture, the canvas showing as it did, as one undo step', async () => {
  const { project, workspace } = await drawing();
  const a = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(a).layer ?? 'vector';
  const b = project.addShape(ellipseShape(8, 6, 26, 24, { fill: '#0044aa' }));
  workspace.pickLayer(id);
  await settle(project);
  const cells = cellsKey(project), stack = project.layers.map((layer) => layer.id), image = project.image, version = project.history.version;
  const merged = ['base', ...stack.slice(2)]; // the layer left, and none stays in its place

  expect(await project.mergeShapesIntoPicture(id)).toBe(true);
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.layers.map((layer) => layer.id)).toEqual(merged);
  expect(project.image).not.toBe(image); // they're in the picture now
  expect(project.baseLayer.hasPaint).toBe(false); // not the base's own pixels, as pressing leaves them
  expect(unlike(cellsKey(project), cells)).toEqual([]);
  expect(project.history.version).toBe(version + 1);

  // In the picture, the image filters reach them: pressed into the base's pixels, their cells would stay as they are.
  const inRect = (list) => list.filter((_, i) => i % 30 >= 2 && i % 30 <= 13 && Math.floor(i / 30) >= 1 && Math.floor(i / 30) <= 4);
  project.setSlider('blur', 60);
  project.commitSliders();
  await settle(project);
  expect(unlike(inRect(cellsKey(project)), inRect(cells)).length).toBeGreaterThan(0);

  project.undo(); // the slider
  project.undo(); // the merge: one step
  await settle(project);
  expect(keys(project)).toEqual([a, b].sort());
  expect(project.layers.map((layer) => layer.id)).toEqual(stack);
  expect(project.image).toBe(image);
  expect(cellsKey(project)).toEqual(cells);
  expect([workspace.pickedLayer, project.editId]).toEqual([id, 'edit']); // picked again, and Layer 1 the cells layer in use, as before
  project.redo();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.layers.map((layer) => layer.id)).toEqual(merged);
  expect(unlike(cellsKey(project), cells)).toEqual([]);
});

test('Blend into source image is refused as Merge down is: a vector layer above the bottom', async () => {
  const { project, workspace } = await drawing();
  project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' }));
  const state = () => [project.shapes, project.layers, project.image, project.history.version];
  workspace.pickLayer('edit');
  const upper = project.addLayer('vector', 'edit'); // above a cells layer
  const before = state();
  expect(await project.mergeShapesIntoPicture(upper)).toBe(false);
  expect(state()).toEqual(before);
});

// A vector layer with character settings of its own goes into the base as the two merges it's made of, in one undo
// step: its shapes as paint onto a cells layer put in its place (a cell that shows otherwise there frozen as it showed),
// and that layer into the base. Keep crisp cells keeps what froze as it showed (along a soft edge the shapes are paint,
// in the base's characters, as on a drawing layer: R3), the same as the two merges by hand; Blend into source image
// redraws it in the base's (the question says so). Only the whole layer: its shapes alone can't be pressed as they show.
test('a vector layer with its own characters merges into the base in one step: Keep crisp cells as the two merges by hand, Blend into source image in the base\'s characters', async () => {
  const { project, workspace } = await drawing();
  const key = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(key).layer ?? 'vector';
  const round = project.addShape(ellipseShape(8, 6, 26, 24, { fill: '#0044aa', stroke: '#ffee00', width: 1.5 })); // soft edges
  project.setLayerChars(id, { chars: '▚▞', solids: 0 });
  project.commitLayerChars();
  workspace.pickLayer(id);
  project.render();
  await settle(project);
  const own = () => project.cells.some(({ char }) => char === '▚' || char === '▞');
  const cells = cellsKey(project), look = halves(project), stack = project.layers.map((layer) => layer.id), image = project.image, version = project.history.version;
  const merged = ['base', ...stack.slice(2)], state = () => [keys(project), project.layers.map((layer) => layer.id), cellsKey(project)];
  expect(own()).toBe(true);
  expect(useMergeDown().offWhy(id)).toBeNull();

  toastMessage.value = null;
  expect(project.mergeShapes([key])).toBe(false); // its shapes alone: refused, saying why
  expect(toastMessage.value).toBe('Vector 1 uses custom character settings, so its shapes merge into Base only as an entire layer. Deselect shapes to merge all of Vector 1.');
  expect(project.history.version).toBe(version);

  expect(project.mergeDown(id)).toBe(true); // Keep crisp cells
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.layers.map((layer) => layer.id)).toEqual(merged);
  expect(project.history.version).toBe(version + 1);
  const oneStep = { look: halves(project), pins: [...project.baseRecords.pins] };
  const inside = (list) => list.filter((_, i) => i % 30 >= 3 && i % 30 <= 6 && Math.floor(i / 30) >= 2 && Math.floor(i / 30) <= 3);
  expect(inside(oneStep.look)).toEqual(inside(look)); // where the rectangle covers cells whole, as it showed (a cell one color all over can come back as another character of it)
  project.undo();
  await settle(project);
  expect(state()).toEqual([[key, round].sort(), stack, cells]);
  expect([workspace.pickedLayer, project.editId]).toEqual([id, 'edit']);
  project.redo();
  await settle(project);
  expect([project.shapes.size, project.layers.map((layer) => layer.id), halves(project)]).toEqual([0, merged, oneStep.look]);
  project.undo();
  await settle(project);
  // The same as the two merges by hand: into a drawing layer put under it, then that into the base.
  const by = project.addLayer('cells', 'base');
  await settle(project);
  expect(project.mergeDown(id)).toBe(true);
  await settle(project);
  expect(project.mergeDown(by)).toBe(true);
  await settle(project);
  expect({ look: halves(project), pins: [...project.baseRecords.pins] }).toEqual(oneStep);
  for (let i = 0; i < 3; i++) project.undo();
  await settle(project);
  expect(state()).toEqual([[key, round].sort(), stack, cells]);

  expect(await project.mergeShapesIntoPicture(id)).toBe(true); // Blend into source image
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.layers.map((layer) => layer.id)).toEqual(merged);
  expect(project.image).not.toBe(image);
  expect(own()).toBe(false); // redrawn in the base's characters
  project.undo();
  await settle(project);
  expect(state()).toEqual([[key, round].sort(), stack, cells]);
});

// The question says what each choice of that merge gives up: kept crisp, the shapes' soft edges are redrawn in the
// base's characters; blended, all of it is.
test('Merge down of a vector layer with its own characters into the base says what each choice redraws in the base\'s characters', async () => {
  const { project, workspace, pinia } = await drawing();
  const key = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(key).layer ?? 'vector';
  project.addShape(ellipseShape(8, 6, 26, 24, { fill: '#0044aa', stroke: '#ffee00', width: 1.5 })); // soft edges
  project.setLayerChars(id, { chars: '▚▞', solids: 0 });
  project.commitLayerChars();
  workspace.pickLayer(id);
  await settle(project);
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(pinia).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  try {
    asking.value = { id, rect: null };
    await settle(project);
    const choice = (title) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(title)).textContent;
    expect(choice('Keep crisp cells')).toContain("Soft edges in Vector 1 may change to match Base's characters.");
    expect(choice('Blend into source image')).toContain("Vector 1's custom characters: its paint is redrawn in Base's.");
  } finally {
    asking.value = null;
    toolbar.unmount();
    host.remove();
  }
});

test('shapes that reach no cell are pressed when Blend into source image is asked, so their layer leaves as it would', async () => {
  const { project } = await drawing();
  const key = project.addShape(rectShape(40, 40, 50, 50, { fill: '#ff0000' })), id = project.shapes.get(key).layer ?? 'vector'; // off the 30 × 30 grid
  await settle(project);
  const image = project.image;
  expect(await project.mergeShapesIntoPicture(id)).toBe(true);
  await settle(project);
  expect(project.layerById(id)).toBeUndefined();
  expect(project.layers.map((layer) => layer.kind)).not.toContain('vector');
  expect(project.image).toBe(image);
  project.undo();
  await settle(project);
  expect(keys(project)).toEqual([key]);
});

// While the picture is made the shapes are paint on a layer of the step's own: the drawing is held, so nothing done
// meanwhile lands on that layer or takes the shapes back from under it.
for (const what of ['paint', 'undo', 'slider']) {
  test(`race: ${what} while a vector layer blends into the image: the merge still happens, and one undo brings the shapes back`, async () => {
    const { project, workspace } = await drawing();
    const a = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(a).layer ?? 'vector';
    const b = project.addShape(ellipseShape(8, 6, 26, 24, { fill: '#0044aa' }));
    workspace.pickLayer(id);
    await settle(project);
    const image = project.image, stack = project.layers.map((layer) => layer.id);
    const merging = project.mergeShapesIntoPicture(id), held = project.history.version;
    await new Promise((r) => setTimeout(r, 0));
    if (what === 'paint') { project.paintStroke([{ x: 2, y: 2, alpha: 1 }], '#ff00ff'); project.commitEdit(); } // refused: held
    if (what === 'undo') project.undo(); // refused too: the second shape stays added
    if (what === 'slider') { project.setSlider('contrast', 150); project.commitSliders(); }
    expect(project._merging).toBe(true); // it landed while the picture was being made
    expect(project.history.version).toBe(what === 'slider' ? held + 1 : held); // a stroke and an undo are refused: no step, none taken back
    expect(await merging).toBe(true);
    await settle(project);
    expect(project._paused).toBe(false);
    expect(project.image).not.toBe(image);
    expect(project.shapes.size).toBe(0);
    expect(project.layers.map((layer) => layer.id)).toEqual(['base', ...stack.slice(2)]);
    project.undo(); // the merge, whole
    await settle(project);
    expect(keys(project)).toEqual([a, b].sort());
    expect(project.layers.map((layer) => layer.id)).toEqual(stack);
    expect(project.contrast).toBe(what === 'slider' ? 150 : 100); // the slider's own step is under the merge's
  });
}

test('another drawing opened while a vector layer blends into the image is left as it opened', async () => {
  const { project, workspace } = await drawing();
  const key = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(key).layer ?? 'vector';
  workspace.pickLayer(id);
  await settle(project);
  const merging = project.mergeShapesIntoPicture(id);
  await project.setBlankCanvas({ cols: 12, rows: 8 });
  expect(await merging).toBe(false);
  await settle(project);
  expect(project._paused).toBe(false);
  expect([project.cols, project.rows, project.shapes.size]).toEqual([12, 8, 0]);
  expect(project.layers.map((layer) => layer.id)).toEqual(['base']);
});

// Merging the picked vector layer away moves the pick to the layer under it, and the tools with it (followLayerPick).
// Undo brings the layer back picked, so it puts back the cells layer the tools drew on then, too.
test('undoing a merge that took the picked vector layer puts back the cells layer in use, and the one the art tabs return to', async () => {
  const { project, workspace } = await drawing();
  const key = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(key).layer ?? 'vector';
  workspace.pickLayer(id); // VECTOR, with Layer 1 the cells layer in use
  await settle(project);
  const state = () => [workspace.pickedLayer, workspace.editorTab, project.editId, workspace.lastCellsPick];
  const before = state();
  expect(before).toEqual([id, 'vector', 'edit', 'edit']);
  expect(project.mergeDown(id)).toBe(true);
  await settle(project);
  expect(state().slice(0, 3)).toEqual(['base', workspace.viewTab, 'base']); // the layer left: the one under it, and the tools on it
  project.undo();
  await settle(project);
  expect(state()).toEqual(before);
});

test('with no cells layer above the base, undoing that merge leaves none in use again', async () => {
  const { project, workspace } = await drawing();
  const key = project.addShape(rectShape(2, 2, 14, 10, { fill: '#ff0000' })), id = project.shapes.get(key).layer ?? 'vector';
  project.deleteLayer('edit'); // the last cells layer: the pick moves to the vector layer under it, and nothing's in use
  await settle(project);
  const state = () => [workspace.pickedLayer, workspace.editorTab, project.layerById(project.editId)?.id ?? null];
  expect(state()).toEqual([id, 'vector', null]);
  expect(project.mergeDown(id)).toBe(true);
  await settle(project);
  expect(state()).toEqual(['base', workspace.viewTab, 'base']);
  project.undo();
  await settle(project);
  expect(state()).toEqual([id, 'vector', null]);
  project.redo(); // and again: the same either way
  await settle(project);
  expect(project.layerById(id)).toBeUndefined();
  project.undo();
  await settle(project);
  expect(state()).toEqual([id, 'vector', null]);
});
