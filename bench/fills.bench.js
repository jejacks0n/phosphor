// Where a Paint Bucket fill's time goes at the largest grid (500k cells, a million grid pixels), part by part, the
// median of several runs, on a picture and on an opened ANSI file of that size (issue #231). Asserts nothing: it prints
// a table. Run: npx vitest run --config bench/vitest.config.js bench/fills.bench.js --silent=false
// VITE_BENCH_PROFILE=<part of a scenario's name> adds a CPU profile of that scenario's first fill: its functions by
// their own time and by their total.
import { test } from 'vitest';
import { cdp } from 'vitest/browser';
import { createTestApp } from '../tests/support/app.js';
import { loadImage } from '@/document/projectIO';
import { ctx2d } from '@/lib/Canvas';
import { AnsiFile } from '@/lib/AnsiFile';
import { PALETTES } from '@/lib/ColorUtils';
import { buildCell, charRowsOf } from '@/lib/Cells';
import { pixelArea, cellArea } from '@/tools/bucket';
import wand from '@/tools/wand';

const RUNS = 5, COLS = 100, LINES = 5000;
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
async function settled(project) {
  await frame();
  while (project._renderQueued || project._rendering) await frame();
  await frame();
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (fn) => {
  const t = performance.now();
  const out = fn();
  return [performance.now() - t, out];
};

// A picture of one color with Layer 1 over it (the lower group's cells layer, as the picture opens with it) and Layer 2
// over that (laid over the group).
async function picture() {
  const app = await createTestApp();
  const canvas = Object.assign(document.createElement('canvas'), { width: 400, height: 400 });
  const ctx = ctx2d(canvas);
  ctx.fillStyle = '#204060';
  ctx.fillRect(0, 0, 400, 400);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  app.project.replaceImage(await loadImage(blob), await blob.arrayBuffer(), { cols: COLS, rows: 2 * LINES, aspectLock: false, filename: 'bench' });
  app.project.render();
  await settled(app.project);
  const lower = app.project.editId, upper = app.project.addLayer('cells');
  await settled(app.project);
  return { ...app, lower, upper };
}

// An .ans of spaces on blue, every cell someone's own: opened as Edit it (Layer 1's cells) or Draw on top (the base's pins).
async function ansFile(layer) {
  const app = await createTestApp();
  const cells = Array.from({ length: COLS * LINES }, () => buildCell(PALETTES.cga[7], PALETTES.cga[1], ' ', 'ansi'));
  await app.project.openArtFile(new File([new AnsiFile(COLS, LINES, cells).toBlob({ colorMode: 'cga' })], 'big.ans'), { layer });
  await settled(app.project);
  return { ...app, lower: app.project.editId };
}
const ansEdit = () => ansFile('edit'), ansBase = () => ansFile('base');

async function profiled(name, fn) { // fn may be async: what it awaits is in the profile too
  const session = cdp();
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 100 });
  await session.send('Profiler.start');
  await fn();
  const { profile: { nodes, samples, timeDeltas } } = await session.send('Profiler.stop');
  const self = new Map(), total = new Map(), byId = new Map(nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const keyOf = (id) => {
    const { functionName, url, lineNumber } = byId.get(id).callFrame;
    return `${functionName || '(anon)'} ${url.split('/').pop().split('?')[0]}:${lineNumber + 1}`;
  };
  samples.forEach((id, i) => {
    const dt = timeDeltas[i] / 1000, seen = new Set();
    self.set(keyOf(id), (self.get(keyOf(id)) ?? 0) + dt);
    for (let at = id; at !== undefined; at = parent.get(at)) seen.add(keyOf(at));
    for (const key of seen) total.set(key, (total.get(key) ?? 0) + dt);
  });
  const top = (map, n, keep = () => true) => [...map].filter(([k]) => keep(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n');
  console.log(`--- ${name} self\n${top(self, 20)}\n--- total\n${top(total, 30, (k) => /\.js:/.test(k) && !/pinia|vue\.runtime|fills\.bench|combineActions/.test(k))}`);
}

// One fill as fillSolid runs it, part by part, then undone so the next run starts the same.
async function fill(project, workspace, view, pos, profile) {
  const r = {};
  workspace.editorTab = view;
  const work = () => {
    if (view === 'output' && workspace.bucketFillWith === 'cells') {
      const [area, units] = ms(() => cellArea(project, workspace, pos));
      const colors = workspace.typingAttrs(), attrs = { fg: colors.fg, fgIndex: colors.fgIndex };
      r.area = area;
      [r.write] = ms(() => project.writeEditCells(units.map(({ x, y }) => ({ col: x, row: y, attrs })), { clearPaint: true }));
      r.units = units.length;
    } else {
      const [area, pixels] = ms(() => pixelArea(project, workspace, pos));
      r.area = area;
      [r.write] = ms(() => project.paintStroke(pixels));
      r.units = pixels.length;
    }
    [r.commit] = ms(() => project.commitEdit());
    r.total = r.area + r.write + r.commit;
  };
  if (profile) await profiled(profile, work);
  else work();
  const t = performance.now();
  await settled(project);
  r.settle = performance.now() - t;
  project.undo();
  await settled(project);
  return r;
}

const MIDDLE = { x: COLS / 2 + 0.5, y: LINES + 0.5 };
const DEFAULTS = { editFgColor: '#ff0000', editFillAllLayers: true, editFillContiguous: true, bucketFillWith: 'normal', selection: null, wand: null };
const SCENARIOS = [
  // [document, name, layer ('lower', 'upper', 'base'), view, workspace settings]
  [picture, 'PIXEL, Layer 1', 'lower', 'input', {}],
  [picture, 'PIXEL, Layer 1 alone', 'lower', 'input', { editFillAllLayers: false }],
  [picture, 'PIXEL, Layer 1, not contiguous', 'lower', 'input', { editFillContiguous: false }],
  [picture, 'PIXEL, Layer 1, in a selection', 'lower', 'input', { selection: { c0: 1, r0: 1, c1: COLS - 2, r1: LINES - 2 } }],
  [picture, 'PIXEL, Layer 2 (upper)', 'upper', 'input', {}],
  [picture, 'PIXEL, base', 'base', 'input', {}],
  [picture, 'ANSI Normal, Layer 1', 'lower', 'output', {}],
  [picture, 'ANSI Cells, Layer 1', 'lower', 'output', { bucketFillWith: 'cells' }],
  [picture, 'ANSI Cells, Layer 1 alone', 'lower', 'output', { bucketFillWith: 'cells', editFillAllLayers: false }],
  [picture, 'ANSI Cells, Layer 2 alone', 'upper', 'output', { bucketFillWith: 'cells', editFillAllLayers: false }],
  [picture, 'ANSI Cells, base', 'base', 'output', { bucketFillWith: 'cells' }],
  [ansEdit, '.ans Edit it: PIXEL, Layer 1', 'lower', 'input', {}],
  [ansEdit, '.ans Edit it: ANSI Cells, Layer 1', 'lower', 'output', { bucketFillWith: 'cells' }],
  [ansBase, '.ans Draw on top: PIXEL, Layer 1', 'lower', 'input', {}],
  [ansBase, '.ans Draw on top: PIXEL, base', 'base', 'input', {}],
  [ansBase, '.ans Draw on top: ANSI Cells, base', 'base', 'output', { bucketFillWith: 'cells' }],
];

test(`fills at ${COLS} cols x ${LINES} lines`, async () => {
  const lines = [], docs = new Map(), only = import.meta.env.VITE_BENCH_PROFILE;
  for (const [make, name, layer, view, settings] of SCENARIOS) {
    if (only && !only.split('|').some((part) => name.includes(part))) continue;
    if (!docs.has(make)) docs.set(make, await make());
    const doc = docs.get(make), { project, workspace } = doc;
    workspace.pickLayer(layer === 'base' ? 'base' : doc[layer]);
    Object.assign(workspace, DEFAULTS, settings);
    await settled(project);
    const all = [];
    for (let i = 0; i < RUNS; i++) all.push(await fill(project, workspace, view, MIDDLE, only && !i && name));
    const r = Object.fromEntries(Object.keys(all[0]).map((k) => [k, Math.round(median(all.map((run) => run[k])))]));
    lines.push(`${name.padEnd(36)} ${project.editIsUpper ? 'upper' : 'lower'}  ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  console.log(`\n${COLS} x ${LINES}, ${charRowsOf(2 * LINES) * COLS} cells (median of ${RUNS} runs, ms)\n${lines.join('\n')}`);
});

// The other edits the issue names, on the picture with Layer 1 filled: each its call and from its call until the drawing's
// settled again (the median of 3), then undone. Asserts nothing: it prints a table.
test(`other edits at ${COLS} cols x ${LINES} lines`, async () => {
  const { project, workspace, lower, upper } = await picture();
  Object.assign(workspace, DEFAULTS, { editorTab: 'input' });
  for (const [id, color] of [[upper, '#00ff00'], [lower, '#ff0000']]) { // Layer 1 picked after
    workspace.pickLayer(id);
    workspace.editFgColor = color;
    project.paintStroke(pixelArea(project, workspace, MIDDLE));
    project.commitEdit();
    await settled(project);
  }
  const all = project.gridRect(), lines = [`layers ${project.layers.map((layer) => layer.id).join(', ')}; filled ${lower}`];
  const edits = [
    ['Merge down onto the base', () => project.mergeDown(lower)],
    ['Merge down onto Layer 1', () => project.mergeDown(upper)],
    ['Into the image', () => project.mergeIntoPicture(null, lower)],
    ['Bake', () => project.bake()], // the brightness up first, for it to bake
    ['Flatten', () => project.flattenDrawing()],
    ['Delete, all selected', () => project.deleteSelection(all, [lower])],
    ['Paste over all', () => {
      const block = project.copySelection(all, [lower]);
      project.pasteSelection(block, 0, 0);
      project.commitPending();
    }],
    ['Wand, PIXEL, all', () => { workspace.editorTab = 'input'; wand.begin({ project, workspace, view: 'input' }, MIDDLE, {}); }],
    ['Wand, ANSI, all', () => { workspace.editorTab = 'output'; wand.begin({ project, workspace, view: 'output' }, MIDDLE, {}); }],
    ['Character set', () => { project.chars = project.chars === ' ░▒▓█' ? ' .:-=+*#%@' : ' ░▒▓█'; }],
    ['Art style', () => { project.renderStyle = project.renderStyle === 'ansi' ? 'colorAscii' : 'ansi'; }],
    ['Font, as tall', () => project.setDrawingFont({ name: 'Bench', height: 16, bytes: new Uint8Array(256 * 16).fill(0x18) })],
  ];
  for (const [name, edit] of edits) {
    const times = [], calls = [];
    let changed = false;
    for (let i = 0; i < 3; i++) {
      if (name === 'Bake') {
        project.brightness = 110;
        await settled(project);
      }
      const version = project.history.version, t = performance.now();
      if (import.meta.env.VITE_BENCH_EDIT === name && !i) await profiled(name, edit);
      else await edit();
      calls.push(performance.now() - t);
      await settled(project);
      times.push(performance.now() - t);
      changed ||= project.history.version !== version;
      workspace.wand = null;
      workspace.selection = null;
      if (project.history.version !== version) project.undo();
      project.brightness = 100;
      workspace.pickLayer(lower);
      await settled(project);
    }
    lines.push(`${name.padEnd(24)} ${String(Math.round(median(calls))).padStart(6)} ${String(Math.round(median(times))).padStart(6)}${changed ? '' : '  (changed nothing)'}`);
  }
  console.log(`\nOther edits, ${COLS} x ${LINES} (median of 3, ms: the call, then to settled)\n${lines.join('\n')}`);
});
