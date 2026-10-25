// Undo and redo bring back every state exactly: a seeded fuzz of random edits (typing, paint, erase,
// selections, merges, Bake, sliders, settings) undone and redone step by step, plus the cases it
// found: Bake and Merge into the image racing other changes, slider steps surviving a grid resize,
// and a removed pin no longer showing its character.
import { test, expect } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = new WeakMap();
let nextId = 1;
const idOf = (o) => (o ? (ids.get(o) ?? (ids.set(o, nextId++), ids.get(o))) : 0);

function layerHash(layer) {
  if (!layer) return 'none';
  const c = layer.canvas;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d[i]) | 0;
  return `${c.width}x${c.height}:${h}:${layer.hasPaint}`;
}

function docState(project, workspace) {
  return {
    editCells: JSON.stringify([...project.editCells].sort()),
    pins: JSON.stringify([...project.baseRecords.pins].sort()),
    paint: layerHash(project.paintLayer),
    base: layerHash(project.baseLayer),
    sliders: JSON.stringify(project.sliderValues()),
    image: idOf(project.image),
    hasPaint: project.hasPaint,
    colors: `${workspace.editFgColor}/${workspace.editBgColor}`,
  };
}

async function snap(project, workspace, { forceRender = true } = {}) {
  await settle(project);
  const shown = cellsKey(project).join('|');
  let full = null;
  if (forceRender) {
    project.render();
    await settle(project);
    full = cellsKey(project).join('|');
  }
  return { ...docState(project, workspace), shown, full };
}

// Count the undoable depth by wrapping the history.
function trackDepth(project) {
  const h = project.history;
  const t = { depth: 0 };
  const push = h.push.bind(h), undo = h.undo.bind(h), redo = h.redo.bind(h), clear = h.clear.bind(h);
  h.push = (e) => { push(e); t.depth = Math.min(t.depth + 1, h.limit); };
  h.undo = () => { const ok = undo(); if (ok) t.depth--; return ok; };
  h.redo = () => { const ok = redo(); if (ok) t.depth++; return ok; };
  h.clear = () => { clear(); t.depth = 0; t.cleared = (t.cleared ?? 0) + 1; };
  return t;
}

const SLIDERS = [
  ['brightness', [60, 140, 180]], ['contrast', [70, 150]], ['saturation', [40, 160]], ['hue', [30, 200]],
  ['invert', [50, 100]], ['colorizeStrength', [40]], ['sharpen', [30]], ['edges', [2]], ['flatten', [3]],
];
const CHARS = ['A', 'x', '█', '▀', ' ', '#', '漢'];
const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffee00', '#ffffff', '#123456'];

