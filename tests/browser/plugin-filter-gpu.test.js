// A plugin's filters in the picture's pipeline (WebGLProcessor, docs/plugins.md): their passes run after Blur, Simplify
// and Edges and before the color sliders and Sharpen, each its own program reading the pass before; an identity filter
// changes no byte; a pass that doesn't build is skipped and said; the base's own pixels (adjustedPixels) never get one;
// and a filter's first render of a visit runs under the hang mark.
import { test, expect, vi, afterEach, beforeEach } from 'vitest';
import WebGLProcessor from '@/lib/WebGLProcessor.js';
import { adjustedPixels, processImage, processedImage } from '@/lib/ImageProcessor.js';
import { ctx2d } from '@/lib/Canvas.js';
import { PALETTES } from '@/lib/ColorUtils.js';
import { settingDefaults } from '@/store/settings.js';
import { solverRef, registerScript, unregisterScript, onFilterFailure } from '@/plugins/solvers.js';
import { HANG_KEY } from '@/plugins/hangMark';
import { ownHangMark } from '../support/ownHangMark.js';

const W = 16;
const gpu = new WebGLProcessor();
let unlisten = [];
// A filter failure listener, unsubscribed after the test.
const listen = (listener) => unlisten.push(onFilterFailure(listener));

beforeEach(() => ownHangMark('plugin-filter-gpu'));
afterEach(() => {
  for (const off of unlisten) off();
  unlisten = [];
  vi.restoreAllMocks();
  unregisterScript('jane.fx');
  localStorage.removeItem(HANG_KEY);
});

