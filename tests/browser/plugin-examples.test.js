// The three official examples of the new kinds (plugins/ at the repo's top): Smear, a brush; Superformula, a shape; and
// Aberration, a filter. Each script is read as an install reads it (readScript of importScript), and the fixture list's
// entries for them pass the Marketplace's hash check.
import { test, expect, afterEach, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import smearText from '../../plugins/smear/smear.js?raw';
import superformulaText from '../../plugins/superformula/superformula.js?raw';
import aberrationText from '../../plugins/aberration/aberration.js?raw';
import { importScript, readScript, readOutlines } from '@/plugins/script.js';
import { optionValues, scriptOptions, solverRef, onFilterFailure } from '@/plugins/solvers.js';
import { getTool } from '@/tools';
import { usePluginStore } from '@/store/PluginStore';
import { useWorkspaceStore } from '@/store/WorkspaceStore';
import WebGLProcessor from '@/lib/WebGLProcessor.js';
import { ctx2d } from '@/lib/Canvas.js';
import { PALETTES } from '@/lib/ColorUtils.js';
import { createTestApp, settle } from '../support/app.js';
import { onPlugin } from '../support/pluginSolvers.js';
import { ownDatabase } from '../support/socialDatabase.js';
import { ownHangMark } from '../support/ownHangMark.js';
import { serveMarket } from '../support/servedMarket.js';

const read = async (text) => readScript(await importScript(text));
let dropped = [], unlisten = [];
beforeEach(() => ownHangMark('plugin-examples'));
afterEach(() => {
  for (const id of dropped) usePluginStore().dropScript(id);
  for (const off of unlisten) off();
  dropped = [];
  unlisten = [];
  localStorage.removeItem('phosphor.pluginTools');
  vi.restoreAllMocks();
});

// ---- Smear ----

const RED = { r: 255, g: 0, b: 0, a: 1 }, BLUE = { r: 0, g: 0, b: 255, a: 1 };
const at = (x, y) => ({ x: x + 0.5, y: y + 0.5 });

// A 20 x 20 canvas (20 x 20 pixels, 10 rows of cells) with a layer, Smear on, and a stroke drawn with it: begin, a move between each two
// points, end.
async function smearing() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(app.project);
  app.workspace.editorTab = 'input';
  const [ref] = (await onPlugin({ brushes: [...(await read(smearText)).brushes] }, { pluginId: 'phosphor.smear' })).brushes;
  dropped.push('phosphor.smear');
  const tool = getTool(ref), ctx = { project: app.project, workspace: app.workspace, view: 'input' };
  const stroke = (points) => {
    tool.begin(ctx, points[0], {});
    for (let i = 1; i < points.length; i++) tool.move(ctx, points[i - 1], points[i]);
    tool.end(ctx);
  };
  return { ...app, ref, stroke };
}
// Red left of column 10 and blue from it, on rows 4 to 15, as pixels of the picked layer, or of the base.
const RED_BLUE = [];
for (let y = 4; y < 16; y++) for (let x = 0; x < 20; x++) RED_BLUE.push({ x, y, ...(x < 10 ? RED : BLUE) });
const paintAt = (project, x, y) => project.paintLayer.pixelAt(x, y);
const layerPaint = (project) => RED_BLUE.map(({ x, y }) => paintAt(project, x, y));

test('Smear: a drag across a red|blue edge moves red into blue, and blue into red, the way it goes', async () => {
  const { project, stroke } = await smearing();
  project.putEditPixels(RED_BLUE);
  project.commitEdit();
  // Rightward along row 10, the dab's middle: the first blue pixel takes Strength's 60% of the red a step back of it,
  // the red beside it has red a step back (unchanged), and the next blue pixel has blue a step back (unchanged).
  stroke([at(4, 10), at(8, 10), at(12, 10), at(16, 10)]);
  expect(paintAt(project, 10, 10)).toMatchObject({ r: 153, g: 0, b: 102, a: 1 });
  expect(paintAt(project, 9, 10)).toEqual(RED);
  expect(paintAt(project, 11, 10)).toEqual(BLUE);
  project.undo();
  stroke([at(16, 10), at(12, 10), at(8, 10), at(4, 10)]); // leftward: the last red pixel takes blue
  expect(paintAt(project, 9, 10)).toMatchObject({ r: 102, g: 0, b: 153, a: 1 });
  expect(paintAt(project, 10, 10)).toEqual(BLUE);
  expect(paintAt(project, 8, 10)).toEqual(RED);
});