function makeActions(project, workspace, r, opts) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (n) => Math.floor(r() * n);
  const rows = () => Math.floor(project.rows / 2);
  const rect = () => {
    const c0 = int(project.cols - 1), r0 = int(rows() - 1);
    return { c0, r0, c1: Math.min(project.cols - 1, c0 + 1 + int(8)), r1: Math.min(rows() - 1, r0 + 1 + int(6)) };
  };
  const layers = () => pick([{ base: true, edit: true }, { base: false, edit: true }, { base: true, edit: false }]);
  const actions = {
    type: () => {
      const c = int(project.cols), rr = int(rows());
      for (let k = 0; k < 1 + int(4); k++) project.typeAt(Math.min(project.cols - 1, c + k), rr, pick(CHARS), { fg: pick(COLORS), bg: pick(COLORS) });
      project.commitEdit();
    },
    paint: () => {
      const x = int(project.cols), y = int(project.rows), color = pick(COLORS);
      workspace.editBrushOpacity = pick([100, 100, 50]);
      project.paintStroke(Array.from({ length: 1 + int(10) }, (_, k) => ({ x: x + k, y: y + (k % 3), alpha: pick([1, 1, 0.5]) })), color);
      project.commitEdit();
    },
    erasePaint: () => {
      const x = int(project.cols), y = int(project.rows);
      project.eraseEditPixels(Array.from({ length: 1 + int(8) }, (_, k) => ({ x: x + k, y })).filter((p) => p.x < project.cols));
      project.commitEdit();
    },
    eraseBase: () => {
      const c = int(project.cols), rr = int(rows());
      project.beginEdit();
      project.eraseBase(Array.from({ length: 1 + int(4) }, (_, k) => ({ col: Math.min(project.cols - 1, c + k), row: rr })));
      project.commitEdit();
    },
    flip: () => {
      const c = int(project.cols), rr = int(rows());
      project.flipCell(c, rr, pick([{ base: false, edit: true }, { base: true, edit: false }, { base: true, edit: true }]));
      project.commitEdit();
    },
    del: () => project.deleteSelection(rect(), layers()),
    copyPaste: () => {
      const block = project.copySelection(rect(), layers());
      project.pasteSelection(block, int(project.cols), int(rows()));
    },
    move: () => {
      const sel = rect(), ls = layers();
      let landed = sel;
      for (let k = 0; k < 1 + int(3) && landed; k++) landed = project.floatSelection(landed, ls, int(5) - 2, int(5) - 2);
    },
    mergeUp: () => project.mergeUp(r() < 0.5 ? rect() : undefined),
    mergeDown: () => project.mergeDown(r() < 0.5 ? rect() : null),
    clearEdit: () => project.clearEditLayer(),
    slider: () => {
      const [key, values] = pick(SLIDERS);
      for (const v of values) project.setSlider(key, v);
      project.commitSliders(key);
    },
    typingRun: () => { // left open: the next edit, undo or the pause ends it
      const c = int(project.cols), rr = int(rows());
      let col = c;
      for (let k = 0; k < 1 + int(5); k++) {
        const op = int(6);
        if (op === 0) col -= project.backspaceAt(col, rr, { fg: '#aaaaaa', bg: '#000000' }, { insert: r() < 0.5 });
        else if (op === 1) project.deleteAt(col, rr);
        else { const ch = pick(CHARS); if (project.typeAt(Math.min(col, project.cols - 1), rr, ch, { fg: pick(COLORS) }, { insert: r() < 0.3 })) col = Math.min(project.cols - 1, col + (ch === '漢' ? 2 : 1)); }
      }
    },
    pasteFloat: () => {
      const block = project.copySelection(rect(), layers());
      let landed = project.pasteSelection(block, int(project.cols), int(rows()));
      for (let k = 0; k < 1 + int(3) && landed; k++) landed = project.floatSelection(landed, layers(), int(5) - 2, int(5) - 2);
    },
    reset: () => (r() < 0.5 ? project.resetSliders() : project.resetGroup(pick(['transform', 'adjust', 'effects']))),
  };
  if (opts.async) {
    actions.mergeIntoPicture = async () => project.mergeIntoPicture(r() < 0.5 ? rect() : null);
    actions.bake = async () => {
      if (!project.canBake) { project.setSlider('brightness', 130); project.commitSliders('brightness'); return; }
      await project.bake();
    };
  }
  return actions;
}


// The stack of expected states, kept in step with the history. An open typing run is on the stack
// (provisionally) but not yet in the history; it becomes a step when committed, if it changed anything.
function account(stack, s, d, project, acc) {
  const nowOpen = !!project._stroke?.typing;
  if (acc.open && !nowOpen) { // the run was committed by this step
    acc.open = false;
    if (d >= 1) d--; // its step
    else stack.pop(); // it changed nothing: no step
  }
  if (nowOpen && !acc.open) {
    if (d === 1) stack.push(s); // (cannot know the state between; rare)
    stack.push(s);
    acc.open = true;
    return d > 1 ? `depth ${d}` : null;
  }
  if (nowOpen && acc.open && d === 0) { stack[stack.length - 1] = s; return null; }
  if (d === 1) stack.push(s);
  else if (d === 0) stack[stack.length - 1] = s; // a no-op (or a float run replacing its step)
  else return `depth changed by ${d}`;
  return null;
}
function closeRun(stack, project, t, acc) {
  if (!acc.open) return;
  const before = t.depth;
  project.commitPending();
  if (t.depth === before) { const top = stack.pop(); stack[stack.length - 1] = top; }
  acc.open = false;
}

