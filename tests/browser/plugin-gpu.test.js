// A plugin solver's shader passes on the GPU (ShapeMatcher, docs/plugins.md): they give the JavaScript's cells, an area
// and a grid in bands give a whole grid's, pass 2 reads pass 1's picks, and the renderer checks a shader against its
// JavaScript before it uses it, switching it off for the visit when it disagrees or doesn't build.
import { test, expect, vi, afterEach, describe } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { onSolver } from '../support/pluginSolvers.js';
import ShapeMatcher from '@/lib/ShapeMatcher.js';
import { pluginMatcher, resolvePlugin, grownArea } from '@/lib/PluginSolve.js';
import { SAMPLES, cellRange, shapeMatcher } from '@/lib/CharResolver.js';
import { referenceMask, loadReferenceFont } from '@/lib/GlyphCoverage.js';
import { PALETTES } from '@/lib/ColorUtils.js';
import { readScript } from '@/plugins/script';
import { solverRef, unregisterScript } from '@/plugins/solvers';
import { usePluginStore } from '@/store/PluginStore';
import { t } from '@/i18n';

afterEach(() => {
  vi.restoreAllMocks();
  unregisterScript('phosphor.outlines');
});

const REF = solverRef('phosphor.outlines', 'edges');
const SET = '▄▀█ ', OWN = '/\\', ALL = [...SET, ...OWN];
const key = (cells) => cells.map((c) => c && `${c.char}|${c.fg.r},${c.fg.g},${c.fg.b},${c.fg.c}|${c.bg.r},${c.bg.g},${c.bg.b},${c.bg.c}`);
const solver = (fields) => readScript({ default: { solvers: [{ id: 'edges', name: 'Edges', styles: ['ansi', 'colorAscii', 'ascii'], reach: 1, chars: OWN, ...fields }] } }).solvers[0];
const rgb = (r, g, b) => ({ r, g, b });

async function glyphsOf() {
  await loadReferenceFont();
  return ALL.map((char, i) => ({ char, mask: referenceMask(char, SAMPLES.w, SAMPLES.h), own: i >= SET.length }));
}
const matcherOf = async (def, { palette = null, renderStyle = 'ansi', options = {} } = {}) =>
  pluginMatcher({ def, ref: REF, palette, glyphs: await glyphsOf(), solids: 0.25, light: 1, renderStyle, options });

// Samples made up from the cell's place, so neighbors differ (as shape-gpu.test.js's).
function samplesOf(cols, lines) {
  const sw = SAMPLES.w, sh = SAMPLES.h, data = new Uint8ClampedArray(cols * sw * lines * sh * 4);
  for (let y = 0; y < lines * sh; y++) {
    for (let x = 0; x < cols * sw; x++) {
      const v = (x * 37 + y * 11 + ((x * y) % 7) * 29) % 256;
      data.set([v, (v * 3 + y) % 256, (255 - v + x * 5) % 256, 255], (y * cols * sw + x) * 4);
    }
  }
  return data;
}

