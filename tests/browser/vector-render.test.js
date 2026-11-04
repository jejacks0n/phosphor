// The vector layer's shapes: drawn over the base layer's own pixels and converted with the picture, under
// edit cells and paint; a change redraws only its area and comes out as a full render would; every change
// is one undo step, through the ledger.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { outputKey } from '../support/scenes.js';
import { layoutWide } from '@/lib/Cells';
import { MOST_SHAPES, makeShape, outlines, rectShape, ellipseShape, translation, transformed, rotation, scaling, setSmooth, withShape, worldPoints } from '@/document/shapes';
import { paintShape } from '@/document/ShapeLayer.js';
import { toastMessage } from '@/composables/useToast';
import { shapeAt } from '@/lib/shapeHits.js';
import vnode from '@/tools/vnode.js';
import { gradientHandles } from '@/tools/gradientHandles.js';

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

// Forward moves a shape above the nearest one it overlaps, and every other pair keeps its order: here a shape
// it doesn't overlap sits between them, and overlaps the one it's moved above.
test('Forward and Back change no order but the moved shape\'s', async () => {
  const { project } = await gradient();
  const k = project.addShape(rectShape(2, 2, 8, 8, RED));
  const a = project.addShape(rectShape(12, 2, 20, 8, { fill: '#00ff00' }));
  const o = project.addShape(rectShape(6, 4, 16, 6, { fill: '#0000ff' }));
  const order = () => [...project.shapes].sort(([, x], [, y]) => x.z - y.z).map(([key]) => key);
  expect(at(project, 14, 2).bg.hex).toBe('#0000ff'); // O over A
  project.restackShapes([k], 'forward');
  expect(order()).toEqual([a, o, k]);
  expect(at(project, 14, 2).bg.hex).toBe('#0000ff');
  expect(at(project, 7, 2).bg.hex).toBe('#ff0000');
  project.restackShapes([k], 'back');
  expect(order()).toEqual([a, k, o]);
  expect(new Set(order().map((key) => project.shapes.get(key).z)).size).toBe(3); // no two at one height
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
});