// Run a seeded sequence; return a description of the first mismatch, or null.
async function fuzz(seed, { quantize = 'none', renderStyle = 'ansi', steps = 20, async = true, forceRender = true, only = null } = {}) {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40, quantize });
  project.renderStyle = renderStyle;
  await settle(project);
  project.clearHistory();
  const t = trackDepth(project);
  const r = rng(seed);
  const actions = makeActions(project, workspace, r, { async });
  const names = only ?? Object.keys(actions);
  const stack = [await snap(project, workspace, { forceRender })];
  const log = [];
  const acc = { open: false };
  for (let i = 0; i < steps; i++) {
    const name = names[Math.floor(r() * names.length)];
    const before = t.depth;
    await actions[name]();
    const s = await snap(project, workspace, { forceRender });
    let d = t.depth - before;
    log.push(`${name}(${d >= 0 ? '+' : ''}${d})`);
    if (globalThis.__debug) console.log(i, name, d, 'stroke', !!project._stroke, project._stroke?.typing, 'cells', JSON.stringify([...project.editCells.keys()]), 'strokeCells', project._stroke && JSON.stringify([...project._stroke.editCells.keys()]));
    if (t.cleared) return { seed, log, problem: 'history cleared mid-run' };
    const err = account(stack, s, d, project, acc);
    if (err) return { seed, log, problem: err };
    // a shown state should match a full render of the same document
    if (forceRender && s.shown !== s.full && realDiff(s.shown, s.full)) return { seed, log, problem: `step ${i} ${name}: shown cells differ from a full render`, diff: diffCells(s.shown, s.full) };
  }
  closeRun(stack, project, t, acc);
  const compare = (a, b) => Object.keys(a).filter((k) => k !== 'shown' && a[k] !== b[k] && !(k === 'full' && !forceRender));
  // undo all the way
  for (let i = stack.length - 2; i >= 0; i--) {
    project.undo();
    const s = await snap(project, workspace, { forceRender });
    const bad = compare(stack[i], s);
    if (bad.length) return { seed, log, problem: `undo to state ${i}: ${bad.join(',')} differ`, diff: bad.includes('full') ? diffCells(stack[i].full, s.full) : null, want: pickKeys(stack[i], bad), got: pickKeys(s, bad) };
  }
  if (project.canUndo) return { seed, log, problem: 'canUndo still true at the start' };
  for (let i = 1; i < stack.length; i++) {
    project.redo();
    const s = await snap(project, workspace, { forceRender });
    const bad = compare(stack[i], s);
    if (bad.length) return { seed, log, problem: `redo to state ${i}: ${bad.join(',')} differ`, diff: bad.includes('full') ? diffCells(stack[i].full, s.full) : null, want: pickKeys(stack[i], bad), got: pickKeys(s, bad) };
  }
  if (project.canRedo) return { seed, log, problem: 'canRedo still true at the end' };
  return null;
}

// Differences other than a char on a cell whose fg and bg are one color (an erased cell's pin shows
// only after a full render: known, invisible).
function realDiff(a, b) {
  const x = a.split('|'), y = b.split('|');
  return x.some((c, i) => c !== y[i] && !(c.slice(-14) === y[i]?.slice(-14) && c.slice(-14, -7) === c.slice(-7)));
}
const pickKeys = (o, keys) => Object.fromEntries(keys.filter((k) => k !== 'full').map((k) => [k, String(o[k]).slice(0, 300)]));
function diffCells(a, b) {
  const x = a.split('|'), y = b.split('|');
  const out = [];
  for (let i = 0; i < Math.max(x.length, y.length) && out.length < 6; i++) if (x[i] !== y[i]) out.push(`#${i}(c${i % 40},r${Math.floor(i / 40)}): ${x[i]} vs ${y[i]}`);
  return `${out.length} shown: ${out.join('; ')}`;
}