test('Smear: a press alone changes nothing', async () => {
  const { project, stroke } = await smearing();
  project.putEditPixels(RED_BLUE);
  project.commitEdit();
  const before = layerPaint(project);
  stroke([at(10, 10)]);
  expect(layerPaint(project)).toEqual(before);
});

test('Smear: Reads This layer on a clear layer changes nothing; What shows smears the picture under it', async () => {
  const { project, workspace, ref, stroke } = await smearing();
  const layer = project.editId;
  workspace.pickLayer('base');
  project.paintEditPixels(RED_BLUE.map((pixel) => ({ ...pixel, alpha: 1 })), 100, false);
  project.commitEdit();
  workspace.pickLayer(layer);
  workspace.pluginTools[`brush:${ref}`] = { reads: 1 };
  stroke([at(4, 10), at(16, 10)]);
  expect(layerPaint(project).every((pixel) => pixel === null)).toBe(true);
  workspace.pluginTools[`brush:${ref}`] = { reads: 0 };
  stroke([at(4, 10), at(16, 10)]);
  // The picture's red laid at 60% over the clear layer, where it differs from what shows; nowhere else.
  expect(paintAt(project, 10, 10)).toMatchObject({ r: 255, g: 0, b: 0 });
  expect(paintAt(project, 10, 10).a).toBeCloseTo(0.6, 2);
  expect(paintAt(project, 9, 10)).toBe(null);
  expect(paintAt(project, 11, 10)).toBe(null);
});

// ---- Superformula ----

const outlineOf = async (values = {}) => {
  const [def] = (await read(superformulaText)).shapes;
  return readOutlines(def.outline(scriptOptions(def, optionValues(def, values))));
};

test('Superformula: the default outline is one closed outline of 120 corners, all in 0-1, touching each side', async () => {
  const outlines = await outlineOf();
  expect(outlines).toHaveLength(1);
  const [{ closed, points }] = outlines;
  expect(closed).toBe(true);
  expect(points).toHaveLength(120);
  for (const p of points) {
    expect(p.slice(2)).toEqual([0, 0, 0, 0]); // corners, no handles
    for (const v of p.slice(0, 2)) expect(v >= 0 && v <= 1).toBe(true);
  }
  for (const axis of [0, 1]) {
    expect(Math.min(...points.map((p) => p[axis]))).toBeCloseTo(0, 9);
    expect(Math.max(...points.map((p) => p[axis]))).toBeCloseTo(1, 9);
  }
});

// Normalized into 0-1 by its own bounds, each axis on its own, the curve is r(φ) through one affine map. So if r(φ) =
// r(φ + 2π/3), then about the corners' center (the origin's image: the corners are symmetric about it) one 2 x 2 matrix
// takes each corner to the one a third of a turn on (40 of 120), and it's a turn of 120° seen through that map: trace
// 2 cos 120° = -1, det 1. The matrix is worked out from two corners (M [q0 q10] = [q40 q50]); worst is how far the
// rest are from it.
function thirdTurn(points) {
  const n = points.length, cx = points.reduce((s, p) => s + p[0], 0) / n, cy = points.reduce((s, p) => s + p[1], 0) / n;
  const q = points.map((p) => [p[0] - cx, p[1] - cy]);
  const [a, b] = [q[0], q[10]], [c, d] = [q[40], q[50]];
  const det = a[0] * b[1] - b[0] * a[1];
  const M = [
    [(c[0] * b[1] - d[0] * a[1]) / det, (d[0] * a[0] - c[0] * b[0]) / det],
    [(c[1] * b[1] - d[1] * a[1]) / det, (d[1] * a[0] - c[1] * b[0]) / det],
  ];
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = q[i], [tx, ty] = q[(i + 40) % n];
    worst = Math.max(worst, Math.abs(M[0][0] * x + M[0][1] * y - tx), Math.abs(M[1][0] * x + M[1][1] * y - ty));
  }
  return { trace: M[0][0] + M[1][1], det: M[0][0] * M[1][1] - M[0][1] * M[1][0], worst };
}

test('Superformula: Points 3 is 3-fold symmetric, r(φ) = r(φ + 2π/3), and Points 4 isn\'t', async () => {
  const three = thirdTurn((await outlineOf({ points: 3 }))[0].points);
  expect(three.trace).toBeCloseTo(-1, 6);
  expect(three.det).toBeCloseTo(1, 6);
  expect(three.worst).toBeLessThan(1e-6);
  expect(thirdTurn((await outlineOf({ points: 4 }))[0].points).worst).toBeGreaterThan(1e-3);
});

// ---- Aberration ----

