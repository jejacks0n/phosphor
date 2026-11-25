// The renderer with a plugin solver (docs/plugins.md): a layer on one is drawn by its passes in JavaScript, an edit
// recomputes only the cells within reach of it, over paint and on upper layers it sees its own cell alone, and a
// solver that throws stands in with By shape.
import { test, expect, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { onSolver as onSolverIn } from '../support/pluginSolvers.js';
import { readScript } from '@/plugins/script';
import { readManifest } from '@/plugins/manifest';
import { failureOf, unregisterScript } from '@/plugins/solvers';
import { HANG_KEY } from '@/plugins/hangMark.js';
import { usePluginStore } from '@/store/PluginStore';
import { busyMessage } from '@/composables/useBusy';
import { t } from '@/i18n';
import midnight from '../../plugins/midnight/phosphor-plugin.json';

// The test's own Pinia (createTestApp's): a store asked for after an await may be a test's that finished late.
let pinia = null;
const onSolver = (def, opts) => onSolverIn(def, { pinia, ...opts });
const IDS = ['phosphor.outlines', 'jane.hang', 'jane.theme'];
afterEach(() => {
  const plugins = usePluginStore(pinia);
  for (const id of IDS) plugins.dropScript(id);
  localStorage.removeItem(HANG_KEY);
});

const solver = (fields) => readScript({ default: { solvers: [{ id: 'edges', name: 'Edges', styles: ['ansi'], reach: 1, chars: '/', ...fields }] } }).solvers[0];
// A cell's mean brightness dx, dy away (every sample's channels).
const mean = (cell, dx, dy) => {
  let sum = 0;
  for (let i = 0; i < 32; i++) {
    const [r, g, b] = cell.sample(dx, dy, i);
    sum += r + g + b;
  }
  return sum / 96;
};
const SLASH = { char: '/', fg: { r: 255, g: 255, b: 255 }, bg: { r: 0, g: 0, b: 0 } };
const RED_SLASH = { ...SLASH, fg: { r: 255, g: 0, b: 0 } };

// A picture of stripes a cell wide (black, white, ...) as a 20 x 10 drawing: every cell's neighbors differ from it.
async function stripes({ cols = 20, rows = 10 } = {}) {
  const app = await createTestApp();
  ({ pinia } = app);
  const canvas = Object.assign(document.createElement('canvas'), { width: cols * 10, height: rows * 10 }), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  for (let col = 1; col < cols; col += 2) ctx.fillRect(col * 10, 0, 10, canvas.height);
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
  await app.project.setImageFromFile(new File([blob], 'stripes.png', { type: 'image/png' }), { withLayer: true });
  Object.assign(app.project, { aspectLock: false, cols, rows, smoothing: 0 });
  app.project.render();
  await settle(app.project);
  return app;
}

// The base (and Layer 1, so it stays in the lower group) on charChoice, rendered.
async function choose(project, charChoice, ids = ['base', 'edit']) {
  for (const id of ids) project.setLayerChars(id, { charChoice });
  await settle(project);
}

test('a reach-1 solver on the base draws its own characters where it chooses, By shape elsewhere', async () => {
  const { project } = await stripes();
  await choose(project, 'shape');
  const byShape = cellsKey(project);
  const chose = new Set();
  // A white cell with a black one to its right: '/'.
  const ref = await onSolver(solver({ solve(cell, look) {
    if (mean(cell, 0, 0) > 128 && mean(cell, 1, 0) < 128) {
      chose.add(cell.line * 20 + cell.col);
      return SLASH;
    }
    return look.byShape();
  } }));
  await choose(project, ref);
  expect(chose.size).toBe(5 * 9); // the white columns but the last, every line
  const now = cellsKey(project);
  now.forEach((cell, i) => (chose.has(i) ? expect(cell[0]).toBe('/') : expect(cell).toBe(byShape[i])));
});

test('a stroke recomputes only the grown area, and the result equals a whole resolve', async () => {
  const { project, workspace } = await stripes({ cols: 30, rows: 20 });
  const solved = [], refined = [];
  // Pass 1 picks '/' in a white cell; pass 2 reads its picks around it: a black cell with a '/' to its right is a red '/'.
  const ref = await onSolver(solver({
    solve(cell, look) {
      solved.push([cell.col, cell.line]);
      return mean(cell, 0, 0) > 128 ? SLASH : look.byShape();
    },
    refine(cell, look) {
      refined.push([cell.col, cell.line]);
      return cell.char(0, 0) === '/' ? SLASH : cell.char(1, 0) === '/' ? RED_SLASH : look.byShape();
    },
  }));
  await choose(project, ref);
  const red = cellsKey(project)[5 * 30 + 14];
  expect(red).toBe(cellsKey(project)[4 * 30 + 14]);
  expect(red[0]).toBe('/');
  workspace.pickLayer('base');
  project.paintStroke([{ x: 0, y: 0, alpha: 1 }], '#000000'); // the base's first pixels: its samples are made whole
  project.commitEdit();
  await settle(project);
  solved.length = refined.length = 0;
  project.paintStroke([{ x: 15, y: 10, alpha: 1 }, { x: 15, y: 11, alpha: 1 }], '#000000'); // a white cell made black
  project.commitEdit();
  await settle(project);
  const within = (calls, reach) => calls.every(([col, line]) => Math.abs(col - 15) <= reach && Math.abs(line - 5) <= reach);
  expect(solved.length).toBeGreaterThan(0);
  expect(within(solved, 1)).toBe(true);
  expect(within(refined, 2)).toBe(true);
  expect(cellsKey(project)[5 * 30 + 14]).not.toBe(red); // outside the stroke: no '/' to its right now
  expect(cellsKey(project)[4 * 30 + 14]).toBe(red);
  const afterStroke = cellsKey(project);
  await choose(project, 'shape');
  await choose(project, ref); // resolved whole
  expect(cellsKey(project)).toEqual(afterStroke);
});

test('over paint and on an upper layer the solver sees only its own cell', async () => {
  const { project, workspace } = await stripes();
  const seen = []; // the offsets whose samples differed from the cell's own
  let calls = 0;
  const ref = await onSolver(solver({ solve(cell, look) {
    calls++;
    const own = mean(cell, 0, 0);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mean(cell, dx, dy) !== own) seen.push([dx, dy]);
    return look.byShape();
  } }));
  await choose(project, ref);
  expect(seen.length).toBeGreaterThan(0); // the base's own resolve reads its neighbors
  workspace.pickLayer('edit');
  const over = async () => {
    seen.length = calls = 0;
    project.paintStroke([{ x: 4, y: 4, alpha: 1 }, { x: 4, y: 5, alpha: 1 }, { x: 5, y: 4, alpha: 1 }, { x: 5, y: 5, alpha: 1 }], '#ff0000');
    project.commitEdit();
    await settle(project);
    expect(calls).toBeGreaterThan(0);
    expect(seen).toEqual([]);
  };
  await over(); // paint on the lower group's cells layer
  project.setLayerChars('edit', { chars: '▄▀█ ' }); // its own: an upper layer
  await settle(project);
  expect(project.lowerGroup.upper).toEqual(['edit']);
  await over();
});