// A few seeds by default, the ones that once failed (a removed pin kept showing: sync 18, 28, 29;
// bake+merge 7); VITE_FUZZ_SEEDS=n runs seeds 1..n (30 takes about six minutes).
const FUZZ_SEEDS = Number(import.meta.env?.VITE_FUZZ_SEEDS ?? 0);
const seeds = (failed) => (FUZZ_SEEDS ? Array.from({ length: FUZZ_SEEDS }, (_, i) => i + 1) : failed);

for (const quantize of ['none', 'count']) {
  test(`fuzz: sync actions, quantize ${quantize}`, async () => {
    const failures = [];
    for (const seed of seeds([18, 28])) {
      const f = await fuzz(seed, { quantize, async: false, steps: 20 });
      if (f) failures.push(f);
    }
    expect(failures).toEqual([]);
  }, 300_000);
}

test('fuzz: with bake and merge into the picture', async () => {
  const failures = [];
  for (const seed of seeds([7])) {
    const f = await fuzz(seed, { async: true, steps: 15 });
    if (f) failures.push(f);
  }
  expect(failures).toEqual([]);
}, 300_000);


const dragSlider = (project, key, values) => { for (const v of values) project.setSlider(key, v); project.commitSliders(key); };

test('race: a slider moved while Bake runs: the move is kept, and undoing the bake goes back to it', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  dragSlider(project, 'brightness', [150]);
  await settle(project);
  const baking = project.bake();
  dragSlider(project, 'contrast', [170]); // moved while the bake encodes
  await settle(project);
  const shownBefore = cellsKey(project).join('|');
  await baking;
  await settle(project);
  const shownAfter = cellsKey(project).join('|');
  const changed = shownAfter.split('|').filter((c, i) => c !== shownBefore.split('|')[i]).length;
  project.undo();
  await settle(project);
  expect(changed).toBe(0); // Bake changes nothing on the canvas
  expect({ brightness: project.brightness, contrast: project.contrast }).toEqual({ brightness: 150, contrast: 170 });
});

test('race: Undo pressed while Bake runs (undoing a slider move) is kept', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  dragSlider(project, 'brightness', [150]);
  dragSlider(project, 'contrast', [170]);
  await settle(project);
  const baking = project.bake();
  project.undo(); // contrast back to 100
  await settle(project);
  await baking;
  await settle(project);
  project.undo();
  await settle(project);
  expect({ brightness: project.brightness, contrast: project.contrast }).toEqual({ brightness: 150, contrast: 100 });
});

for (const what of ['paint', 'slider', 'undo']) {
  test(`race: ${what} while Merge into the image runs: the merge still happens (or says why not)`, async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace, { cols: 40, rows: 40 });
    dragSlider(project, 'brightness', [130]);
    await settle(project);
    const image = project.image;
    const merging = project.mergeIntoPicture();
    await new Promise((r) => setTimeout(r, 0));
    if (what === 'paint') { project.paintStroke([{ x: 2, y: 2, alpha: 1 }], '#ff00ff'); project.commitEdit(); }
    if (what === 'slider') dragSlider(project, 'contrast', [150]);
    if (what === 'undo') project.undo();
    await merging;
    await settle(project);
    expect(project.image).not.toBe(image);
  });
}

test('race: Bake and Merge into the image at once: both happen', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  dragSlider(project, 'brightness', [130]);
  await settle(project);
  const a = project.bake(), b = project.mergeIntoPicture();
  await Promise.all([a, b]);
  await settle(project);
  expect({ baked: project.brightness === 100, merged: !project.hasEdits }).toEqual({ baked: true, merged: true });
});

