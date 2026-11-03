// By shape and Best match on the GPU (ShapeMatcher): with no error carried from cell to cell (Dither
// at 0 or Bayer) each cell is matched in a shader, and it picks what CharResolver's JavaScript picks.
// Float rounding can tip a near-tie the other way, so they agree on at least 99% of the cells.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import ShapeMatcher from '@/lib/ShapeMatcher.js';
import { shapeMatcher, resolveShapes, bestMatcher, resolveGrid, SAMPLES } from '@/lib/CharResolver.js';
import { referenceMask, referenceInk, loadReferenceFont } from '@/lib/GlyphCoverage.js';
import { PALETTES } from '@/lib/ColorUtils.js';

afterEach(() => vi.restoreAllMocks());

const SHADES = '▄░▒▓█';
const key = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.fg.c}${c.bg.hex}${c.bg.c}`);
const agreement = (a, b) => a.filter((k, i) => k === b[i]).length / a.length;

// The cells with the GPU, then with it forced off (a whole render from nothing each time), and how
// many times the GPU resolved anything.
async function bothWays(image, settings) {
  const { project } = await createTestApp();
  await loadImage(project, `/tests/fixtures/images/${image}`, { cols: 60, rows: 60 });
  const spy = vi.spyOn(ShapeMatcher.prototype, 'resolve');
  Object.assign(project, settings);
  project.render();
  await settle(project);
  const gpu = key(project.cells), used = spy.mock.results.filter((r) => r.value).length;
  spy.mockReturnValue(null);
  project.renderer.reset();
  project.render();
  await settle(project);
  return { gpu, js: key(project.cells), used, cells: project.cells };
}

const DITHERS = [{ dither: 0 }, { dither: 70, ditherStyle: 'bayer' }];
const IMAGES = ['gradient.png', 'photo.jpg'];
const SHAPE = { ansi: { charChoice: 'shape' }, colorAscii: { charChoiceAscii: 'shape' }, ascii: { charChoiceAscii: 'shape' } };

for (const [renderStyle, quantize] of [['ansi', 'cga'], ['ansi', 'none'], ['colorAscii', 'vga'], ['ascii', 'none']]) {
  test(`the shader picks what the JavaScript picks (By shape, ${renderStyle}, ${quantize})`, async () => {
    for (const image of IMAGES) {
      for (const dithering of DITHERS) {
        const { gpu, js, used, cells } = await bothWays(image, { renderStyle, quantize, solids: 25, patternLight: 100, ...SHAPE[renderStyle], ...dithering });
        expect(used, `${image} ${dithering.dither}`).toBeGreaterThan(0);
        expect(agreement(gpu, js), `${image} ${dithering.dither}`).toBeGreaterThanOrEqual(0.99);
        if (quantize !== 'none') for (const cell of cells) expect(typeof cell.fg.c).toBe('number'); // palette entries
      }
    }
  });
}

for (const [quantize, chars] of [['cga', SHADES], ['cga', undefined], ['none', SHADES], ['vga', undefined], ['count', SHADES]]) {
  test(`the shader picks what the JavaScript picks (Best match, ${quantize}, ${chars ?? 'the default set'})`, async () => {
    for (const image of IMAGES) {
      for (const dithering of DITHERS) {
        const { gpu, js, used } = await bothWays(image, { quantize, charChoice: 'best', solids: 25, patternLight: 100, ...(chars && { chars }), ...dithering });
        expect(used, `${image} ${dithering.dither}`).toBeGreaterThan(0);
        expect(agreement(gpu, js), `${image} ${dithering.dither}`).toBeGreaterThanOrEqual(0.99);
      }
    }
  });
}

test('Floyd–Steinberg stays in JavaScript: its error goes from cell to cell', async () => {
  for (const charChoice of ['best', 'shape']) {
    const { used } = await bothWays('gradient.png', { quantize: 'cga', charChoice, dither: 100, ditherStyle: 'floyd' });
    expect(used, charChoice).toBe(0);
  }
});

// Samples made up from the cell's place, so neighbors differ and every glyph gets a chance.
function samplesOf(cols, lines, sw, sh) {
  const data = new Uint8ClampedArray(cols * sw * lines * sh * 4);
  for (let y = 0; y < lines * sh; y++) {
    for (let x = 0; x < cols * sw; x++) {
      const o = (y * cols * sw + x) * 4, v = (x * 37 + y * 11 + ((x * y) % 7) * 29) % 256;
      data.set([v, (v * 3 + y) % 256, (255 - v + x * 5) % 256, 255], o);
    }
  }
  return data;
}

test('a grid taller than a texture can be is matched in bands, and an area gives the cells a whole match gives there', async () => {
  await loadReferenceFont();
  const gl = document.createElement('canvas').getContext('webgl2');
  const lines = Math.ceil(gl.getParameter(gl.MAX_TEXTURE_SIZE) / SAMPLES.h) + 20, cols = 5;
  const glyphs = [...'▄▀▌▐░▒▓█'].map((char) => ({ char, ink: referenceInk(char), mask: referenceMask(char, SAMPLES.w, SAMPLES.h) }));
  const gpu = ShapeMatcher.shared();

  const shape = shapeMatcher({ palette: PALETTES.cga, glyphs, solids: 0.25, light: 1, renderStyle: 'ansi' });
  const samples = samplesOf(cols, lines, SAMPLES.w, SAMPLES.h);
  const whole = gpu.resolve(samples, cols, lines, shape, { strength: 0.7, style: 'bayer' }).cells;
  expect(agreement(key(whole), key(resolveShapes(samples, cols, lines, shape, { strength: 0.7, style: 'bayer' }).cells))).toBeGreaterThanOrEqual(0.99);
  const area = { x: 1, y: 2 * (lines - 30), w: 3, h: 41 }; // across the last band's start
  const cells = new Array(whole.length).fill(null);
  gpu.resolve(samples, cols, lines, shape, { strength: 0.7, style: 'bayer', area, cells });
  whole.forEach((cell, i) => {
    const col = i % cols, line = (i - col) / cols;
    const inside = col >= 1 && col < 4 && line >= lines - 30 && line < lines - 9;
    expect(cells[i] && key([cells[i]])[0], `${col}, ${line}`).toBe(inside ? key([cell])[0] : null);
  });

  const best = bestMatcher({ palette: PALETTES.vga, glyphs, solids: 0.25, light: 1 });
  const raw = samplesOf(cols, 2 * lines + 1, 1, 1); // an odd last row, left out
  const bestCells = gpu.resolve(raw, cols, lines, best, { strength: 0.7, style: 'bayer' }).cells;
  expect(agreement(key(bestCells), key(resolveGrid(raw, cols, 2 * lines + 1, best, { strength: 0.7, style: 'bayer' }).cells))).toBeGreaterThanOrEqual(0.99);
});

test('the GPU says when it can\'t match (more than 256 colors), and the JavaScript does it', async () => {
  const glyphs = [{ char: '▄', ink: [0, 1], mask: referenceMask('▄', SAMPLES.w, SAMPLES.h) }];
  const palette = Array.from({ length: 300 }, (_, i) => ({ r: i % 256, g: 0, b: 0, hex: '#000000', c: i }));
  const samples = samplesOf(2, 2, SAMPLES.w, SAMPLES.h);
  expect(ShapeMatcher.shared().resolve(samples, 2, 2, shapeMatcher({ palette, glyphs, renderStyle: 'ansi' }), {})).toBe(null);
});
