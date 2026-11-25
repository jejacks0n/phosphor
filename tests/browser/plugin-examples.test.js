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
  const [ref] = (await onPlugin({ brushes: [...(await read(smearText)).brushes] }, { pluginId: 'phosphor.smear', pinia: app.pinia })).brushes;
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

test('Smear: a drag across a red|blue edge carries red on into the blue, less the further it goes, and blue into red the other way', async () => {
  const { project, stroke } = await smearing();
  project.putEditPixels(RED_BLUE);
  project.commitEdit();
  // Rightward along row 10, the dab's middle: red rides with the brush past the edge, each pixel on keeping less of it
  // (Strength's 60% of what the one behind has); the red behind the edge has red a step back, and stays as it is.
  stroke([at(4, 10), at(8, 10), at(12, 10), at(16, 10)]);
  const reds = [10, 11, 12, 13].map((x) => paintAt(project, x, 10).r);
  expect(reds[0]).toBeGreaterThan(140);
  for (let i = 1; i < reds.length; i++) expect(reds[i]).toBeLessThan(reds[i - 1]);
  expect(reds[2]).toBeGreaterThan(20); // three pixels in, still plainly there: more than the one pixel a stroke's start gives
  for (const x of [10, 11, 12, 13]) expect(paintAt(project, x, 10)).toMatchObject({ g: 0, a: 1 });
  expect(paintAt(project, 9, 10)).toEqual(RED);
  expect(paintAt(project, 3, 10)).toEqual(RED);
  project.undo();
  expect(paintAt(project, 10, 10)).toEqual(BLUE);
  stroke([at(16, 10), at(12, 10), at(8, 10), at(4, 10)]); // leftward: blue into the red
  const blues = [9, 8, 7, 6].map((x) => paintAt(project, x, 10).b);
  expect(blues[0]).toBeGreaterThan(140);
  for (let i = 1; i < blues.length; i++) expect(blues[i]).toBeLessThan(blues[i - 1]);
  expect(paintAt(project, 10, 10)).toEqual(BLUE);
});

test('Smear: Strength 100 carries the color the whole way, and one long move smears as far as many short ones', async () => {
  const { project, workspace, ref, stroke } = await smearing();
  project.putEditPixels(RED_BLUE);
  project.commitEdit();
  workspace.pluginTools[`brush:${ref}`] = { strength: 100 };
  stroke([at(4, 10), at(16, 10)]);
  for (let x = 10; x <= 16; x++) expect(paintAt(project, x, 10), `x ${x}`).toEqual(RED);
  const long = layerPaint(project);
  project.undo();
  stroke([at(4, 10), at(7, 10), at(10, 10), at(13, 10), at(16, 10)]);
  expect(layerPaint(project)).toEqual(long);
});

test('Smear: Reads offers All layers, the default, and This layer', async () => {
  const reads = (await read(smearText)).brushes[0].options.find((option) => option.id === 'reads');
  expect([reads.choices, reads.default]).toEqual([['All layers', 'This layer'], 0]);
});

test('Smear: a press alone changes nothing', async () => {
  const { project, stroke } = await smearing();
  project.putEditPixels(RED_BLUE);
  project.commitEdit();
  const before = layerPaint(project);
  stroke([at(10, 10)]);
  expect(layerPaint(project)).toEqual(before);
});

test('Smear: Reads This layer on a clear layer changes nothing; All layers smears the picture under it onto the layer', async () => {
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
  // The picture's red laid over the clear layer where it goes into the blue, thinner the further in; none where what
  // shows a step back is the same.
  expect(paintAt(project, 10, 10)).toMatchObject({ r: 255, g: 0, b: 0 });
  expect(paintAt(project, 10, 10).a).toBeGreaterThan(0.55);
  expect(paintAt(project, 12, 10).a).toBeLessThan(paintAt(project, 11, 10).a);
  expect(paintAt(project, 12, 10).a).toBeGreaterThan(0.05);
  expect(paintAt(project, 9, 10)).toBe(null);
  expect(project.rawColorAt(11, 10)).not.toBe('#0000ff');
});