test('the history cap: undo stops at the 50th step back, exactly there', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  project.clearHistory();
  const states = [await snap(project, workspace)];
  for (let i = 0; i < 60; i++) {
    if (i % 7 === 3) dragSlider(project, 'hue', [10 * i]);
    else if (i % 11 === 5) project.mergeDown({ c0: 0, r0: 0, c1: 20, r1: 10 });
    else { project.paintStroke([{ x: i % 40, y: (3 * i) % 40, alpha: 1 }, { x: (i + 1) % 40, y: (3 * i) % 40, alpha: 1 }], COLORS[i % COLORS.length]); project.commitEdit(); }
    states.push(await snap(project, workspace));
  }
  const n = states.length - 1;
  let undone = 0;
  while (project.canUndo) { project.undo(); undone++; }
  const s = await snap(project, workspace);
  expect(undone).toBe(50);
  for (const k of ['editCells', 'pins', 'paint', 'base', 'sliders', 'full']) expect(s[k], k).toBe(states[n - 50][k]);
});

test('a canvas resize (with edits) keeps undo; undoing Bake and Merge into the image across it', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  dragSlider(project, 'brightness', [150]);
  await settle(project);
  const s0 = await snap(project, workspace);
  await project.bake();
  await settle(project);
  await project.mergeIntoPicture({ c0: 10, r0: 6, c1: 13, r1: 12 });
  await settle(project);
  project.cols = 48;
  project.rows = 46;
  await settle(project);
  expect(project.canUndo).toBe(true);
  project.undo();
  project.undo();
  await settle(project);
  project.cols = 40;
  project.rows = 40;
  await settle(project);
  const s = await snap(project, workspace);
  for (const k of ['editCells', 'pins', 'sliders', 'image', 'full']) expect(s[k], k).toBe(s0[k]);
});

test('a slider move survives a grid resize on an undrawn picture (undo still has it)', async () => {
  const { project } = await createTestApp();
  const { loadImage } = await import('../support/app.js');
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  dragSlider(project, 'brightness', [150]);
  await settle(project);
  project.cols = 50;
  await settle(project);
  expect(project.canUndo).toBe(true);
});

// Settings that aren't undo steps (seed, characters, palette, art style) changed between edits: the
// document's own state replays exactly, and with the settings put back, so does the picture.
async function fuzzSettings(seed, { steps = 20, forceRender = false } = {}) {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  await settle(project);
  project.clearHistory();
  const initial = { seed: project.seed, chars: project.chars, quantize: project.quantize, renderStyle: project.renderStyle };
  const t = trackDepth(project);
  const r = rng(seed);
  const actions = makeActions(project, workspace, r, { async: true });
  actions.settings = () => {
    const k = Math.floor(r() * 4);
    if (k === 0) project.seed = `s${Math.floor(r() * 1000)}`;
    if (k === 1) project.chars = ['░▒▓█', '.:*%#', '▄▀█ '][Math.floor(r() * 3)];
    if (k === 2) project.quantize = ['none', 'count', 'cga', 'vga'][Math.floor(r() * 4)];
    if (k === 3) project.renderStyle = ['ansi', 'colorAscii', 'ansi'][Math.floor(r() * 3)];
  };
  const names = [...Object.keys(actions), 'settings', 'settings'];
  const start = await snap(project, workspace, { forceRender: true });
  const stack = [start];
  const acc = { open: false };
  const log = [];
  for (let i = 0; i < steps; i++) {
    const name = names[Math.floor(r() * names.length)];
    const before = t.depth;
    await actions[name]();
    const s = await snap(project, workspace, { forceRender });
    const d = t.depth - before;
    log.push(`${name}(${d})`);
    if (t.cleared) return { seed, log, problem: 'history cleared' };
    const err = account(stack, s, d, project, acc);
    if (err) return { seed, log, problem: err };
  }
  closeRun(stack, project, t, acc);
  const keys = ['editCells', 'pins', 'paint', 'base', 'sliders', 'image', 'hasPaint', 'colors'];
  const cmp = (a, b) => keys.filter((k) => a[k] !== b[k]);
  for (let i = stack.length - 2; i >= 0; i--) {
    project.undo();
    const s = await snap(project, workspace, { forceRender });
    const bad = cmp(stack[i], s);
    if (bad.length) return { seed, log, problem: `undo to ${i}: ${bad}`, want: pickKeys(stack[i], bad), got: pickKeys(s, bad) };
  }
  for (let i = 1; i < stack.length; i++) {
    project.redo();
    const s = await snap(project, workspace, { forceRender });
    const bad = cmp(stack[i], s);
    if (bad.length) return { seed, log, problem: `redo to ${i}: ${bad}`, want: pickKeys(stack[i], bad), got: pickKeys(s, bad) };
  }
  while (project.canUndo) project.undo();
  Object.assign(project, initial);
  const s = await snap(project, workspace, { forceRender: true });
  if (s.full !== start.full) return { seed, log, problem: 'with the settings put back, the start state differs', diff: diffCells(start.full, s.full) };
  return null;
}