// Pass 1 reads its neighbors and options, and gives every kind of result the JavaScript holds: nothing, a character
// not in the set, the solid, a color past 0..255, and the solver's own characters. No By shape: no near-ties.
const PASS_ONE = {
  options: [
    { id: 'threshold', kind: 'slider', name: 'Threshold', min: -100, max: 100, step: 1, default: 0 },
    { id: 'swap', kind: 'checkbox', name: 'Swap', default: false },
    { id: 'pick', kind: 'choice', name: 'Pick', choices: ['A', 'B'], default: 0 },
  ],
  solve(cell, look) {
    const a = cell.sample(0, 0, 0)[0], b = cell.sample(1, 0, 5)[1], c = [...cell.sample(-1, 1, 31)];
    if (a < 20) return null;
    if (a < 40) return { char: 'Z', fg: rgb(a, b, c[2]), bg: rgb(c[0], 0, 0) };
    if (a < 60) return { char: '/', fg: rgb(300, a, 0), bg: rgb(b, b, b) };
    if (a > 240) return { char: '█', fg: rgb(c[0], c[1], c[2]), bg: rgb(a, a, a) };
    const own = (a - b > look.options.threshold) !== look.options.swap;
    if (own) return { char: look.options.pick ? '\\' : '/', fg: rgb(c[0], c[1], c[2]), bg: rgb(a, b, 0) };
    return { char: '▀', fg: rgb(b, a, c[2]), bg: rgb(0, 0, a) };
  },
  shader: { solve: `
    vec3 a = sampleAt(ivec2(0, 0), 0), b = sampleAt(ivec2(1, 0), 5), c = sampleAt(ivec2(-1, 1), 31);
    if (a.r < 20.0) return;
    if (a.r < 40.0) { put(vec3(a.r, b.g, c.b), vec3(c.r, 0.0, 0.0), 99); return; }
    if (a.r < 60.0) { put(vec3(300.0, a.r, 0.0), vec3(b.g), 4); return; }
    if (a.r > 240.0) { put(c, vec3(a.r), 255); return; }
    bool own = (a.r - b.g > opt_threshold) != opt_swap;
    if (own) put(c, vec3(a.r, b.g, 0.0), opt_pick == 1 ? 5 : 4);
    else put(vec3(b.g, a.r, c.b), vec3(0.0, 0.0, a.r), 1);` },
};

// A pass 1 and a pass 2 that writes what it reads of pass 1's picks into its colors (no palette): 0 past the border.
const code = (char) => (char === null ? 0 : 40 + ALL.indexOf(char) * 30);
const TWO_PASSES = {
  solve(cell) {
    const s = [...cell.sample(0, 0, 0)], n = cell.sample(1, 1, 9);
    return { char: s[1] > 200 ? '█' : s[0] > n[1] ? '/' : '\\', fg: rgb(s[0], n[1], 0), bg: rgb(0, 0, 0) };
  },
  refine(cell) {
    return {
      char: cell.char(0, 0),
      fg: rgb(code(cell.char(-1, 0)), code(cell.char(1, -1)), code(cell.char(0, 1))),
      bg: rgb(code(cell.char(1, 1)), cell.sample(1, 0, 3)[0], 0),
    };
  },
  shader: {
    solve: `
      vec3 s = sampleAt(ivec2(0, 0), 0), n = sampleAt(ivec2(1, 1), 9);
      put(vec3(s.r, n.g, 0.0), vec3(0.0), s.g > 200.0 ? 255 : s.r > n.g ? 4 : 5);`,
    refine: `
      ivec4 k = ivec4(charAt(ivec2(-1, 0)), charAt(ivec2(1, -1)), charAt(ivec2(0, 1)), charAt(ivec2(1, 1)));
      vec4 v = vec4(greaterThanEqual(k, ivec4(0))) * (40.0 + vec4(k) * 30.0);
      put(v.xyz, vec3(v.w, sampleAt(ivec2(1, 0), 3).r, 0.0), charAt(ivec2(0, 0)));`,
  },
};

