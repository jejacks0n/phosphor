// The renderer with a plugin solver (docs/plugins.md): a layer on one is drawn by its passes in JavaScript, an edit
// recomputes only the cells within reach of it, over paint and on upper layers it sees its own cell alone, and a
// solver that throws stands in with By shape.
import { test, expect, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { onSolver } from '../support/pluginSolvers.js';
import { readSolvers } from '@/plugins/script';
import { readManifest } from '@/plugins/manifest';
import { failureOf } from '@/plugins/solvers';
import { HANG_KEY } from '@/plugins/hangMark.js';
import { usePluginStore } from '@/store/PluginStore';
import { busyMessage } from '@/composables/useBusy';
import { t } from '@/i18n';
import midnight from '../fixtures/plugins/midnight/phosphor-plugin.json';

const IDS = ['jane.outlines', 'jane.hang', 'jane.theme'];
afterEach(() => {
  const plugins = usePluginStore();
  for (const id of IDS) plugins.dropSolvers(id);
  localStorage.removeItem(HANG_KEY);
});

const solver = (fields) => readSolvers({ default: { solvers: [{ id: 'edges', name: 'Edges', styles: ['ansi'], reach: 1, chars: '/', ...fields }] } })[0];
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
  expect(usePluginStore().problems['jane.outlines']).toContain('boom');
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
    if (cell.col === 0) throw new Error('up');
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

test('the hang mark is set during the first whole resolve and cleared after', async () => {
  const { project } = await stripes();
  const during = new Set();
  const ref = await onSolver(solver({ solve(cell, look) {
    during.add(localStorage.getItem(HANG_KEY));
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
  await usePluginStore().install(readManifest(JSON.stringify({ ...midnight, id: 'jane.theme' }))); // params made again, the options the same
  await settle(project);
  expect(calls).toBe(0);
  await usePluginStore().uninstall('jane.theme');
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
  } finally {
    clearInterval(watching);
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
  const plugins = usePluginStore();
  plugins.useSolvers('jane.outlines', 'h2', [solver({ solve: () => (now++, SLASH) })]); // a Reload
  await settle(project);
  expect(now).toBe(100);
  expect(project.cells.every((cell) => cell.char === '/')).toBe(true);
  old = now = 0;
  plugins.dropSolvers('jane.outlines');
  await settle(project);
  expect(cellsKey(project)).toEqual(byShape);
  project.brightness = 120;
  await settle(project);
  expect([old, now]).toEqual([0, 0]);
});

test('toggling a theme-only plugin does not render a drawing with no plugin solver again', async () => {
  const { project } = await stripes();
  await choose(project, 'shape');
  const plugins = usePluginStore();
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
  const { project, workspace } = await createTestApp();
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
