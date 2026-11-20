// Outlines, the example plugin (tests/fixtures/plugins/outlines, docs/plugins.md): its JavaScript draws - | / and \
// along a picture's edges and By shape elsewhere, Clean up tidies the lines, Box drawing swaps them, and its shaders give
// the same cells. With VITE_SPEED=1, how long it takes on a large drawing against By shape (logged, not checked).
import { test, expect, describe, afterEach, vi } from 'vitest';
import outlines from '../fixtures/plugins/outlines/outlines.js';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { onSolver } from '../support/pluginSolvers.js';
import ShapeMatcher from '@/lib/ShapeMatcher.js';
import { pluginMatcher, resolvePlugin } from '@/lib/PluginSolve.js';
import { SAMPLES, resolveShapes, shapeMatcher } from '@/lib/CharResolver.js';
import { referenceMask, loadReferenceFont } from '@/lib/GlyphCoverage.js';
import { PALETTES } from '@/lib/ColorUtils.js';
import { readSolvers } from '@/plugins/script';
import { solverRef, unregisterSolvers } from '@/plugins/solvers';
import { usePluginStore } from '@/store/PluginStore';

afterEach(() => {
  vi.restoreAllMocks();
  unregisterSolvers('jane.outlines');
});

const def = readSolvers({ default: outlines })[0];
const REF = solverRef('jane.outlines', 'outlines');
const DEFAULTS = Object.fromEntries(def.options.map((option) => [option.id, option.default]));
const SET = ' ░▒▓█▄▀';
const ASCII_LINES = '-|/\\', BOX_LINES = '─│╱╲';
const key = (cells) => cells.map((c) => c && `${c.char}|${c.fg.r},${c.fg.g},${c.fg.b}|${c.bg.r},${c.bg.g},${c.bg.b}`);

// The layer's set, then the solver's own characters, measured as the renderer measures them.
async function glyphsOf(set = SET) {
  await loadReferenceFont();
  const own = [...def.chars].filter((char) => !set.includes(char));
  return [...[...set].map((char) => ({ char, own: false })), ...own.map((char) => ({ char, own: true }))]
    .map((g) => ({ ...g, mask: referenceMask(g.char, SAMPLES.w, SAMPLES.h) }));
}
const matcherOf = async (options = {}, { palette = null, renderStyle = 'ansi', set } = {}) =>
  pluginMatcher({ def, ref: REF, palette, glyphs: await glyphsOf(set), solids: 0.25, light: 1, renderStyle, options: { ...DEFAULTS, ...options } });