test('a solver that throws stands the layer in with By shape and reports the failure', async () => {
  const { project } = await stripes();
  await choose(project, 'shape');
  const byShape = cellsKey(project);
  let calls = 0;
  const ref = await onSolver(solver({ solve(cell, look) {
    calls++;
    if (cell.col === 3) throw new Error('boom');
    return look.byShape();
  } }));
  await choose(project, ref);
  expect(failureOf(ref)).toBe('boom');
  expect(usePluginStore(pinia).problems['phosphor.outlines']).toContain('boom');
  expect(project.processParams).toMatchObject({ solver: null, standIn: 'failed' });
  expect(cellsKey(project)).toEqual(byShape);
  const once = calls;
  project.brightness = 120; // a whole render again
  await settle(project);
  expect(calls).toBe(once);
});

test('a solver that throws on an upper layer stands it in with By shape', async () => {
  const { project, workspace } = await stripes();
  const ref = await onSolver(solver({ solve(cell, look) {
    if (cell.col === 4 && cell.line === 2) throw new Error('up'); // the painted cell, where it is
    return look.byShape();
  } }));
  project.setLayerChars('edit', { charChoice: 'shape', chars: '▄▀█ ' });
  workspace.pickLayer('edit');
  project.paintStroke([{ x: 4, y: 4, alpha: 1 }, { x: 4, y: 5, alpha: 1 }], '#ff0000');
  project.commitEdit();
  await settle(project);
  const byShape = cellsKey(project);
  project.setLayerChars('edit', { charChoice: ref });
  await settle(project);
  expect(failureOf(ref)).toBe('up');
  expect(project.layerParams.get('edit')).toMatchObject({ solver: null, standIn: 'failed' });
  expect(cellsKey(project)).toEqual(byShape);
});