// 16 x 16: ramps across and down, a third channel that jumps about, and a bright square, so Edges and Simplify have
// edges to find.
function picture() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: W });
  const ctx = ctx2d(canvas), image = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const square = x >= 4 && x < 10 && y >= 5 && y < 11;
      image.data.set(square ? [250, 240, 200, 255] : [x * 16, y * 15, ((x * y) % 7) * 36, 255], (y * W + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const pixelsOf = (canvas) => {
  const copy = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
  const ctx = ctx2d(copy);
  ctx.drawImage(canvas, 0, 0);
  return [...ctx.getImageData(0, 0, canvas.width, canvas.height).data];
};
// The processor's output for params, as bytes, processed at size x size (the picture's own 16, or resampled).
const run = (image, params, options, size = W) => {
  gpu.process(image, params, size, size, options);
  return pixelsOf(gpu.canvas);
};
const filter = (id, passes, { options = [], values = {}, hash = 'h1', helpers = null } = {}) =>
  ({ ref: solverRef('jane.fx', id), pluginId: 'jane.fx', hash, helpers, passes, options, values });
const IDENTITY = 'return pixel(vec2(0.0));';
// Everything on, for a filter that never runs: one that doesn't build leaves the passes exactly as with none.
const RICH = { brightness: 120, sharpen: 40, edges: 30, flatten: 4, passes: 2, palette: PALETTES.cga };
const within = (a, b, most) => a.map((v, i) => Math.abs(v - b[i])).filter((d) => d > most);

// An identity filter against none. Byte for byte only where that holds by construction: with Simplify and Edges on, the
// pass without a filter sharpens its center (after the effects) against neighbors from before them, while the pass
// after a filter reads both after; so Sharpen with Simplify or Edges isn't the same, and isn't asked to be. And only
// where the picture isn't resampled: reduced by under twice (which the texture's bilinear sampling does; more is
// averaged down by a whole factor first, and an enlargement made pixel for pixel), the pass without a filter reads the
// picture's smoothed colors between 8-bit steps, which the filter's pass reads rounded to 8 bits. A palette snap
// doesn't make that exact either: the 8-bit texture's rounding differs from round8 at ties,
// and that can flip a palette pick, so under a snap there's no useful bound.
test('an identity filter changes no byte with Simplify and Edges off: no adjustment or snap is doubled', () => {
  // At the picture's own size, with no effects, the last main pass copies its 8-bit input (every read at a pixel's
  // center) and the identity filter copies that, so the pass after it reads the very colors the pass without a filter
  // reads: brightness and Sharpen once, and the snap (CGA, when the last pass snaps) once, after them. A doubled one, or a
  // snap before the adjustments, would change bytes.
  const image = picture();
  for (const palette of [PALETTES.cga, null]) {
    for (const snapLastPass of [true, false]) {
      const params = { brightness: 120, invert: 30, sharpen: 40, palette };
      const none = run(image, { ...params, pluginFilters: [] }, { snapLastPass });
      expect(run(image, { ...params, pluginFilters: [filter('same', [IDENTITY])] }, { snapLastPass })).toEqual(none);
    }
  }
});

test('resampled, an identity filter is within three of none without a snap', () => {
  const image = picture(), params = { brightness: 120, sharpen: 40 }, SIZE = 24; // 16 x 16 processed at 24 x 24
  // The filter's pass rounds the center and four neighbors that went in unrounded: each off by half a step
  // at most, times brightness 1.2, the center then times 1 + 4 x 0.4 and the neighbors' sum times 0.4, is
  // 0.6 x (2.6 + 1.6) = 2.52 steps, and two outputs that close round at most three apart.
  const none = run(image, { ...params, pluginFilters: [] }, {}, SIZE);
  expect(within(run(image, { ...params, pluginFilters: [filter('same', [IDENTITY])] }, {}, SIZE), none, 3)).toEqual([]);
});

test('an identity filter with Simplify and Edges on and Sharpen off is within one of none', () => {
  // The effects' colors are rounded to 8 bits before the filter, and without a snap they'd have gone into the adjustments
  // unrounded: half a step, times brightness 1.2, is under one step, so a byte is off by one at most.
  const image = picture(), params = { brightness: 120, edges: 30, flatten: 4, passes: 2 };
  const none = run(image, { ...params, pluginFilters: [] });
  expect(within(run(image, { ...params, pluginFilters: [filter('same', [IDENTITY])] }), none, 1)).toEqual([]);
});

test('filters run before the color sliders: red inverted is cyan', () => {
  const out = run(picture(), { invert: 100, pluginFilters: [filter('red', ['return vec3(1.0, 0.0, 0.0);'])] });
  for (let i = 0; i < out.length; i += 4) expect(out.slice(i, i + 4)).toEqual([0, 255, 255, 255]);
});

test('a filter\'s passes chain, each reading the one before', () => {
  const image = picture(), none = run(image, { pluginFilters: [] });
  const out = run(image, { pluginFilters: [filter('halves', ['return pixel(vec2(0.0)) * 0.5;', 'return pixel(vec2(0.0)) * 2.0;'])] });
  expect(within(out, none, 1)).toEqual([]);
  expect(out).not.toEqual(run(image, { pluginFilters: [filter('half', ['return pixel(vec2(0.0)) * 0.5;'])] }));
});

test('a filter\'s helpers are in each of its passes: a function and a constant both passes use', () => {
  registerScript('jane.fx', 'h1', { filters: [{ id: 'helped' }, { id: 'broken' }] });
  const heard = [];
  listen((ref, why) => heard.push(why.log ?? why));
  const helpers = 'const float HALF = 0.5;\nvec3 scaled(float by) { return pixel(vec2(0.0)) * by; }';
  const image = picture(), none = run(image, { pluginFilters: [] });
  const out = run(image, { pluginFilters: [filter('helped', ['return scaled(HALF);', 'return scaled(1.0 / HALF);'], { helpers })] });
  expect(heard).toEqual([]); // both passes built
  expect(within(out, none, 1)).toEqual([]);
  // A mistake in the helpers is told by its own line: source 1, line 2.
  run(image, { pluginFilters: [filter('broken', [IDENTITY], { helpers: 'const float A = 1.0;\nfloat b = nope;' })] });
  expect(heard).toHaveLength(1);
  expect(heard[0]).toMatch(/\b1:2\b/);
});

test('options reach the shader as opt_ uniforms: a slider, a checkbox, a choice and a color', () => {
  const options = [
    { id: 'amount', kind: 'slider', name: 'Amount', min: 0, max: 1, step: 0.1, default: 0 },
    { id: 'on', kind: 'checkbox', name: 'On', default: false },
    { id: 'pick', kind: 'choice', name: 'Pick', choices: ['a', 'b', 'c', 'd'], default: 0 },
    { id: 'tint_color', kind: 'color', name: 'Tint', default: '#000000' },
  ];
  const pass = 'if (opt_on) return opt_tint_color * opt_amount; return vec3(float(opt_pick) * 0.25);';
  const at = (values) => run(picture(), { pluginFilters: [filter('opts', [pass], { options, values })] }).slice(0, 4);
  expect(within(at({ amount: 0.5, on: true, pick: 2, tint_color: '#ff8000' }), [128, 64, 0, 255], 1)).toEqual([]);
  expect(within(at({ amount: 0.5, on: false, pick: 2, tint_color: '#ff8000' }), [128, 128, 128, 255], 1)).toEqual([]);
});

// A pass is GLSL ES 3.00, as a solver's shader is: a loop may run as far as an option says (GLSL ES 1.00 wants a
// constant there, so a blur by its radius didn't build), and there are whole numbers to work with.
test('a pass is GLSL ES 3.00: a loop runs to an option\'s value, and integers work', () => {
  registerScript('jane.fx', 'h1', { filters: [{ id: 'blur' }, { id: 'check' }] }); // a failure is heard of a registered filter
  const heard = [];
  listen((ref, why) => heard.push(why.log ?? why));
  const options = [{ id: 'radius', kind: 'slider', name: 'Radius', min: 0, max: 8, step: 1, default: 0 }];
  const blur = `int r = int(opt_radius);
    vec3 sum = vec3(0.0);
    for (int x = -r; x <= r; x++) sum += pixel(vec2(float(x), 0.0));
    return sum / float(2 * r + 1);`;
  const image = picture(), none = run(image, { pluginFilters: [] });
  const out = run(image, { pluginFilters: [filter('blur', [blur], { options, values: { radius: 2 } })] });
  expect(heard).toEqual([]); // it built
  // A pixel is the mean of the five across it in its row (the edge's past the border), to a rounding.
  const row = 2, mean = (x, c) => [-2, -1, 0, 1, 2].reduce((sum, d) => sum + none[(row * W + Math.min(W - 1, Math.max(0, x + d))) * 4 + c], 0) / 5;
  for (const x of [0, 1, 7, 15]) for (const c of [0, 1, 2]) expect(Math.abs(out[(row * W + x) * 4 + c] - mean(x, c)), `${x},${c}`).toBeLessThanOrEqual(1);
  // An integer remainder and a bit test, which GLSL ES 1.00 has neither of: a checkerboard by the pixel's place.
  const check = 'ivec2 at = ivec2(uv * uResolution); return ((at.x + at.y) % 2 == 0) == ((at.x & 1) == (at.y & 1)) ? vec3(1.0) : vec3(0.0);';
  const white = run(image, { pluginFilters: [filter('check', [check])] });
  expect(heard).toEqual([]);
  for (let i = 0; i < white.length; i += 4) expect(white.slice(i, i + 3)).toEqual([255, 255, 255]);
});

// A browser with no WebGL 2: the picture and its own effects work as they did in WebGL 1, and a plugin filter, which
// is GLSL ES 3.00, doesn't build there and says so.
test('with only WebGL 1 the picture is processed as ever, and a plugin filter is skipped and said', () => {
  const real = HTMLCanvasElement.prototype.getContext;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (kind, ...rest) {
    return kind === 'webgl2' ? null : real.call(this, kind, ...rest);
  });
  const old = new WebGLProcessor();
  vi.restoreAllMocks();
  expect(old.gl instanceof WebGLRenderingContext).toBe(true);
  registerScript('jane.fx', 'h1', { filters: [{ id: 'same' }] });
  const heard = [];
  listen((ref, why) => heard.push([ref, typeof why.log]));
  const image = picture(), params = { ...RICH, pluginFilters: [] };
  const on = (processor, more) => { processor.process(image, { ...params, ...more }, W, W); return pixelsOf(processor.canvas); };
  const none = on(old);
  expect(none).toEqual(on(gpu)); // WebGL 1 and WebGL 2 make the same picture, effects, sliders, Sharpen and palette on
  expect(on(old, { pluginFilters: [filter('same', [IDENTITY])] })).toEqual(none);
  expect(heard).toEqual([[solverRef('jane.fx', 'same'), 'string']]); // its compiler's log, as any pass that doesn't build
});

test('a pass that doesn\'t build is skipped and said once, until a new script', () => {
  const ref = solverRef('jane.fx', 'broken');
  registerScript('jane.fx', 'h1', { filters: [{ id: 'broken' }] });
  const heard = [];
  listen((...args) => heard.push(args));
  const image = picture(), none = run(image, { ...RICH, pluginFilters: [] });
  const broken = (hash) => filter('broken', ['return pixel(vec2(0.0)) * 0.5;', 'return vec3(1.0) +;'], { hash });
  expect(run(image, { ...RICH, pluginFilters: [broken('h1')] })).toEqual(none);
  expect(heard).toHaveLength(1);
  expect(heard[0][0]).toBe(ref);
  expect(typeof heard[0][1].log).toBe('string');
  expect(run(image, { ...RICH, pluginFilters: [broken('h1')] })).toEqual(none); // still skipped, not said again
  expect(heard).toHaveLength(1);
  registerScript('jane.fx', 'h2', { filters: [{ id: 'broken' }] });
  run(image, { ...RICH, pluginFilters: [broken('h2')] }); // a new script is built again
  expect(heard).toHaveLength(2);
});

test('a lost context is said for each filter in the call', () => {
  registerScript('jane.fx', 'h1', { filters: [{ id: 'a' }, { id: 'b' }] });
  const heard = [];
  listen((ref, why) => heard.push([ref, why]));
  const lost = new WebGLProcessor();
  lost.gl.getExtension('WEBGL_lose_context').loseContext();
  lost.process(picture(), { pluginFilters: [filter('a', [IDENTITY]), filter('b', [IDENTITY])] }, W, W);
  expect(heard).toEqual([[solverRef('jane.fx', 'a'), { lost: true }], [solverRef('jane.fx', 'b'), { lost: true }]]);
});

test('a lost context is said after the call\'s scratch is freed: a listener that throws leaks nothing', () => {
  registerScript('jane.fx', 'h1', { filters: [{ id: 'a' }] });
  listen(() => { throw new Error('a listener that throws'); });
  const lost = new WebGLProcessor();
  const freed = vi.spyOn(lost.gl, 'deleteFramebuffer'), textures = vi.spyOn(lost.gl, 'deleteTexture');
  lost.gl.getExtension('WEBGL_lose_context').loseContext();
  expect(() => lost.process(picture(), { pluginFilters: [filter('a', [IDENTITY])] }, W, W)).toThrow('a listener that throws');
  expect(freed).toHaveBeenCalledTimes(1);
  expect(textures).toHaveBeenCalledTimes(2); // the two scratch textures
});

test('the base\'s own pixels (adjustedPixels) never get a filter', () => {
  const params = { ...settingDefaults(), invert: 30 };
  expect([...adjustedPixels(picture(), { ...params, pluginFilters: [filter('red', ['return vec3(1.0, 0.0, 0.0);'])] })])
    .toEqual([...adjustedPixels(picture(), params)]);
});

test('programs this call didn\'t use are deleted', () => {
  const image = picture();
  run(image, { pluginFilters: [filter('same', [IDENTITY]), filter('halves', ['return pixel(vec2(0.0));', IDENTITY])] });
  expect(gpu.filterPrograms.size).toBe(3);
  run(image, { pluginFilters: [filter('same', [IDENTITY])] });
  expect([...gpu.filterPrograms.keys()]).toEqual([`h1|${solverRef('jane.fx', 'same')}|0`]);
  run(image, { pluginFilters: [] });
  expect(gpu.filterPrograms.size).toBe(0);
});

test('a filter\'s first render of a visit runs under the hang mark, through processImage and processedImage', async () => {
  const marks = [], real = WebGLProcessor.prototype.process;
  vi.spyOn(WebGLProcessor.prototype, 'process').mockImplementation(function (...args) {
    marks.push(localStorage.getItem(HANG_KEY));
    return real.apply(this, args);
  });
  const params = (id) => ({ ...settingDefaults(), cols: W, rows: W, pluginFilters: [filter(id, [IDENTITY])] });
  await processImage(picture(), params('marked'));
  await processImage(picture(), params('marked'));
  await processedImage(picture(), params('marked-bake'));
  await processedImage(picture(), params('marked-bake'));
  expect(marks.map((mark) => mark && JSON.parse(mark).pluginId)).toEqual(['jane.fx', null, 'jane.fx', null]);
  expect(localStorage.getItem(HANG_KEY)).toBe(null);
});