// Samples (By shape's: 4 x 8 a cell, RGBA) of a gray picture, shade(x, y) at each sample's middle, in cells.
function picture(cols, lines, shade) {
  const w = cols * SAMPLES.w, data = new Uint8ClampedArray(w * lines * SAMPLES.h * 4);
  for (let y = 0; y < lines * SAMPLES.h; y++) {
    for (let x = 0; x < w; x++) {
      const v = shade((x + 0.5) / SAMPLES.w, (y + 0.5) / SAMPLES.h);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return data;
}
// A black square, columns 4 to 9 and lines 3 to 8, on white.
const square = (x, y) => (x >= 4 && x < 10 && y >= 3 && y < 9 ? 0 : 255);

// A picture file's samples at cols x lines, drawn into a canvas the size of the samples.
async function samplesOfImage(url, cols, lines) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = Object.assign(document.createElement('canvas'), { width: cols * SAMPLES.w, height: lines * SAMPLES.h });
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

test('a black square on white gets - along its top and bottom, | along its sides, By shape elsewhere', async () => {
  const cols = 14, lines = 12, samples = picture(cols, lines, square);
  const { cells } = resolvePlugin(samples, cols, lines, await matcherOf());
  const at = (col, line) => cells[line * cols + col];
  for (let col = 5; col <= 8; col++) {
    for (const line of [2, 3, 8, 9]) { // the square's top and bottom lines, and the white ones next to them
      expect(at(col, line).char, `${col}, ${line}`).toBe('-');
      expect(at(col, line).fg, `${col}, ${line}`).toMatchObject({ r: 0, g: 0, b: 0 }); // the darker side's
      expect(at(col, line).bg, `${col}, ${line}`).toMatchObject({ r: 255, g: 255, b: 255 });
    }
  }
  for (let line = 4; line <= 7; line++) {
    for (const col of [3, 4, 9, 10]) expect(at(col, line).char, `${col}, ${line}`).toBe('|');
  }
  // Two cells or more from the square's edge: By shape's cells, from the layer's set alone.
  const shape = resolveShapes(samples, cols, lines, shapeMatcher({ palette: null, glyphs: (await glyphsOf()).filter((g) => !g.own), solids: 0.25, light: 1 }));
  const shapeKeys = key(shape.cells), keys = key(cells);
  let far = 0;
  keys.forEach((k, i) => {
    const col = i % cols, line = (i - col) / cols;
    const outside = col < 2 || col > 11 || line < 1 || line > 10, inside = col >= 6 && col <= 7 && line >= 5 && line <= 6;
    if (!outside && !inside) return;
    far++;
    expect(k, `${col}, ${line}`).toBe(shapeKeys[i]);
  });
  expect(far).toBeGreaterThan(40);
});

test('a diagonal edge gets / or \\ by its direction', async () => {
  const n = 12, matcher = await matcherOf();
  const down = resolvePlugin(picture(n, n, (x, y) => (y > x ? 0 : 255)), n, n, matcher).cells; // dark below a line from the top left
  const up = resolvePlugin(picture(n, n, (x, y) => (x + y > n ? 0 : 255)), n, n, matcher).cells; // dark below one from the bottom left
  for (let c = 1; c < n - 1; c++) {
    expect(down[c * n + c].char, `${c}`).toBe('\\');
    expect(up[(n - 1 - c) * n + c].char, `${c}`).toBe('/');
  }
});

test('Clean up removes a lone stroke and straightens a run', async () => {
  // Pass 2 by itself: the cell's pass-1 characters around it (rows top to bottom, '.' a character of the set), on gray.
  const gray = [128, 128, 128];
  const refine = async (rows, options) => def.refine({
    col: 5, line: 5, sample: () => gray, char: (dx, dy) => rows[dy + 1][dx + 1].replace('.', ' '),
  }, (await matcherOf({ elsewhere: 1, ...options })).look);
  const lone = ['...', './.', '...'], run = ['...', '-/-', '...'], column = ['.|.', '.-.', '.|.'], corner = ['...', './-', '...'];

  expect(await refine(lone)).toMatchObject({ char: ' ', fg: { r: 128, g: 128, b: 128 }, bg: { r: 128, g: 128, b: 128 } }); // Elsewhere: Blank
  expect((await refine(run)).char).toBe('-');
  expect((await refine(column)).char).toBe('|');
  expect((await refine(['/..', '.\\.', '..\\'])).char).toBe('\\'); // already its run's
  expect((await refine(['..\\', '.-.', '/..'])).char).toBe('-'); // no run through it: kept
  expect((await refine(['\\..', '.-.', '..\\'])).char).toBe('\\');
  expect((await refine(corner)).char).toBe('/'); // a line beside it, no run through it: kept
  for (const rows of [lone, run, column]) expect((await refine(rows, { clean_up: false })).char).toBe(rows[1][1]);
  expect((await refine(['...', '─╱─', '...'], { lines: 1 })).char).toBe('─');
  expect((await refine(['...', '-/-', '...'], { lines: 1 })).char).toBe(' '); // the other set's lines aren't lines
});

test('Box drawing uses ─ │ ╱ ╲', async () => {
  const matcher = await matcherOf({ lines: 1 });
  const squared = resolvePlugin(picture(14, 12, square), 14, 12, matcher).cells.map((c) => c.char);
  const diagonal = resolvePlugin(picture(12, 12, (x, y) => (y > x ? 0 : 255)), 12, 12, matcher).cells.map((c) => c.char);
  const mirrored = resolvePlugin(picture(12, 12, (x, y) => (x + y > 12 ? 0 : 255)), 12, 12, matcher).cells.map((c) => c.char);
  expect(squared[2 * 14 + 6]).toBe('─');
  expect(squared[5 * 14 + 3]).toBe('│');
  expect(diagonal[5 * 12 + 5]).toBe('╲');
  expect(mirrored[6 * 12 + 5]).toBe('╱');
  for (const char of [...squared, ...diagonal, ...mirrored]) expect(ASCII_LINES).not.toContain(char);
});

describe.skipIf(!ShapeMatcher.available())('with WebGL2', () => {
  test('the shaders agree with the JavaScript on a photo-like picture', async () => {
    const cols = 24, lines = 16, gpu = ShapeMatcher.shared();
    const pictures = {
      gradient: await samplesOfImage('/tests/fixtures/images/gradient.png', cols, lines),
      photo: await samplesOfImage('/tests/fixtures/images/photo.jpg', cols, lines),
      square: picture(cols, lines, square),
    };
    let differ = 0, total = 0;
    for (const [name, samples] of Object.entries(pictures)) {
      const lined = new Set();
      for (const [renderStyle, palette] of [['ansi', PALETTES.cga], ['ansi', null], ['colorAscii', PALETTES.vga], ['ascii', null]]) {
        for (const options of [{}, { threshold: 4, lines: 1, elsewhere: 1 }, { threshold: 10, clean_up: false }, { threshold: 4, elsewhere: 1, clean_up: false }]) {
          for (const dither of [{}, { strength: 0.7, style: 'bayer' }]) {
            const matcher = await matcherOf(options, { palette, renderStyle });
            const shader = gpu.resolve(samples, cols, lines, matcher, dither), js = resolvePlugin(samples, cols, lines, matcher, dither);
            const what = `${name} ${renderStyle} ${!!palette} ${JSON.stringify(options)} ${!!dither.style}`;
            expect(shader, what).not.toBe(null);
            const a = key(shader.cells), b = key(js.cells), n = a.filter((cell, i) => cell !== b[i]).length;
            expect(n, what).toBeLessThanOrEqual(cols * lines / 16); // By shape's own near-ties, as the load check allows
            differ += n;
            total += a.length;
            for (const cell of js.cells) if ((ASCII_LINES + BOX_LINES).includes(cell.char)) lined.add(cell.char);
          }
        }
      }
      expect([...lined].length, name).toBeGreaterThanOrEqual(4); // lines were drawn, so the check isn't empty
    }
    expect(differ).toBeLessThanOrEqual(total / 100);
  });

  test('the renderer\'s own check keeps the shaders on, and they draw the drawing', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 24, rows: 32 });
    Object.assign(project, { quantize: 'cga', chars: SET });
    const spy = vi.spyOn(ShapeMatcher.prototype, 'resolve');
    project.charChoice = await onSolver(def);
    project.setLayerChars('base', { solverOptions: { [REF]: { ...DEFAULTS, threshold: 10 } } });
    await settle(project);
    expect(usePluginStore().problems['jane.outlines']).toBeUndefined();
    expect(spy.mock.results.some((r, i) => r.value && spy.mock.calls[i][3].kind === 'plugin')).toBe(true);
    expect(project.cells.some((c) => ASCII_LINES.includes(c.char))).toBe(true);
  });

  test.runIf(import.meta.env.VITE_SPEED === '1')('speed: 300 x 1000, shader and JavaScript, a whole resolve and a dab, against By shape', async () => {
    const cols = 300, lines = 1000, gpu = ShapeMatcher.shared();
    const samples = await samplesOfImage('/tests/fixtures/images/photo.jpg', cols, lines);
    const matcher = await matcherOf(), shape = shapeMatcher({ palette: null, glyphs: (await glyphsOf()).filter((g) => !g.own), solids: 0.25, light: 1 });
    const dab = { x: 150, y: 1000, w: 3, h: 6 }; // three cells by three, in grid pixels
    const time = (label, run) => {
      const start = performance.now();
      const out = run();
      console.info(`Outlines speed: ${label}: ${(performance.now() - start).toFixed(1)} ms`);
      return out;
    };
    gpu.resolve(samples.subarray(0, 4 * 4 * 8 * 4), 4, 1, matcher, {}); // the programs built first
    gpu.resolve(samples.subarray(0, 4 * 4 * 8 * 4), 4, 1, shape, {});
    const js = time('JavaScript, whole', () => resolvePlugin(samples, cols, lines, matcher));
    const shader = time('shader, whole', () => gpu.resolve(samples, cols, lines, matcher, {}));
    time('JavaScript, a dab', () => resolvePlugin(samples, cols, lines, matcher, { area: dab, cells: js.cells, first: js.first }));
    time('shader, a dab', () => gpu.resolve(samples, cols, lines, matcher, { area: dab, cells: shader.cells, first: shader.first }));
    const byShape = time('By shape (shader), whole', () => gpu.resolve(samples, cols, lines, shape, {}));
    time('By shape (shader), a dab', () => gpu.resolve(samples, cols, lines, shape, { area: dab, cells: byShape.cells }));
  }, 600_000);
});