test('fuzz: settings changes between edits, no forced renders', async () => {
  const failures = [];
  for (const seed of seeds([1])) {
    const f = await fuzzSettings(seed + 100);
    if (f) failures.push(f);
  }
  expect(failures).toEqual([]);
}, 400_000);

test('seed 18, four steps: a pin removed by a paste stops showing', async () => {
  const f = await fuzz(18, { quantize: 'none', async: false, steps: 4 });
  expect(f).toBe(null);
}, 120_000);

test('stale pin: pasting base content over an erased cell shows the converter character (not the old pinned space)', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 }); // (15, 9) is erased: black, pinned space
  const at = 9 * 40 + 15;
  dragSlider(project, 'brightness', [101]); project.undo(); await settle(project); // a full render, as after any slider move
  expect(project.cells[at].char).toBe(' ');
  const block = project.copySelection({ c0: 30, r0: 9, c1: 30, r1: 9 }, { base: true, edit: false });
  project.pasteSelection(block, 15, 9);
  await settle(project);
  const shown = project.cells[at];
  project.render();
  await settle(project);
  const full = project.cells[at];
  expect(`${shown.char}${shown.fg.hex}${shown.bg.hex}`).toBe(`${full.char}${full.fg.hex}${full.bg.hex}`);
});

test('stale pin: Merge up right after that paste freezes the old pinned space into an edit cell', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  const block = project.copySelection({ c0: 30, r0: 9, c1: 30, r1: 9 }, { base: true, edit: false });
  project.pasteSelection(block, 15, 9);
  await settle(project);
  project.render(); await settle(project);
  const want = project.cells[9 * 40 + 15].char; // what the converter puts there
  project.undo(); await settle(project);
  project.pasteSelection(block, 15, 9); // again, with no full render after it
  await settle(project);
  project.mergeUp({ c0: 15, r0: 9, c1: 15, r1: 9 });
  expect(project.editCellAt(15, 9).char).toBe(want);
});

test('stale pin: moving a typed-and-merged-down letter away leaves it showing at both places', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 }); // 'A' typed at (14, 8)
  project.mergeDown(); // Exactly: A pinned on the base
  await settle(project);
  // Select (13..14, 8) on the Base layer and drag it two cells down; then a block from elsewhere over (14, 8)
  project.floatSelection({ c0: 14, r0: 8, c1: 14, r1: 8 }, { base: true, edit: false }, 0, 2);
  const block = project.copySelection({ c0: 30, r0: 3, c1: 30, r1: 3 }, { base: true, edit: false });
  project.pasteSelection(block, 14, 8);
  await settle(project);
  expect(project.cells[8 * 40 + 14].char).not.toBe('A');
});


test('cancelEdit takes back the open stroke (paint, base pixels and pins) and records nothing; a typing run stays', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  project.paintStroke([{ x: 3, y: 3, alpha: 1 }, { x: 4, y: 3, alpha: 1 }], '#ff00ff');
  project.commitEdit();
  const drawn = await snap(project, workspace), version = project.history.version;
  project.paintStroke([{ x: 20, y: 20, alpha: 1 }], '#00ff00');
  project.eraseBase([{ col: 2, row: 2 }]);
  project.cancelEdit();
  expect((await snap(project, workspace)).full).toBe(drawn.full);
  expect(project.history.version).toBe(version);

  project.typeAt(5, 5, 'Z', { fg: '#ffffff', bg: '#000000' });
  project.cancelEdit();
  expect(project.editCellAt(5, 5)?.char).toBe('Z');
});