test('Smear: Reads This layer carries the layer\'s paint out into where it\'s clear, and clear into the paint the other way', async () => {
  const { project, workspace, ref, stroke } = await smearing();
  project.putEditPixels(RED_BLUE.filter(({ x }) => x < 10)); // red, and the layer clear right of it
  project.commitEdit();
  workspace.pluginTools[`brush:${ref}`] = { reads: 1 };
  stroke([at(4, 10), at(8, 10), at(12, 10), at(16, 10)]);
  const alphas = [10, 11, 12, 13].map((x) => paintAt(project, x, 10)?.a ?? 0);
  expect(alphas[0]).toBeGreaterThan(0.55);
  for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThan(alphas[i - 1]);
  expect(alphas[2]).toBeGreaterThan(0.05);
  for (const x of [10, 11, 12]) expect(paintAt(project, x, 10)).toMatchObject({ r: 255, g: 0, b: 0 });
  expect(paintAt(project, 9, 10)).toEqual(RED);
  // The other way, clear rides into the red, which thins where it goes and keeps its color: a set, where a put only adds.
  project.undo();
  stroke([at(16, 10), at(12, 10), at(8, 10), at(4, 10)]);
  const thinned = [9, 8, 7, 6].map((x) => paintAt(project, x, 10)?.a ?? 0);
  expect(thinned[0]).toBeLessThan(0.45);
  for (let i = 1; i < thinned.length; i++) expect(thinned[i]).toBeGreaterThan(thinned[i - 1]);
  for (const x of [8, 7, 6]) expect(paintAt(project, x, 10)).toMatchObject({ r: 255, g: 0, b: 0 });
  expect(paintAt(project, 10, 10)).toBe(null);
});

test('Smear: Reads This layer mixes two thin paints where they cross, and neither grows more solid', async () => {
  const { project, workspace, ref, stroke } = await smearing();
  project.putEditPixels(RED_BLUE.map((pixel) => ({ ...pixel, a: 0.5 }))); // red left of column 10, blue from it, each at half
  project.commitEdit();
  workspace.pluginTools[`brush:${ref}`] = { reads: 1 };
  stroke([at(4, 10), at(8, 10), at(12, 10), at(16, 10)]);
  for (let x = 4; x <= 16; x++) expect(paintAt(project, x, 10).a, `x ${x}`).toBeCloseTo(0.5, 2);
  expect(paintAt(project, 10, 10).r).toBeGreaterThan(140); // red carried into the blue
  expect(paintAt(project, 11, 10).r).toBeLessThan(paintAt(project, 10, 10).r);
});

// R5 (docs/model.md): a letter typed on the layer isn't paint. A smear across it lays paint over it, which tints it.
test('Smear: red dragged across a typed letter leaves it a letter, tinted, with either Reads', async () => {
  for (const reads of [0, 1]) {
    const { project, workspace, ref, stroke } = await smearing();
    workspace.editorTab = 'output';
    project.putEditPixels([0, 1, 2, 3, 4].flatMap((x) => [4, 5].map((y) => ({ x, y, r: 255, g: 0, b: 0, a: 1 }))));
    project.commitEdit();
    project.typeAt(5, 2, 'A', { fg: '#ffffff', bg: '#0000ff' });
    project.commitPending();
    await settle(project);
    workspace.pluginTools[`brush:${ref}`] = { size: 4, strength: 60, reads };
    stroke([{ x: 1.5, y: 5 }, ...[2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ x: x + 0.5, y: 5 }))]);
    await settle(project);
    const cell = project.cells[2 * 20 + 5];
    expect([reads, cell.char]).toEqual([reads, 'A']);
    expect(project.editCellAt(5, 2)).toMatchObject({ char: 'A', fg: '#ffffff', bg: '#0000ff' });
    // What's over the letter is see-through red paint, as the Brush would leave, so its two colors go toward red and
    // stay apart: laid solid over the letter's own colors they came out one step of red from each other.
    for (const y of [4, 5]) {
      expect(paintAt(project, 5, y)).toMatchObject({ r: 255, g: 0, b: 0 });
      expect(paintAt(project, 5, y).a).toBeLessThan(0.97);
    }
    expect(Math.max(...cell.fg.c.map((v, i) => Math.abs(v - cell.bg.c[i]))), `reads ${reads}: ${cell.fg.hex} on ${cell.bg.hex}`).toBeGreaterThan(15);
    expect(cell.bg.c[0]).toBeGreaterThan(60);
  }
});