// 'Z' isn't among its characters nor the set: the cell takes the set's first, and the row says so.
const OFF_SET = { char: 'Z', fg: { r: 255, g: 255, b: 255 }, bg: { r: 0, g: 0, b: 0 } };

test('a solver that returns a character it does not draw with is told on its row, and keeps drawing', async () => {
  const { project } = await stripes();
  let calls = 0;
  const ref = await onSolver(solver({ solve(cell, look) {
    calls++;
    return cell.col === 3 ? OFF_SET : look.byShape();
  } }));
  await choose(project, ref);
  expect(usePluginStore(pinia).problems['phosphor.outlines']).toBe(t('plugins.errors.solverFault', { name: 'Edges' }));
  expect(project.processParams).toMatchObject({ solver: ref, standIn: null });
  expect(calls).toBeGreaterThan(0);
});

test('on an upper layer, a character it does not draw with is told on its row; a failure\'s words are not replaced', async () => {
  const { project, workspace } = await stripes();
  let fails = false;
  const ref = await onSolver(solver({ solve(cell, look) {
    if (fails && cell.col === 8) throw new Error('later');
    return cell.col === 4 ? OFF_SET : look.byShape();
  } }));
  project.setLayerChars('edit', { charChoice: ref, chars: '▄▀█ ' }); // an upper layer of its own
  workspace.pickLayer('edit');
  project.paintStroke(RED_CELLS, '#ff0000');
  project.commitEdit();
  await settle(project);
  expect(usePluginStore(pinia).problems['phosphor.outlines']).toBe(t('plugins.errors.solverFault', { name: 'Edges' }));
  fails = true;
  project.brightness = 120; // the layer walked again: col 4 faults, then col 8 throws
  await settle(project);
  expect(usePluginStore(pinia).problems['phosphor.outlines']).toContain('later');
});

test('a movie\'s built frames are built again when only an upper layer\'s solver changes: a Reload, or its plugin gone', async () => {
  const { project, workspace } = await stripes();
  const def = solver({ solve: (cell, look) => (cell.col % 2 ? SLASH : look.byShape()) });
  const ref = await onSolver(def, { hash: 'first' });
  await choose(project, 'shape'); // the base isn't on it
  project.setLayerChars('edit', { charChoice: ref, chars: '▄▀█ ' }); // an upper layer of its own
  workspace.pickLayer('edit');
  project.paintStroke(RED_CELLS, '#ff0000');
  project.commitEdit();
  project.animate = true;
  project.addFrame('duplicate');
  await settle(project);
  const built = async () => (await project.builtFrame(1), project._builder);
  const first = await built();
  expect(await built()).toBe(first); // nothing changed: kept
  usePluginStore(pinia).useScript('phosphor.outlines', 'second', { solvers: [def] }); // a Reload: another script
  await settle(project);
  const second = await built();
  expect(second).not.toBe(first);
  usePluginStore(pinia).dropScript('phosphor.outlines'); // the layer stands in with By shape
  await settle(project);
  expect(await built()).not.toBe(second);
});

// R7: a solver keyed on where a cell is draws the same paint the same on an upper layer as in the lower group.
async function checkered(upper) {
  const { project, workspace } = await stripes();
  const ref = await onSolver(solver({ solve: (cell, look) => ((cell.col + cell.line) % 2 ? SLASH : look.byShape()) }));
  await choose(project, ref);
  if (upper) project.setLayerChars('edit', { seed: 'its own' }); // its own settings, the same but for a seed it doesn't use
  workspace.pickLayer('edit');
  const pixels = [];
  for (let y = 2; y < 8; y++) for (let x = 3; x < 9; x++) pixels.push({ x, y, r: 255, g: 0, b: 0, alpha: 1 });
  project.paintEditPixels(pixels);
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup.upper).toEqual(upper ? ['edit'] : []);
  const shown = cellsKey(project);
  usePluginStore(pinia).dropScript('phosphor.outlines');
  return shown;
}
test('a solver keyed on the cell\'s col and line draws an upper layer as it draws the lower group', async () => {
  const lower = await checkered(false), upper = await checkered(true);
  expect(lower.filter((cell) => cell[0] === '/').length).toBeGreaterThan(20);
  expect(upper).toEqual(lower);
});