describe.skipIf(!ShapeMatcher.available())('with WebGL2', () => {
  test('a reach-1 shader solver gives the JavaScript\'s cells over a whole grid', async () => {
    const def = solver(PASS_ONE), samples = samplesOf(13, 9), gpu = ShapeMatcher.shared();
    for (const [renderStyle, palette] of [['ansi', PALETTES.cga], ['ansi', null], ['colorAscii', PALETTES.vga], ['ascii', null]]) {
      for (const options of [{ threshold: 0, swap: false, pick: 0 }, { threshold: -30, swap: true, pick: 1 }]) {
        for (const dither of [{}, { strength: 0.7, style: 'bayer' }]) {
          const matcher = await matcherOf(def, { palette, renderStyle, options });
          const out = gpu.resolve(samples, 13, 9, matcher, dither);
          const what = `${renderStyle} ${!!palette} ${options.pick} ${!!dither.style}`;
          expect(out, what).toMatchObject({ first: null, carried: null });
          expect(key(out.cells), what).toEqual(key(resolvePlugin(samples, 13, 9, matcher, dither).cells));
          expect(new Set(out.cells.map((c) => c.char)).size, what).toBeGreaterThan(3);
        }
      }
    }
  });

  // 0 to 255 a channel in the shader, as its samples, the palette's colors and put's are: no scale to change between.
  test('a color option is a vec3 of 0 to 255 in the shader and { r, g, b } in the JavaScript, and they agree', async () => {
    const def = solver({
      options: [{ id: 'tint', kind: 'color', name: 'Tint', default: '#ff8000' }],
      solve(cell, look) {
        const t = look.options.tint, a = cell.sample(0, 0, 0)[0];
        return { char: '/', fg: rgb(t.r, a, 0), bg: rgb(0, t.g, t.b) };
      },
      shader: { solve: 'put(vec3(opt_tint.r, sampleAt(ivec2(0, 0), 0).r, 0.0), vec3(0.0, opt_tint.g, opt_tint.b), 4);' },
    });
    const samples = samplesOf(6, 4), gpu = ShapeMatcher.shared();
    for (const tint of ['#ff8000', '#123456']) {
      const matcher = await matcherOf(def, { options: { tint } });
      const cells = gpu.resolve(samples, 6, 4, matcher).cells;
      expect(key(cells)).toEqual(key(resolvePlugin(samples, 6, 4, matcher).cells));
      expect([cells[0].fg.r, cells[0].bg.g, cells[0].bg.b]).toEqual([1, 3, 5].map((at) => parseInt(tint.slice(at, at + 2), 16))); // the color itself, not black
    }
  });

  // What look hands the JavaScript, the shader has under a name of its own: Solids and Pattern light as the same numbers
  // (uTolerance, By shape's own, isn't Solids), the style by its place in ansi, colorAscii, ascii, and look.gray as gray().
  test('uSolids, uLight and uStyle are look.solids, look.light and look.style, and gray() is look.gray', async () => {
    const STYLE = ['ansi', 'colorAscii', 'ascii'];
    const def = solver({
      solve(cell, look) {
        const bright = Math.floor(look.gray(cell.sample(0, 0, 0)) / 16) * 16;
        return { char: ['/', '\\', '█'][STYLE.indexOf(look.style)], fg: rgb(look.solids * 200, look.light * 100, bright), bg: rgb(bright, 0, 0) };
      },
      shader: { solve: `float bright = floor(gray(sampleAt(ivec2(0, 0), 0)) / 16.0) * 16.0;
        put(vec3(uSolids * 200.0, uLight * 100.0, bright), vec3(bright, 0.0, 0.0), uStyle == 0 ? 4 : uStyle == 1 ? 5 : 2);` },
    });
    const samples = samplesOf(6, 4), gpu = ShapeMatcher.shared();
    for (const renderStyle of STYLE) {
      const matcher = await matcherOf(def, { renderStyle });
      const cells = gpu.resolve(samples, 6, 4, matcher).cells;
      expect(key(cells), renderStyle).toEqual(key(resolvePlugin(samples, 6, 4, matcher).cells));
      expect(cells[0].char, renderStyle).toBe(['/', '\\', '█'][STYLE.indexOf(renderStyle)]);
    }
    const [cell] = gpu.resolve(samples, 6, 4, await matcherOf(def)).cells; // matcherOf: Solids 25%, Pattern light 100%
    expect([cell.fg.r, cell.fg.g]).toEqual([50, 100]);
  });

  test('an area\'s GPU resolve equals the whole grid\'s over the grown area, in bands or not', async () => {
    const def = solver(TWO_PASSES), cols = 10, lines = 23, samples = samplesOf(cols, lines), gpu = ShapeMatcher.shared();
    const matcher = await matcherOf(def), dither = { strength: 0.7, style: 'bayer' };
    const whole = gpu.resolve(samples, cols, lines, matcher, dither);
    const js = resolvePlugin(samples, cols, lines, matcher, dither);
    expect(key(whole.cells)).toEqual(key(js.cells));
    expect(key(whole.first)).toEqual(key(js.first));
    const maxSize = gpu.maxSize;
    try {
      gpu.maxSize = 64; // 8 lines of samples a texture, 6 a band with a line of margin each way: 4 bands
      const banded = gpu.resolve(samples, cols, lines, matcher, dither);
      expect(key(banded.cells)).toEqual(key(whole.cells));
      expect(key(banded.first)).toEqual(key(whole.first));
      const area = { x: 3, y: 2 * 9, w: 3, h: 2 * 5 }; // lines 9 to 13, across a band's end
      for (const size of [64, maxSize]) {
        gpu.maxSize = size;
        const cells = new Array(cols * lines).fill(null), first = whole.first.slice();
        expect(gpu.resolve(samples, cols, lines, matcher, { ...dither, area, cells, first })).toMatchObject({ cells, first });
        const { c0, c1, l0, l1 } = cellRange(grownArea(area, 2, cols, lines), cols, lines);
        cells.forEach((cell, i) => {
          const col = i % cols, line = (i - col) / cols, inside = col >= c0 && col < c1 && line >= l0 && line < l1;
          expect(key([cell])[0], `${size}: ${col}, ${line}`).toBe(inside ? key([whole.cells[i]])[0] : null);
        });
        expect(key(first)).toEqual(key(whole.first));
      }
    } finally {
      gpu.maxSize = maxSize;
    }
  });

  test('pass 2 on the GPU reads pass 1\'s picks, -1 past the border', async () => {
    const def = solver(TWO_PASSES), cols = 5, lines = 4, samples = samplesOf(cols, lines);
    const matcher = await matcherOf(def);
    const { cells, first } = ShapeMatcher.shared().resolve(samples, cols, lines, matcher, {});
    expect(key(cells)).toEqual(key(resolvePlugin(samples, cols, lines, matcher, {}).cells));
    expect(new Set(first.map((c) => c.char))).toEqual(new Set(['█', '/', '\\']));
    cells.forEach((cell, i) => {
      const col = i % cols, line = (i - col) / cols;
      expect(cell.fg.r === 0, `${col}, ${line}`).toBe(col === 0);
      expect(cell.fg.g === 0, `${col}, ${line}`).toBe(col === cols - 1 || line === 0);
      expect(cell.fg.b === 0, `${col}, ${line}`).toBe(line === lines - 1);
      if (col > 0) expect(cell.fg.r).toBe(code(first[i - 1].char));
    });
  });

  test('at the border and on a 1-column drawing the shader reads the edge cell', async () => {
    const def = solver({
      reach: 2,
      solve(cell) {
        const a = [...cell.sample(-2, -2, 0)], b = [...cell.sample(2, 2, 31)], c = cell.sample(0, 2, 16)[2];
        return { char: '/', fg: rgb(a[0], a[1], a[2]), bg: rgb(b[0], b[1], c) };
      },
      shader: { solve: 'vec3 a = sampleAt(ivec2(-2, -2), 0), b = sampleAt(ivec2(2, 2), 31); put(a, vec3(b.rg, sampleAt(ivec2(0, 2), 16).b), 4);' },
    });
    const matcher = await matcherOf(def);
    for (const [cols, lines] of [[1, 5], [3, 3], [7, 6], [1, 1]]) {
      const samples = samplesOf(cols, lines), { cells } = ShapeMatcher.shared().resolve(samples, cols, lines, matcher, {});
      expect(key(cells), `${cols} x ${lines}`).toEqual(key(resolvePlugin(samples, cols, lines, matcher, {}).cells));
      expect(cells[0].fg).toMatchObject(rgb(samples[0], samples[1], samples[2])); // its own first sample: the edge cell's
    }
  });

  test('byShape() in a solver\'s shader is By shape\'s own shader over the layer\'s set, in bands or not', async () => {
    const def = solver({ reach: 2, solve: (cell, look) => look.byShape(), shader: { solve: 'byShape();' } });
    const cols = 9, lines = 21, samples = samplesOf(cols, lines), gpu = ShapeMatcher.shared(), maxSize = gpu.maxSize;
    const set = (await glyphsOf()).filter((g) => !g.own), dither = { strength: 0.7, style: 'bayer' };
    try {
      for (const [renderStyle, palette] of [['ansi', PALETTES.cga], ['ansi', null], ['ascii', null]]) {
        const own = gpu.resolve(samples, cols, lines, shapeMatcher({ palette, glyphs: set, solids: 0.25, light: 1, renderStyle }), dither).cells;
        const matcher = await matcherOf(def, { palette, renderStyle });
        for (const size of [maxSize, 64]) {
          gpu.maxSize = size; // 64: 8 lines of samples a texture, 4 a band with two lines of margin each way
          expect(key(gpu.resolve(samples, cols, lines, matcher, dither).cells), `${renderStyle} ${!!palette} ${size}`).toEqual(key(own));
        }
        gpu.maxSize = maxSize;
      }
    } finally {
      gpu.maxSize = maxSize;
    }
  });

  test('a shader that writes past put() is held to the set and the palette, and switched off by the check', async () => {
    const def = solver({ ...PASS_ONE, shader: { solve: 'outFg = vec4(0.5); outBg = vec4(0.5);' } });
    const matcher = await matcherOf(def, { palette: PALETTES.cga }), samples = samplesOf(4, 3);
    const { cells } = ShapeMatcher.shared().resolve(samples, 4, 3, matcher, {});
    for (const cell of cells) {
      expect(ALL).toContain(cell.char);
      expect(PALETTES.cga).toContain(cell.fg);
      expect(PALETTES.cga).toContain(cell.bg);
    }

    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 16, rows: 24 });
    Object.assign(project, { quantize: 'cga', chars: SET });
    project.charChoice = await onSolver(def, { hash: 'writes-past' });
    await settle(project);
    expect(usePluginStore().problems['phosphor.outlines']).toMatch(t('plugins.errors.shaderOff', { name: 'Edges', message: '' }));
    const shown = key(project.cells);
    vi.spyOn(ShapeMatcher.prototype, 'resolve').mockReturnValue(null);
    project.renderer.reset();
    project.render();
    await settle(project);
    expect(shown).toEqual(key(project.cells)); // the JavaScript's
  });

  test('an empty compiler log still says the shader didn\'t build', async () => {
    vi.spyOn(WebGL2RenderingContext.prototype, 'getShaderInfoLog').mockReturnValue('');
    const def = solver({ ...PASS_ONE, shader: { solve: 'this is not glsl;' } }), gpu = ShapeMatcher.shared();
    expect(gpu.resolve(samplesOf(4, 3), 4, 3, await matcherOf(def), {})).toBe(null);
    expect(gpu.shaderProblem(REF)).toBeTruthy();
  });

  test('a set with no solid in it reads glyph 255 back as the first glyph, as the JavaScript holds it', async () => {
    const def = solver({ solve: () => ({ char: '█', fg: rgb(9, 9, 9), bg: rgb(0, 0, 0) }), shader: { solve: 'put(vec3(9.0), vec3(0.0), 255);' } });
    const glyphs = (await glyphsOf()).filter((g) => g.own), samples = samplesOf(3, 2);
    const matcher = pluginMatcher({ def, ref: REF, palette: null, glyphs, renderStyle: 'ansi' });
    const { cells } = ShapeMatcher.shared().resolve(samples, 3, 2, matcher, {});
    expect(key(cells)).toEqual(key(resolvePlugin(samples, 3, 2, matcher, {}).cells));
    expect(cells[0].char).toBe('/');
  });

  test('a shader that does not compile falls back to the JavaScript and keeps the log', async () => {
    const def = solver({ ...PASS_ONE, shader: { solve: 'this is not glsl;' } }), samples = samplesOf(4, 3), gpu = ShapeMatcher.shared();
    const matcher = await matcherOf(def);
    expect(gpu.resolve(samples, 4, 3, matcher, {})).toBe(null);
    expect(gpu.shaderProblem(REF)).toMatch(/error/i);
    unregisterScript('phosphor.outlines');
    expect(gpu.shaderProblem(REF)).toBe(null);

    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 16, rows: 24 });
    Object.assign(project, { quantize: 'cga', chars: SET });
    const ref = await onSolver(def, { hash: 'no-compile' });
    project.charChoice = ref;
    await settle(project);
    const message = usePluginStore().problems['phosphor.outlines'];
    expect(message).toContain(t('plugins.errors.shaderOff', { name: 'Edges', message: '' }));
    expect(message).toMatch(/error/i);
    expect(project.cells.some((c) => c.char === '/')).toBe(true); // the JavaScript's
  });

  test('a shader that differs from its JavaScript in a near-tie or two stays on', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 16, rows: 24 });
    Object.assign(project, { quantize: 'cga', chars: SET });
    const def = solver({
      solve: () => ({ char: '/', fg: rgb(255, 0, 0), bg: rgb(0, 0, 0) }),
      shader: { solve: 'put(vec3(255.0, 0.0, 0.0), vec3(0.0), uFirst + local() == ivec2(0) ? 5 : 4);' }, // its first cell differs
    });
    const spy = vi.spyOn(ShapeMatcher.prototype, 'resolve');
    project.charChoice = await onSolver(def, { hash: 'near-tie' });
    await settle(project);
    expect(usePluginStore().problems['phosphor.outlines']).toBeUndefined();
    expect(project.cells[0].char).toBe('\\'); // the shader's cell
    const calls = spy.mock.calls.length;
    project.brightness = 120;
    await settle(project);
    expect(spy.mock.calls.length).toBeGreaterThan(calls);
  });

  test('a shader that agrees is used, and one that disagrees with its JavaScript is switched off after the first check', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 16, rows: 24 });
    Object.assign(project, { quantize: 'cga', chars: SET });
    const spy = vi.spyOn(ShapeMatcher.prototype, 'resolve');
    const used = () => spy.mock.results.filter((r, i) => r.value && spy.mock.calls[i][3].kind === 'plugin').length;

    project.charChoice = await onSolver(solver(PASS_ONE), { hash: 'agrees' });
    await settle(project);
    expect(used()).toBeGreaterThan(0);
    expect(usePluginStore().problems['phosphor.outlines']).toBeUndefined();
    const agreed = key(project.cells);
    spy.mockReturnValue(null);
    project.renderer.reset();
    project.render();
    await settle(project);
    expect(key(project.cells)).toEqual(agreed); // the JavaScript's
    spy.mockRestore();

    usePluginStore().dropScript('phosphor.outlines');
    const wrong = vi.spyOn(ShapeMatcher.prototype, 'resolve');
    const def = solver({ solve: () => ({ char: '/', fg: rgb(255, 0, 0), bg: rgb(0, 0, 0) }), shader: { solve: 'put(vec3(255.0, 0.0, 0.0), vec3(0.0), 5);' } });
    project.charChoice = await onSolver(def, { hash: 'disagrees' });
    await settle(project);
    expect(wrong.mock.results.some((r) => r.value)).toBe(true); // it ran once, for the check
    const words = t('plugins.errors.shaderDisagrees', { count: 64, total: 64, col: 0, line: 0 });
    expect(usePluginStore().problems['phosphor.outlines']).toBe(t('plugins.errors.shaderOff', { name: 'Edges', message: words }));
    expect(project.cells.every((c) => c.char === '/')).toBe(true);
    const calls = wrong.mock.calls.length;
    project.brightness = 120; // a whole render again
    await settle(project);
    expect(wrong.mock.calls.length).toBe(calls);
    expect(project.cells.every((c) => c.char === '/')).toBe(true);
  });

  test('a shader wrong only where a cell holds an edge is switched off, though the drawing\'s corner is plain', async () => {
    const { project } = await createTestApp();
    await project.setBlankCanvas({ cols: 16, rows: 24 }); // black: no edges anywhere
    Object.assign(project, { quantize: 'cga', chars: SET });
    await settle(project);
    const def = solver({
      solve(cell, look) { // a '/' where its own samples hold an edge
        let low = 255, high = 0;
        for (let i = 0; i < 32; i++) {
          const [r, g, b] = cell.sample(0, 0, i), v = r + g + b;
          low = Math.min(low, v);
          high = Math.max(high, v);
        }
        return high - low > 150 ? { char: '/', fg: rgb(255, 255, 255), bg: rgb(0, 0, 0) } : look.byShape();
      },
      shader: { solve: 'byShape();' }, // forgets the edges
    });
    project.charChoice = await onSolver(def, { hash: 'edges-only' });
    await settle(project);
    expect(usePluginStore().problems['phosphor.outlines']).toContain(t('plugins.errors.shaderOff', { name: 'Edges', message: '' }));
  });

  test('a change of set checks the shader again: one that agrees on the first set and not on the next is switched off', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 16, rows: 24 });
    Object.assign(project, { quantize: 'cga', chars: SET });
    // Its own '\\' taken to be the last glyph: true while the set doesn't hold it.
    const def = solver({ solve: () => ({ char: '\\', fg: rgb(255, 0, 0), bg: rgb(0, 0, 0) }), shader: { solve: 'put(vec3(255.0, 0.0, 0.0), vec3(0.0), glyphCount - 1);' } });
    project.charChoice = await onSolver(def, { hash: 'set-change' });
    await settle(project);
    expect(usePluginStore().problems['phosphor.outlines']).toBeUndefined();
    expect(project.cells.every((c) => c.char === '\\')).toBe(true);

    project.chars = `${SET}\\▌`; // holds '\\' now: the last glyph is ▌
    await settle(project);
    const words = t('plugins.errors.shaderDisagrees', { count: 64, total: 64, col: 0, line: 0 });
    expect(usePluginStore().problems['phosphor.outlines']).toBe(t('plugins.errors.shaderOff', { name: 'Edges', message: words }));
    expect(project.cells.every((c) => c.char === '\\')).toBe(true); // the JavaScript's
  });

  // Last: the shared context stays lost.
  test('a context lost during a solver\'s first check is put down to its shader, and the JavaScript draws', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 16, rows: 24 });
    Object.assign(project, { quantize: 'cga', chars: SET });
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    vi.spyOn(WebGL2RenderingContext.prototype, 'drawArrays').mockImplementation(function (...args) {
      draw.apply(this, args);
      this.getExtension('WEBGL_lose_context').loseContext(); // as a watchdog does to a shader that never ends
    });
    project.charChoice = await onSolver(solver(PASS_ONE), { hash: 'lost' });
    await settle(project);
    const words = t('plugins.errors.shaderOff', { name: 'Edges', message: t('plugins.errors.shaderLost') });
    expect(usePluginStore().problems['phosphor.outlines']).toBe(words);
    expect(project.cells.some((c) => c.char === '/')).toBe(true); // the JavaScript's
  });
});