// What the document holds is what a file or a room would take back, so nothing drawn is lost on a reload.
test('a shape squashed flat or past the limits isn\'t taken: an update leaves it as it was', async () => {
  const { project } = await gradient();
  const key = project.addShape(rectShape(2, 2, 10, 10, RED));
  const kept = project.shapes.get(key);
  project.updateShapes([[key, withShape(kept, { m: [0, 0, 0, 1, 0, 0] })]]);
  expect(project.shapes.get(key)).toBe(kept);
  project.updateShapes([[key, withShape(kept, { m: [1, 0, 0, 1, 0, 1e8] })]]);
  expect(project.shapes.get(key)).toBe(kept);
  expect(project.addShape(rectShape(0, 0, 30000, 4, RED))).toBe(null);
  expect(project.shapes.size).toBe(1);
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

// A drag under Floyd–Steinberg or the Number palette: what's outside the shapes' area holds still while it
// goes, and its end is a full render's.
for (const [quantize, settings] of [['cga', { dither: 100, ditherStyle: 'floyd' }], ['count', { dither: 0 }], ['count', { dither: 100, ditherStyle: 'floyd' }]]) {
  test(`under ${quantize} ${JSON.stringify(settings)} a drag changes only its area, and its end is a full render's`, async () => {
    const { project } = await gradient(40, 40);
    Object.assign(project, { quantize, ...settings });
    await settle(project);
    const shape = project.addShape(rectShape(4, 4, 10, 10, RED));
    await settle(project);
    const before = key(project.cells);
    project.beginEdit();
    const start = project.shapes.get(shape);
    for (let k = 1; k <= 5; k++) {
      project.updateShapes([[shape, transformed(start, translation(1.5 * k, k))]]);
      // the area the shape covered on any move: cols 3 to 19, lines 1 to 8 (grid y 3 to 17)
      const outside = key(project.cells).filter((c, i) => c !== before[i] && !(i % 40 >= 3 && i % 40 <= 19 && Math.floor(i / 40) >= 1 && Math.floor(i / 40) <= 8));
      expect(outside).toEqual([]);
    }
    project.commitEdit();
    await settle(project);
    expect(key(project.cells)).toEqual(key(fullRebuild(project)));
    const partial = { output: outputKey(project), cells: key(project.cells) };
    expect(await fromScratch(project)).toEqual(partial);
  });
}

test('editing a point of a rotated shape moves it where the pointer is, its handle too, as one step each', async () => {
  const { project, workspace } = await gradient();
  const key = project.addShape(transformed(rectShape(4, 4, 14, 12, RED), rotation(Math.PI / 6, 9, 8)));
  workspace.vectorSelected = [key];
  workspace.vectorPoints = key;
  const ctx = { project, workspace, view: 'vector', unit: { x: 8, y: 8 } };
  const before = project.history.version;
  const corner = worldPoints(project.shapes.get(key))[2];
  expect(vnode.begin(ctx, corner)).toBe(true);
  vnode.move(ctx, corner, { x: 12, y: 13 });
  vnode.move(ctx, corner, { x: 10, y: 10 });
  vnode.end(ctx);
  expect(workspace.vectorPoint).toBe(2);
  const moved = worldPoints(project.shapes.get(key))[2];
  expect(moved.x).toBeCloseTo(10, 1);
  expect(moved.y).toBeCloseTo(10, 1);
  expect(project.history.version).toBe(before + 1);

  // The outline's middle: a point there, selected; then its handle dragged to a place in the world.
  const [a, b] = worldPoints(project.shapes.get(key));
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  vnode.begin(ctx, middle);
  vnode.end(ctx);
  expect(project.shapes.get(key).points).toHaveLength(5);
  expect(workspace.vectorPoint).toBe(1);
  project.updateShapes([[key, setSmooth(project.shapes.get(key), 1, true)]]);
  const handle = worldPoints(project.shapes.get(key))[1].out;
  vnode.begin(ctx, handle);
  vnode.move(ctx, handle, { x: 20, y: 2 });
  vnode.end(ctx);
  const out = worldPoints(project.shapes.get(key))[1].out;
  expect(out.x).toBeCloseTo(20, 1);
  expect(out.y).toBeCloseTo(2, 1);

  // Empty canvas leaves the points, and the selection stays.
  vnode.begin(ctx, { x: 28, y: 28 });
  vnode.end(ctx);
  expect(workspace.vectorPoints).toBe(null);
  expect(workspace.vectorSelected).toEqual([key]);
});

const corners = (a, b) => [[a, a, 0, 0, 0, 0, 0], [b, a, 0, 0, 0, 0, 0], [b, b, 0, 0, 0, 0, 0], [a, b, 0, 0, 0, 0, 0]];

test('a ring\'s hole shows what is under it, and a click there misses the ring', async () => {
  const { project } = await gradient();
  const bare = key(project.cells);
  const middle = 7 * project.cols + 14; // grid pixels (14, 14..15)
  for (const [inner, rule, holed] of [[corners(10, 18), 'evenodd', true], [corners(10, 18).reverse(), undefined, true], [corners(10, 18), undefined, false]]) {
    const k = project.addShape(makeShape({ points: corners(2, 26), closed: true, more: [[true, inner]], rule, fill: '#ff0000' }));
    await settle(project);
    expect(key(project.cells)[middle] === bare[middle]).toBe(holed);
    expect(at(project, 4, 2).bg.hex).toBe('#ff0000');
    expect(shapeAt(project.shapes, 14, 14.5, 0.1)).toBe(holed ? null : k);
    expect(shapeAt(project.shapes, 4, 4.5, 0.1)).toBe(k);
    expect(key(project.cells)).toEqual(key(fullRebuild(project)));
    project.deleteShapes([k]);
  }
});

test('caps and joins draw as set, and a sharp miter is redrawn where it reaches', async () => {
  const { project } = await gradient(80, 80); // big enough that a move redraws only its area
  const bare = key(project.cells);
  const changed = () => key(project.cells).filter((c, i) => c !== bare[i]).length;
  const vee = (style) => makeShape({ points: [[6, 24, 0, 0, 0, 0, 0], [14, 10, 0, 0, 0, 0, 0], [22, 24, 0, 0, 0, 0, 0]], closed: false, stroke: '#ff0000', width: 6, ...style });
  const counts = {};
  for (const [name, style] of Object.entries({ butt: { cap: 'butt' }, square: { cap: 'square' }, miter: { join: 'miter', miter: 10 }, bevel: { join: 'bevel' } })) {
    const k = project.addShape(vee(style));
    await settle(project);
    counts[name] = changed();
    if (name === 'miter') {
      const tip = at(project, 14, 3); // grid pixels (14, 6..7): the miter's tip reaches y 4, a bevel's only 7.4
      expect([tip.fg.hex, tip.bg.hex]).toContain('#ff0000');
      project.updateShapes([[k, transformed(project.shapes.get(k), translation(4, 0))]]);
      await settle(project);
      const partial = { output: outputKey(project), cells: key(project.cells) };
      expect(await fromScratch(project)).toEqual(partial); // nothing left behind where the tip was
    }
    project.deleteShapes([k]);
  }
  expect(counts.square).toBeGreaterThan(counts.butt);
  expect(counts.miter).toBeGreaterThan(counts.bevel);
});

test('the Node tool edits an inner outline\'s points, adds to it, and deletes it before the shape', async () => {
  const { project, workspace } = await gradient();
  const k = project.addShape(makeShape({ points: corners(2, 26), closed: true, more: [[true, corners(10, 18)]], rule: 'evenodd', fill: '#ff0000' }));
  workspace.vectorSelected = [k];
  workspace.vectorPoints = k;
  const ctx = { project, workspace, view: 'vector', unit: { x: 8, y: 8 } };
  const inner = (s = project.shapes.get(k)) => outlines(s)[1].points;
  expect(vnode.begin(ctx, { x: 18, y: 18 })).toBe(true); // inner point 2, flat 6
  vnode.move(ctx, { x: 18, y: 18 }, { x: 20, y: 19 });
  vnode.end(ctx);
  expect(workspace.vectorPoint).toBe(6);
  expect(inner()[2].slice(0, 2)).toEqual([20, 19]);
  expect(outlines(project.shapes.get(k))[0].points).toEqual(corners(2, 26));

  vnode.begin(ctx, { x: 14, y: 10 }); // the inner top edge's middle: a point there, on the inner outline
  vnode.end(ctx);
  expect(inner()).toHaveLength(5);
  expect(workspace.vectorPoint).toBe(5);

  const removeSelected = () => vnode.keydown(ctx, { key: 'Delete' });
  for (let i = 0; i < 3; i++) {
    workspace.vectorPoint = 4;
    removeSelected();
  }
  expect(outlines(project.shapes.get(k))).toHaveLength(2);
  expect(inner()).toHaveLength(2);
  workspace.vectorPoint = 4;
  removeSelected();
  expect(outlines(project.shapes.get(k))).toHaveLength(1); // the inner outline went; the shape stays
  expect(project.shapes.get(k).more).toBeUndefined();
});

test('Join makes a ring from a square and a smaller one inside it, and Separate takes it apart, one step each', async () => {
  const { project } = await gradient();
  const bare = key(project.cells), middle = 7 * project.cols + 14;
  const outer = project.addShape(rectShape(2, 2, 26, 26, RED)), inner = project.addShape(rectShape(10, 10, 18, 18, { fill: '#0000ff' }));
  await settle(project);
  const before = project.history.version, two = key(project.cells);
  expect(project.joinShapes([inner, outer])).toBe(outer);
  await settle(project);
  expect([...project.shapes.keys()]).toEqual([outer]);
  expect(key(project.cells)[middle]).toBe(bare[middle]); // the inner square is a hole now
  expect(project.history.version).toBe(before + 1);
  const parts = project.separateShape(outer);
  expect(parts).toHaveLength(2);
  expect(parts[0]).toBe(outer);
  await settle(project);
  expect(project.shapes.size).toBe(2);
  expect(key(project.cells)[middle]).not.toBe(bare[middle]);
  expect(project.history.version).toBe(before + 2);
  project.undo();
  await settle(project);
  expect(project.shapes.size).toBe(1);
  project.undo();
  await settle(project);
  expect(key(project.cells)).toEqual(two);
  expect(project.joinShapes([outer])).toBe(null); // one shape: nothing to join
  expect(project.separateShape(inner)).toBe(null); // one outline: nothing to separate
});

test('addShapes puts copies on top, in their order, as one step, selected; past a frame\'s shapes, none', async () => {
  const { project, workspace } = await gradient();
  const a = project.addShape(rectShape(2, 2, 10, 10, RED)), b = project.addShape(rectShape(12, 2, 20, 10, { fill: '#0000ff' }));
  const version = project.history.version, copies = [project.shapes.get(a), project.shapes.get(b)];
  const keys = project.addShapes(copies);
  expect(keys).toHaveLength(2);
  expect(keys.map((k) => project.shapes.get(k).points)).toEqual(copies.map((s) => s.points));
  expect(keys.map((k) => project.shapes.get(k).z)).toEqual([2, 3]);
  expect(workspace.vectorSelected).toEqual(keys);
  expect(workspace.activeTool).toBe('vselect');
  expect(project.history.version).toBe(version + 1);
  project.undo();
  expect([...project.shapes.keys()]).toEqual([a, b]);
  toastMessage.value = null;
  expect(project.addShapes(Array.from({ length: MOST_SHAPES - 1 }, () => copies[0]))).toEqual([]);
  expect(toastMessage.value).toContain(String(MOST_SHAPES));
  expect(project.shapes.size).toBe(2);
});

test('paused in a room, Join, Separate and an SVG change nothing', async () => {
  const { project } = await gradient();
  const outer = project.addShape(rectShape(2, 2, 26, 26, RED)), inner = project.addShape(rectShape(10, 10, 18, 18, { fill: '#0000ff' }));
  const ring = project.addShape(rectShape(2, 2, 26, 26, RED));
  project.joinShapes([ring, project.addShape(rectShape(10, 10, 18, 18, RED))]);
  const before = new Map(project.shapes), version = project.history.version;
  project._paused = true;
  project.joinShapes([inner, outer]);
  project.separateShape(ring);
  project.addSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>');
  project.addShapes([project.shapes.get(outer)]);
  expect(project.shapes).toEqual(before);
  expect(project.history.version).toBe(version);
});

// A shape painted alone at 4 px a grid pixel on black: the color at grid pixel (x, y).
function painted(shape, w = 40, h = 40) {
  const K = 4, ctx = new OffscreenCanvas(w * K, h * K).getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w * K, h * K);
  paintShape(ctx, shape, K);
  return (x, y) => [...ctx.getImageData(Math.floor(x * K), Math.floor(y * K), 1, 1).data.slice(0, 3)];
}
const near = (a, b, by = 24) => a.every((v, i) => Math.abs(v - b[i]) <= by);
const RED_TO_BLUE = [[0, '#ff0000'], [1, '#0000ff']];

test('a linear gradient runs from its first stop to its last across the shape, and turns with it', async () => {
  // Across the rectangle's box: (4, 4) to (36, 4) in the shape's own space.
  const fill = { type: 'linear', stops: RED_TO_BLUE, m: [32, 0, 0, 32, 4, 4] };
  const shape = withShape(rectShape(4, 4, 36, 36, RED), { fill });
  const px = painted(shape);
  expect(near(px(5, 20), [255, 0, 0], 40)).toBe(true);
  expect(near(px(35, 20), [0, 0, 255], 40)).toBe(true);
  expect(near(px(20, 20), [128, 0, 128], 24)).toBe(true);
  expect(px(2, 20)).toEqual([0, 0, 0]); // only inside the shape
  // Turned a quarter about its middle: the first stop is at the top.
  const turned = painted(transformed(shape, rotation(Math.PI / 2, 20, 20)));
  expect(near(turned(20, 5), [255, 0, 0], 40)).toBe(true);
  expect(near(turned(20, 35), [0, 0, 255], 40)).toBe(true);
  // And it converts with the picture: the cells on the left are redder than those on the right.
  const { project } = await gradient(40, 40);
  project.addShape(shape);
  await settle(project);
  const red = (col) => parseInt(at(project, col, 10).fg.hex.slice(1, 3), 16);
  expect(red(5)).toBeGreaterThan(red(34) + 100);
});

test('a gradient stroke runs along its gradient, as wide as a solid one, its edges as soft', async () => {
  // A line across, 4 wide, red at its left end to blue at its right.
  const line = makeShape({ points: [[4, 20, 0, 0, 0, 0, 0], [36, 20, 0, 0, 0, 0, 0]], closed: false, fill: null, stroke: '#ffffff', width: 4, cap: 'butt' });
  const stroke = { type: 'linear', stops: RED_TO_BLUE, m: [32, 0, 0, 32, 4, 20] };
  const px = painted(withShape(line, { stroke })), solid = painted(line);
  expect(near(px(5, 20), [255, 0, 0], 40)).toBe(true);
  expect(near(px(35, 20), [0, 0, 255], 40)).toBe(true);
  expect(near(px(20, 20), [128, 0, 128], 24)).toBe(true);
  expect(px(20, 23)).toEqual([0, 0, 0]); // its width, not the gradient's box
  for (const y of [17.9, 18, 21.9, 22]) expect(px(20, y).some((v) => v > 0), `y ${y}`).toBe(solid(20, y).some((v) => v > 0));
  // Rotated with its shape, the gradient turns too; the stroke stays 4 wide.
  const turned = painted(transformed(withShape(line, { stroke }), rotation(Math.PI / 2, 20, 20)));
  expect(near(turned(20, 5), [255, 0, 0], 40)).toBe(true);
  expect(turned(23, 20)).toEqual([0, 0, 0]);
});

test('a radial gradient stretched with its shape is an ellipse', async () => {
  // A circle of radius 10 about (20, 20), red in the middle to blue at the rim, then the shape stretched ×1.5
  // across about its middle.
  const fill = { type: 'radial', stops: RED_TO_BLUE, m: [10, 0, 0, 10, 20, 20] };
  const shape = transformed(withShape(rectShape(10, 10, 30, 30, RED), { fill }), scaling(1.5, 1, 20, 20));
  const px = painted(shape);
  expect(near(px(20, 20), [255, 0, 0], 40)).toBe(true);
  // Half way out: 7.5 across, 5 down, the same color.
  expect(near(px(27.5, 20), px(20, 25), 12)).toBe(true);
  expect(near(px(27.5, 20), [128, 0, 128], 40)).toBe(true);
  expect(near(px(20, 29.5), [0, 0, 255], 40)).toBe(true);
  // A focal point off the center: the red is there.
  const focal = painted(withShape(rectShape(10, 10, 30, 30, RED), { fill: { ...fill, f: [0.5, 0] } }));
  expect(near(focal(25, 20), [255, 0, 0], 40)).toBe(true);
});

test('the Node tool\'s Place gradient: a drag across a shape gives it a gradient from the press to the let-go (Alt: radial; Shift: straight), one step; a click doesn\'t, nor a drag on Edit points', async () => {
  const { project, workspace } = await gradient(40, 40);
  const key = project.addShape(withShape(rectShape(10, 10, 30, 20, RED), {}));
  workspace.setActiveTool('vnode');
  workspace.editBgColor = '#0000ff';
  const ctx = { project, workspace, view: 'vector', unit: { x: 8, y: 8 } };
  const drag = (from, to, event = {}) => {
    vnode.begin(ctx, from, event);
    vnode.move(ctx, from, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
    vnode.move(ctx, from, to);
    vnode.end(ctx);
  };
  const fill = () => project.shapes.get(key).fill;
  const ends = () => {
    const { p0, p1 } = gradientHandles(project.shapes.get(key), 'fill');
    return [p0, p1].map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
  };

  // Edit points (the start): a drag across the shape is no gradient.
  expect(workspace.vectorNodeMode).toBe('points');
  drag({ x: 12, y: 15 }, { x: 28, y: 15 });
  expect(fill()).toBe('#ff0000');
  workspace.vectorNodeMode = 'gradient';
  // A click: its gradient edited, and no gradient yet.
  drag({ x: 12, y: 15 }, { x: 12, y: 15 });
  expect(workspace.vectorPoints).toBe(key);
  expect(fill()).toBe('#ff0000');
  const version = project.history.version;
  // A drag: linear, from the fill's color to the background color, where it was dragged.
  drag({ x: 12, y: 15 }, { x: 28, y: 15 });
  expect(fill()).toEqual({ type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [16, 0, 0, 16, 12, 15] });
  expect(project.history.version).toBe(version + 1);
  expect(workspace.vectorPoints).toBe(key);
  // Again with Alt, away from its handles: radial, the press its middle and the let-go its edge; the stops kept.
  drag({ x: 20, y: 12 }, { x: 20, y: 16 }, { altKey: true });
  expect(fill()).toMatchObject({ type: 'radial', stops: [[0, '#ff0000'], [1, '#0000ff']] });
  expect(ends()).toEqual([[20, 12], [20, 16]]);
  // Shift: straight across.
  workspace.isShiftPressed = true;
  drag({ x: 14, y: 14 }, { x: 26, y: 16 });
  workspace.isShiftPressed = false;
  expect(fill().type).toBe('linear');
  expect(ends()).toEqual([[14, 14], [26, 14]]);
  project.undo();
  project.undo();
  project.undo();
  expect(fill()).toBe('#ff0000');

  // A turned shape: the gradient is where it was dragged on the canvas.
  const turned = withShape(project.shapes.get(key), { m: [0, 1, -1, 0, 40, 0] }); // x 20 to 30, y 10 to 30
  project.updateShapes([[key, turned]]);
  workspace.vectorPoints = null;
  drag({ x: 25, y: 12 }, { x: 25, y: 28 });
  expect(ends()).toEqual([[25, 12], [25, 28]]);
  // Empty canvas: nothing edited.
  drag({ x: 2, y: 36 }, { x: 2, y: 36 });
  expect(workspace.vectorPoints).toBe(null);
});

test('the Node tool\'s Place gradient, on a shape with a gradient, moves, stretches and turns it, and adds, slides and removes stops, one step each', async () => {
  const { project, workspace } = await gradient(40, 40);
  const fill = { type: 'linear', stops: RED_TO_BLUE, m: [20, 0, 0, 20, 10, 15] }; // (10, 15) to (30, 15), on the outline
  const key = project.addShape(withShape(rectShape(10, 10, 30, 20, RED), { fill }));
  workspace.vectorSelected = [key];
  workspace.setActiveTool('vnode');
  workspace.vectorNodeMode = 'gradient';
  workspace.vectorPoints = key;
  const ctx = { project, workspace, view: 'vector', unit: { x: 8, y: 8 } };
  const drag = (from, ...to) => {
    const took = vnode.begin(ctx, from, {});
    let at = from;
    for (const p of to) {
      vnode.move(ctx, at, p);
      at = p;
    }
    vnode.end(ctx);
    return took;
  };
  const press = (key) => vnode.keydown(ctx, new KeyboardEvent('keydown', { key }));
  const handles = () => gradientHandles(project.shapes.get(key));
  const steps = () => project.history.version;
  const round = (p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100];
  let version;

  version = steps();
  // The line, dragged: the gradient moves.
  expect(drag({ x: 20, y: 15 }, { x: 21, y: 16 }, { x: 22, y: 17 })).toBe(true);
  expect(project.shapes.get(key).fill.m).toEqual([20, 0, 0, 20, 12, 17]);
  expect(steps()).toBe(++version);

  // An end, dragged: the other stays, and the gradient stretches and turns.
  drag(handles().p1, { x: 32, y: 27 }, { x: 32, y: 37 });
  expect(round(handles().p0)).toEqual([12, 17]);
  expect(round(handles().p1)).toEqual([32, 37]);
  expect(steps()).toBe(++version);
  // Shift: at 45° (or across, or up and down).
  workspace.isShiftPressed = true;
  drag(handles().p1, { x: 30, y: 30 }, { x: 33, y: 36 });
  workspace.isShiftPressed = false;
  const [dx, dy] = [handles().p1.x - handles().p0.x, handles().p1.y - handles().p0.y];
  expect(dx).toBeCloseTo(dy, 5);
  expect(steps()).toBe(version + 1);
  project.undo();
  expect(round(handles().p1)).toEqual([32, 37]);
  version = steps();

  // A click on the line: a stop there, in the color the gradient has there, selected.
  const middle = { x: 22, y: 27 };
  drag(middle);
  const stops = () => project.shapes.get(key).fill.stops;
  expect(stops()).toHaveLength(3);
  expect(stops()[1][0]).toBeCloseTo(0.5, 2);
  expect(stops()[1][1]).toMatch(/^#(7f|80)00(7f|80)$/);
  expect(workspace.vectorStop).toBe(1);
  expect(steps()).toBe(++version);

  // The stop, dragged along the line: its offset; past another, it takes its place in order.
  drag(handles().stops[1].at, { x: 17, y: 22 });
  expect(stops()[1][0]).toBeCloseTo(0.25, 2);
  expect(steps()).toBe(++version);
  // A click on a stop selects it, and changes nothing.
  workspace.vectorStop = null;
  drag(handles().stops[2].at);
  expect(workspace.vectorStop).toBe(2);
  expect(steps()).toBe(version);
  // Dragged well off the line: gone (but two always stay).
  drag(handles().stops[1].at, { x: 18, y: 22 }, { x: 30, y: 10 });
  expect(stops()).toHaveLength(2);
  expect(steps()).toBe(version + 1);
  project.undo();
  expect(stops()).toHaveLength(3);
  // Delete takes the selected stop, not a point; Esc lets it go, and the shape is still edited.
  workspace.vectorStop = 1;
  press('Delete');
  expect(stops()).toHaveLength(2);
  expect(project.shapes.get(key).points).toHaveLength(4);
  project.undo();
  workspace.vectorStop = 1;
  press('Escape');
  expect(workspace.vectorStop).toBe(null);
  expect(workspace.vectorPoints).toBe(key);
  project.redo();
  // With two left, one dragged off stays.
  const two = withShape(project.shapes.get(key), { fill: { ...project.shapes.get(key).fill, stops: [[0.2, '#ff0000'], [0.8, '#0000ff']] } });
  project.updateShapes([[key, two]]);
  drag(handles().stops[0].at, { x: 18, y: 22 }, { x: 30, y: 10 });
  expect(stops()).toHaveLength(2);

  // A radial gradient: its center moves it, its radius handle stretches it.
  project.updateShapes([[key, withShape(project.shapes.get(key), { fill: { type: 'radial', stops: RED_TO_BLUE, m: [5, 0, 0, 5, 20, 15] } })]]);
  drag({ x: 20, y: 15 }, { x: 22, y: 16 });
  expect(project.shapes.get(key).fill.m).toEqual([5, 0, 0, 5, 22, 16]);
  drag(handles().p1, { x: 32, y: 16 });
  expect(project.shapes.get(key).fill.m.map((v) => Math.round(v * 100) / 100)).toEqual([10, 0, 0, 10, 22, 16]);
  // A press on another shape edits it instead, its stop let go.
  const other = project.addShape(rectShape(2, 30, 8, 38, RED));
  workspace.vectorStop = 0;
  vnode.begin(ctx, { x: 5, y: 34 }, {});
  vnode.end(ctx);
  expect(workspace.vectorSelected).toEqual([other]);
  expect([workspace.vectorPoints, workspace.vectorStop]).toEqual([other, null]);
});