test('the hang mark is set during the first whole resolve and cleared after', async () => {
  const { project } = await stripes();
  const during = new Set();
  const ref = await onSolver(solver({ solve(cell, look) {
    during.add(JSON.parse(localStorage.getItem(HANG_KEY))?.pluginId ?? null);
    return look.byShape();
  } }), { pluginId: 'jane.hang' });
  await choose(project, ref);
  expect([...during]).toEqual(['jane.hang']);
  expect(localStorage.getItem(HANG_KEY)).toBeNull();
  during.clear();
  await choose(project, 'shape');
  await choose(project, ref); // another whole resolve, this visit: no mark
  expect([...during]).toEqual([null]);
});

test('the hang mark is set for the base\'s first whole resolve even after an upper layer ran the solver first', async () => {
  const { project, workspace } = await stripes();
  const during = [];
  const ref = await onSolver(solver({ solve(cell, look) {
    during.push(JSON.parse(localStorage.getItem(HANG_KEY))?.pluginId ?? null);
    return look.byShape();
  } }), { pluginId: 'jane.hang', hash: 'another' }); // a script not yet run this visit (the mark's kept per page)
  project.setLayerChars('edit', { charChoice: ref, chars: '▄▀█ ' }); // an upper layer of its own
  workspace.pickLayer('edit');
  project.paintStroke([{ x: 4, y: 4, alpha: 1 }, { x: 4, y: 5, alpha: 1 }], '#ff0000');
  project.commitEdit();
  await settle(project);
  expect(during.length).toBeGreaterThan(0);
  during.length = 0;
  project.setLayerChars('base', { charChoice: ref });
  await settle(project);
  expect(during.slice(0, 100)).toEqual(Array(100).fill('jane.hang')); // the whole resolve, before the upper cell's laid again
  expect(localStorage.getItem(HANG_KEY)).toBeNull();
});

// Each call's mark, and whether the cell it was given is under red paint (its own samples red).
function marking(hash) {
  const calls = [];
  const def = solver({ solve(cell, look) {
    const [r, g] = cell.sample(0, 0, 0);
    calls.push({ red: r > 200 && g < 50, mark: JSON.parse(localStorage.getItem(HANG_KEY))?.pluginId ?? null });
    return look.byShape();
  } });
  return { calls, ref: onSolver(def, { pluginId: 'jane.hang', hash }) };
}
const RED_CELLS = [4, 8, 12].flatMap((x) => [{ x, y: 4, alpha: 1 }, { x, y: 5, alpha: 1 }]); // three cells, apart

test('the hang mark is set while a solver first draws the cells under paint, after its whole resolve', async () => {
  const { project, workspace } = await stripes();
  const { calls, ref } = marking('under-paint');
  await choose(project, await ref);
  expect(calls.length).toBeGreaterThan(0);
  calls.length = 0;
  workspace.pickLayer('edit');
  project.paintStroke(RED_CELLS, '#ff0000');
  project.commitEdit();
  await settle(project);
  const red = calls.filter((call) => call.red);
  expect(red.length).toBeGreaterThanOrEqual(3);
  expect(red.slice(0, 3).map((call) => call.mark)).toEqual(Array(3).fill('jane.hang'));
  expect(localStorage.getItem(HANG_KEY)).toBeNull();
});

test('the hang mark is set over every cell of an upper layer\'s first walk, not only its first cell', async () => {
  const { project, workspace } = await stripes();
  const { calls, ref } = marking('upper-walk');
  project.setLayerChars('edit', { charChoice: await ref, chars: '▄▀█ ' }); // an upper layer of its own
  workspace.pickLayer('edit');
  project.paintStroke(RED_CELLS, '#ff0000');
  project.commitEdit();
  await settle(project);
  expect(calls.length).toBeGreaterThanOrEqual(3);
  expect(calls.slice(0, 3).map((call) => call.mark)).toEqual(Array(3).fill('jane.hang'));
  expect(localStorage.getItem(HANG_KEY)).toBeNull();
});