test('Smear: thin paint carried into a clear spot is never more solid than the paint it came from', async () => {
  const { project, workspace, ref, stroke } = await smearing();
  project.putEditPixels(RED_BLUE.filter(({ x }) => x < 10).map((pixel) => ({ ...pixel, a: 0.5 })));
  project.commitEdit();
  for (const reads of [1, 0]) {
    workspace.pluginTools[`brush:${ref}`] = { reads, strength: 100 };
    stroke([at(4, 10), at(16, 10)]);
    for (let x = 10; x <= 16; x++) {
      expect(paintAt(project, x, 10), `reads ${reads}, x ${x}`).toMatchObject({ r: 255, g: 0, b: 0 });
      expect(paintAt(project, x, 10).a).toBeCloseTo(0.5, 2);
    }
    project.undo();
  }
});

test('Smear: All layers drags the color of a block of colored spaces typed on the layer, not what\'s under it', async () => {
  const { project, stroke } = await smearing();
  project.writeEditCells([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((col) => [4, 5].map((row) => ({ col, row, attrs: { char: ' ', fg: '#000000', bg: '#0000ff' } }))));
  project.commitEdit();
  await settle(project);
  stroke([at(4, 10), at(8, 10), at(12, 10), at(16, 10)]);
  // Blue rides out past the block's edge onto the clear layer, as thin blue paint, less the further it goes.
  const alphas = [10, 11, 12].map((x) => paintAt(project, x, 10)?.a ?? 0);
  expect(alphas[0]).toBeGreaterThan(0.5);
  expect(alphas[2]).toBeLessThan(alphas[0]);
  expect(alphas[2]).toBeGreaterThan(0.05);
  for (const x of [10, 11, 12]) expect(paintAt(project, x, 10)).toMatchObject({ r: 0, g: 0, b: 255 });
});

// ---- Superformula ----

const outlineOf = async (values = {}) => {
  const [def] = (await read(superformulaText)).shapes;
  return readOutlines(def.outline(scriptOptions(def, optionValues(def, values))));
};

test('Superformula: the default outline is one closed outline of 120 corners, all in 0-1, its farthest corner on the box\'s circle', async () => {
  const outlines = await outlineOf();
  expect(outlines).toHaveLength(1);
  const [{ closed, points }] = outlines;
  expect(closed).toBe(true);
  expect(points).toHaveLength(120);
  for (const p of points) {
    expect(p.slice(2)).toEqual([0, 0, 0, 0]); // corners, no handles
    for (const v of p.slice(0, 2)) expect(v >= 0 && v <= 1).toBe(true);
  }
  expect(Math.max(...points.map(([x, y]) => Math.hypot(x - 0.5, y - 0.5)))).toBeCloseTo(0.5, 9);
});

// Corner i is a turn of 2π i / 120 on from the top, clockwise, about the formula's origin, so with the origin at the
// box's middle and one scale for both axes, every corner is that way from (0.5, 0.5), whatever the values: the star
// stays put as they change, its first corner straight up from the middle, as the Polygon's is.
test('Superformula: its center is the box\'s middle and its proportions its own, whatever the values', async () => {
  for (const values of [{}, { points: 1 }, { points: 3 }, { points: 5, pinch: 1, round: 4 }, { points: 7, pinch: 0.1, round: 0.1 }, { points: 20, round: 3 }]) {
    const [{ points }] = await outlineOf(values);
    let worst = 0;
    points.forEach(([x, y], i) => {
      const turn = -Math.PI / 2 + (2 * Math.PI * i) / points.length, r = Math.hypot(x - 0.5, y - 0.5);
      worst = Math.max(worst, Math.abs(x - 0.5 - r * Math.cos(turn)), Math.abs(y - 0.5 - r * Math.sin(turn)));
    });
    expect(worst, JSON.stringify(values)).toBeLessThan(1e-9);
  }
  // At its defaults the first corner is a point of the star: the top of the box, in its middle.
  const [{ points: star }] = await outlineOf();
  expect(star[0][0]).toBeCloseTo(0.5, 9);
  expect(star[0][1]).toBeCloseTo(0, 9);
});

// r(φ) = r(φ + 2π/3) with Points 3: each corner is as far from the middle as the one a third of a turn on (40 of 120).
const thirdTurn = (points) => {
  const r = points.map(([x, y]) => Math.hypot(x - 0.5, y - 0.5));
  return Math.max(...r.map((v, i) => Math.abs(v - r[(i + 40) % r.length])));
};

test('Superformula: Points 3 is 3-fold symmetric, r(φ) = r(φ + 2π/3), and Points 4 isn\'t', async () => {
  expect(thirdTurn((await outlineOf({ points: 3 }))[0].points)).toBeLessThan(1e-9);
  expect(thirdTurn((await outlineOf({ points: 4 }))[0].points)).toBeGreaterThan(1e-3);
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