const W = 16;
const gpu = new WebGLProcessor();

const canvasOf = (color) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: W });
  const ctx = ctx2d(canvas), image = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) image.data.set([...color(x, y), 255], (y * W + x) * 4);
  ctx.putImageData(image, 0, 0);
  return canvas;
};
const bytes = (canvas) => {
  const copy = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
  const ctx = ctx2d(copy);
  ctx.drawImage(canvas, 0, 0);
  return [...ctx.getImageData(0, 0, canvas.width, canvas.height).data];
};
const run = (image, params, size = W) => {
  gpu.process(image, params, size, size);
  return bytes(gpu.canvas);
};
const aberration = async (values) => {
  const [def] = (await read(aberrationText)).filters;
  return { ref: solverRef('phosphor.aberration', def.id), pluginId: 'phosphor.aberration', hash: 'h', passes: def.passes, options: def.options, values: optionValues(def, values) };
};

test('Aberration: Distance 0 is the identity: no byte changed where the picture isn\'t resampled, and the identity filter\'s bytes where it is', async () => {
  // The Task 8 identity check (plugin-filter-gpu.test.js): byte identity against none holds only where the picture isn't
  // resampled (Simplify and Edges off; any adjustments, Sharpen and palette). Resampled, a filter's pass reads the
  // picture rounded to 8 bits where the pass without one reads it between steps, and under a snap the 8-bit texture's
  // rounding differs from round8 at ties, which can flip a palette pick. So there Distance 0 is held to the plain
  // identity filter's bytes: its pass is C exactly (L and R are C), so it's that filter whatever the rounding does.
  const heard = [];
  unlisten.push(onFilterFailure((...args) => heard.push(args)));
  const image = canvasOf((x, y) => [x * 16, y * 15, ((x * y) % 7) * 36]), filter = await aberration({ distance: 0 });
  const identity = { ...filter, ref: solverRef('phosphor.aberration', 'identity'), passes: ['return pixel(vec2(0.0));'] };
  const params = [{}, { brightness: 120, invert: 30, sharpen: 40 }, { palette: PALETTES.cga }, { sharpen: 40, palette: PALETTES.cga }];
  for (const one of params) {
    expect(run(image, { ...one, pluginFilters: [filter] })).toEqual(run(image, { ...one, pluginFilters: [] }));
    expect(run(image, { ...one, pluginFilters: [filter] }, 24)).toEqual(run(image, { ...one, pluginFilters: [identity] }, 24));
  }
  expect(heard).toEqual([]); // it built: a pass that didn't would be skipped, and look the same as none
  run(image, { pluginFilters: [filter] });
  expect([...gpu.filterPrograms.keys()]).toEqual([`h|${filter.ref}|0`]);
});

test('Aberration: at Distance 2 a white line on black splits into red on its right and cyan on its left', async () => {
  const image = canvasOf((x) => (x === 8 ? [255, 255, 255] : [0, 0, 0]));
  const out = run(image, { pluginFilters: [await aberration({ distance: 2 })] });
  const pixel = (x, y) => out.slice((y * W + x) * 4, (y * W + x) * 4 + 3);
  for (const y of [0, 7, 15]) {
    expect(pixel(10, y)).toEqual([255, 0, 0]); // the line two to its left, read in the left color
    expect(pixel(6, y)).toEqual([0, 255, 255]); // the line two to its right, in the right color
    expect(pixel(8, y)).toEqual([0, 0, 0]); // red and cyan add to white: the line's own color is all taken
    for (const x of [7, 9, 4, 12]) expect(pixel(x, y)).toEqual([0, 0, 0]);
  }
});

// ---- The Marketplace ----

test('the fixture list\'s entries for the three pass the Marketplace\'s hash check and install', async () => {
  await ownDatabase('phosphor-plugins', 'plugin-examples')();
  serveMarket();
  setActivePinia(createPinia());
  useWorkspaceStore();
  const store = usePluginStore();
  await store.loadMarket();
  for (const [id, kind] of [['phosphor.smear', 'brushes'], ['phosphor.superformula', 'shapes'], ['phosphor.aberration', 'filters']]) {
    const listed = await store.readListed(store.marketFor(id));
    expect(listed.listing).toMatchObject({ official: true, path: `plugins/${id.slice(9)}` });
    await store.install(listed.manifest, { script: listed.script, listing: listed.listing });
    dropped.push(id);
    expect(store.plugins.find((plugin) => plugin.id === id)).toMatchObject({ source: 'marketplace' });
    expect((await read(listed.script))[kind]).toHaveLength(1);
  }
});