test('the hang mark is set over an upper layer\'s first walk even when the lower group\'s paint ran the solver first in that render', async () => {
  const { project, workspace } = await stripes();
  const calls = [];
  const ref = await onSolver(solver({ styles: ['ansi', 'ascii'], solve(cell, look) {
    const [r, g] = cell.sample(0, 0, 0);
    calls.push({ col: cell.col, red: r > 200 && g < 50, mark: JSON.parse(localStorage.getItem(HANG_KEY))?.pluginId ?? null });
    return look.byShape();
  } }), { pluginId: 'jane.hang', hash: 'lower-then-upper' });
  project.renderStyle = 'ascii';
  workspace.pickLayer('edit');
  project.typeAt(2, 2, ' ', { fg: '#ffffff', bg: '#000000' }); // its own character, which paint opens in ASCII
  project.commitEdit();
  project.paintStroke([{ x: 2, y: 4, alpha: 1 }, { x: 2, y: 5, alpha: 1 }], '#ff0000');
  project.commitEdit();
  const upper = project.addLayer('cells', 'edit');
  project.setLayerChars(upper, { charsAscii: ' .:#' }); // its own settings: an upper layer
  workspace.pickLayer(upper);
  project.paintStroke(RED_CELLS, '#ff0000');
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup.upper).toEqual([upper]);
  calls.length = 0;
  for (const id of ['base', 'edit', upper]) project.setLayerChars(id, { charChoiceAscii: ref }); // one render: the lower group's, then the upper walk
  await settle(project);
  // Red at column 2: the lower group's (its paint over the base, then over the typed space); at 4, 8 and 12 the upper layer's.
  const up = calls.filter((call) => call.red && [4, 8, 12].includes(call.col));
  expect(calls.findIndex((call) => call.red && call.col === 2)).toBeLessThan(calls.indexOf(up[0]));
  expect(up.length).toBeGreaterThanOrEqual(3);
  expect(up.slice(0, 3).map((call) => call.mark)).toEqual(Array(3).fill('jane.hang'));
});

test('a solver gone between the params and the render is By shape there, and is not called', async () => {
  const { project } = await stripes();
  await choose(project, 'shape');
  const byShape = cellsKey(project);
  let calls = 0;
  const ref = await onSolver(solver({ solve: () => (calls++, SLASH) }));
  await choose(project, ref);
  expect(project.processParams.solver).toBe(ref);
  unregisterScript('phosphor.outlines'); // not through the store: the params still name it
  calls = 0;
  project.render();
  await settle(project);
  expect(project.processParams.solver).toBe(ref);
  expect(calls).toBe(0);
  expect(cellsKey(project)).toEqual(byShape);
});

test('changing an option recomputes, and the same option twice does not', async () => {
  const { project } = await stripes();
  let calls = 0;
  const ref = await onSolver(solver({
    options: [{ id: 'level', kind: 'slider', name: 'Level', min: 0, max: 255, step: 1, default: 128 }],
    solve(cell, look) {
      calls++;
      return mean(cell, 0, 0) > look.options.level ? SLASH : look.byShape();
    },
  }));
  await choose(project, ref, ['base']);
  expect(project.cells.filter((cell) => cell.char === '/').length).toBe(50);
  calls = 0;
  project.setLayerChars('base', { solverOptions: { [ref]: { level: 255 } } });
  await settle(project);
  expect(calls).toBe(100);
  expect(project.cells.some((cell) => cell.char === '/')).toBe(false);
  calls = 0;
  expect(project.setLayerChars('base', { solverOptions: { [ref]: { level: 255 } } })).toBe(false);
  await usePluginStore(pinia).install(readManifest(JSON.stringify({ ...midnight, id: 'jane.theme' }))); // params made again, the options the same
  await settle(project);
  expect(calls).toBe(0);
  await usePluginStore(pinia).uninstall('jane.theme');
});

test('choosing a plugin solver or changing its options puts the busy note up; other settings do not', async () => {
  const { project } = await stripes();
  const ref = await onSolver(solver({
    options: [{ id: 'level', kind: 'slider', name: 'Level', min: 0, max: 255, step: 1, default: 128 }],
    solve: (cell, look) => look.byShape(),
  }));
  const notes = [];
  const watching = setInterval(() => notes.push(busyMessage.value), 0);
  const noted = async (change) => {
    notes.length = 0;
    change();
    await nextTick();
    notes.push(busyMessage.value);
    await settle(project);
    expect(busyMessage.value).toBeNull();
    return notes.includes(t('busy.solving'));
  };
  try {
    expect(await noted(() => project.setLayerChars('base', { charChoice: ref }))).toBe(true);
    expect(await noted(() => project.setLayerChars('base', { solverOptions: { [ref]: { level: 9 } } }))).toBe(true);
    expect(await noted(() => { project.brightness = 120; })).toBe(false);
    expect(await noted(() => project.setLayerChars('base', { charChoice: 'shape' }))).toBe(false);
    expect(await noted(() => project.setLayerChars('edit', { charChoice: ref }))).toBe(true); // a layer's own
    expect(await noted(() => project.setLayerChars('edit', { solverOptions: { [ref]: { level: 3 } } }))).toBe(true);
  } finally {
    clearInterval(watching);
  }
});

test('under another busy note a solver chosen renders on the next frame, as any change does', async () => {
  const { project } = await stripes();
  const ref = await onSolver(solver({ solve: (cell, look) => look.byShape() }));
  const pipeline = vi.spyOn(project.renderer, 'render');
  busyMessage.value = 'Opening x…';
  try {
    project.setLayerChars('base', { charChoice: ref });
    await nextTick(); // the watcher has run
    expect(project._renderQueued).toBe(true);
    expect(pipeline).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(project._renderQueued || project._rendering).toBe(false)); // not settle: it waits for the note to go
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(busyMessage.value).toBe('Opening x…');
  } finally {
    busyMessage.value = null;
  }
});

test('a solver swapped while a layer uses it: the next render calls the new one; dropped, By shape, and the old one is never called again', async () => {
  const { project } = await stripes();
  await choose(project, 'shape');
  const byShape = cellsKey(project);
  let old = 0, now = 0;
  const ref = await onSolver(solver({ solve: (cell, look) => (old++, look.byShape()) }));
  await choose(project, ref);
  expect(old).toBeGreaterThan(0);
  const plugins = usePluginStore(pinia);
  plugins.useScript('phosphor.outlines', 'h2', { solvers: [solver({ solve: () => (now++, SLASH) })] }); // a Reload
  await settle(project);
  expect(now).toBe(100);
  expect(project.cells.every((cell) => cell.char === '/')).toBe(true);
  old = now = 0;
  plugins.dropScript('phosphor.outlines');
  await settle(project);
  expect(cellsKey(project)).toEqual(byShape);
  project.brightness = 120;
  await settle(project);
  expect([old, now]).toEqual([0, 0]);
});

test('toggling a theme-only plugin does not render a drawing with no plugin solver again', async () => {
  const { project } = await stripes();
  await choose(project, 'shape');
  const plugins = usePluginStore(pinia);
  const pipeline = vi.spyOn(project.renderer, 'render');
  await plugins.install(readManifest(JSON.stringify({ ...midnight, id: 'jane.theme' })));
  await settle(project);
  await plugins.setEnabled('jane.theme', false);
  await settle(project);
  expect(pipeline).not.toHaveBeenCalled();
  await plugins.uninstall('jane.theme');
});

// docs/model.md R12, as R3 for By shape: a white rect painted on Layer 1 over a black canvas, all on a solver that picks
// '/' in a white cell with a black one to its right. Paint is seen alone, so no '/' shows; merged onto the base it's the
// base's pixels, which the solver sees with their neighbors: the rect's right column would convert otherwise there, so
// it's written as it showed (pinned), and nothing on the canvas changes.
test('R12: Merge down under a plugin solver freezes what it showed', async () => {
  const { project, workspace, pinia: own } = await createTestApp();
  pinia = own;
  await project.setBlankCanvas({ withLayer: true, cols: 30, rows: 20 });
  await settle(project);
  const ref = await onSolver(solver({ solve(cell, look) {
    return mean(cell, 0, 0) > 128 && mean(cell, 1, 0) < 128 ? SLASH : look.byShape();
  } }));
  await choose(project, ref);
  workspace.pickLayer('edit');
  const pixels = [];
  for (let y = 4; y < 12; y++) for (let x = 6; x < 16; x++) pixels.push({ x, y, r: 255, g: 255, b: 255, alpha: 1 });
  project.paintEditPixels(pixels);
  project.commitEdit();
  await settle(project);
  const before = cellsKey(project);
  expect(before.some((cell) => cell[0] === '/')).toBe(false); // paint, seen alone
  expect(project.mergeDown('edit')).toBe(true);
  await settle(project);
  expect(cellsKey(project)).toEqual(before);
  expect([...project.baseRecords.pins.keys()].sort()).toEqual(['15,2', '15,3', '15,4', '15,5']);
});
