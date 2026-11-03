// Choosing characters: Best match picks each base cell's character and colors from the picture, in
// the reference font whatever the display font, with paint, pins and frames as a still has them.
import { test, expect, vi } from 'vitest';
import ShapeMatcher from '@/lib/ShapeMatcher.js';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { setDisplayFont } from '@/lib/displayFonts';
import { layoutWide } from '@/lib/Cells';
import { PALETTES } from '@/lib/ColorUtils.js';
import { processImage } from '@/lib/ImageProcessor.js';

const SHADES = '▄░▒▓█';

async function gradient({ cols = 40, rows = 40, ...settings } = {}) {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  Object.assign(project, settings);
  project.render();
  await settle(project);
  return project;
}
const key = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}${c.wide ?? ''}`);
function fullRebuild(project) {
  const params = project.processParams;
  return layoutWide(project.renderer.composeAll(project.renderer.cellsFromOutput(params), project.editCells, params), project.cols);
}

test('Best match with Blocks & shades on CGA: only its characters, only CGA colors, and shades appear', async () => {
  const p = await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES, solids: 0 });
  const chars = new Set(p.cells.map((c) => c.char));
  expect([...chars].every((c) => SHADES.includes(c))).toBe(true);
  expect(['░', '▒', '▓'].some((c) => chars.has(c))).toBe(true);
  const cga = new Set(PALETTES.cga.map((c) => c.hex.toLowerCase()));
  for (const cell of p.cells) {
    for (const color of [cell.fg, cell.bg]) {
      expect(cga.has(color.hex.toLowerCase()), color.hex).toBe(true);
      expect(typeof color.c).toBe('number'); // a palette entry, for .ans export
    }
  }
  // What else reads the base shows only CGA's colors too: the output, and the base under the paint.
  const { data } = p.renderer.outputCanvas.getContext('2d').getImageData(0, 0, p.cols, p.rows);
  const base = p.renderer.basePixels.data;
  const hexAt = (d, o) => `#${[d[o], d[o + 1], d[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  for (let o = 0; o < data.length; o += 4) {
    expect(cga.has(hexAt(data, o))).toBe(true);
    expect(cga.has(hexAt(base, o))).toBe(true);
  }
});

test('Solids up gives more solid cells', async () => {
  const solid = (p) => p.cells.filter((c) => c.fg.hex === c.bg.hex).length;
  const few = solid(await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES, solids: 0 }));
  const many = solid(await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES, solids: 100 }));
  expect(many).toBeGreaterThan(few);
});

test('Dither under Best match changes the cells, and Floyd–Steinberg differs from Bayer', async () => {
  const at = async (dither) => cellsKey(await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES, solids: 0, ...dither }));
  const plain = await at({ dither: 0 });
  const floyd = await at({ dither: 100, ditherStyle: 'floyd' });
  const bayer = await at({ dither: 100, ditherStyle: 'bayer' });
  expect(floyd).not.toEqual(plain);
  expect(bayer).not.toEqual(plain);
  expect(floyd).not.toEqual(bayer);
});

for (const charChoice of ['best', 'shape']) test(`Full color has no palette to dither to: a Dither left from CGA changes nothing, and the GPU matches (${charChoice})`, async () => {
  const spy = vi.spyOn(ShapeMatcher.prototype, 'resolve');
  try {
    for (const ditherStyle of ['floyd', 'bayer']) {
      const plain = cellsKey(await gradient({ quantize: 'none', charChoice, chars: SHADES, dither: 0 }));
      spy.mockClear();
      const p = await gradient({ quantize: 'cga', charChoice, chars: SHADES, dither: 60, ditherStyle });
      p.quantize = 'none'; // the Dither slider hides, its value stays
      await settle(p);
      expect(cellsKey(p), ditherStyle).toEqual(plain);
      expect(spy.mock.results.at(-1).value, ditherStyle).toBeTruthy(); // the last resolve was the GPU's
    }
  } finally {
    spy.mockRestore();
  }
});

test('the display font doesn\'t change the characters', async () => {
  const p = await gradient({ quantize: 'vga', charChoice: 'best', chars: '.*:%#@░▒▓▄█' });
  const before = cellsKey(p);
  await setDisplayFont('unifont');
  p.render();
  await settle(p);
  expect(cellsKey(p)).toEqual(before);
  await setDisplayFont('jetbrains');
});

test('paint keeps each cell\'s character, and only colors it', async () => {
  const p = await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES, solids: 0 });
  const row = (q) => q.cells.slice(10 * q.cols, 11 * q.cols);
  const before = row(p);
  p.paintStroke(Array.from({ length: 40 }, (_, k) => ({ x: k, y: 20, alpha: 1 })), '#ff5555');
  p.commitEdit();
  await settle(p);
  const after = row(p);
  // A shade keeps its character; a solid one (no texture to show paint through) becomes ▄, as docs/layers.md says.
  const solid = (c) => c === '█' || c === '▄';
  after.forEach((cell, i) => expect(cell.char).toBe(solid(before[i].char) ? '▄' : before[i].char));
  expect(after.map((c) => c.bg.hex.toLowerCase())).toEqual(after.map(() => '#ff5555'));
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
});

test('pins keep their characters under Best match', async () => {
  const p = await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES, solids: 0 });
  p.beginEdit();
  p.eraseBase([{ col: 5, row: 5 }, { col: 20, row: 12 }]);
  p.commitEdit();
  await settle(p);
  for (const [col, row] of [[5, 5], [20, 12]]) expect(p.cells[row * p.cols + col].char).toBe(' ');
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
});

test('a pinned character shows its own two halves, as with Random', async () => {
  // No ▄ in the set: a merged-down ▄ still shows red over blue, not the colors of a shade Best match would pick there.
  const p = await gradient({ quantize: 'cga', charChoice: 'best', chars: '░▒▓█', solids: 100 });
  p.typeAt(8, 8, '▄', { fg: '#0000aa', bg: '#aa0000' });
  p.commitEdit();
  p.mergeDown();
  await settle(p);
  const cell = p.cells[8 * p.cols + 8];
  expect([cell.char, cell.bg.hex.toLowerCase(), cell.fg.hex.toLowerCase()]).toEqual(['▄', '#aa0000', '#0000aa']);
  p.paintStroke([{ x: 8, y: 16, alpha: 1 }], '#55ff55'); // paint over it, then a partial rebuild
  p.commitEdit();
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
});

test('a set with no one-column characters still renders', async () => {
  const p = await gradient({ quantize: 'cga', charChoice: 'best', chars: '漢' });
  expect(p.cells.length).toBe(40 * 20);
  expect(p.cells.every((c) => c.char === '▄' || c.char === '█')).toBe(true);
});

for (const charChoice of ['best', 'shape']) test(`an odd number of pixel rows renders, and equals a full rebuild (${charChoice})`, async () => {
  const p = await gradient({ rows: 31, quantize: 'cga', charChoice, chars: SHADES, dither: 100, ditherStyle: 'floyd' });
  expect(p.cells.length).toBe(40 * 15);
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
});

test('an animation frame is built as the still is (Best match and By shape)', async () => {
  const color = ({ hex, c }) => ({ hex, c });
  const values = (cells) => cells.map(({ char, wide, fg, bg }) => ({ char, wide, fg: color(fg), bg: color(bg) }));
  for (const dither of [{ dither: 0, charChoice: 'best' }, { dither: 100, ditherStyle: 'floyd', charChoice: 'best' }, { dither: 0, charChoice: 'shape' }, { dither: 100, ditherStyle: 'floyd', charChoice: 'shape' }]) {
    const p = await gradient({ cols: 24, rows: 24, quantize: 'cga', chars: SHADES, solids: 0, ...dither });
    p.beginEdit();
    p.eraseBase([{ col: 2, row: 9 }]);
    p.commitEdit();
    p.typeAt(1, 1, 'A', { fg: '#ffee00', bg: '#0044aa' });
    p.commitEdit();
    p.paintStroke([{ x: 3, y: 2, alpha: 1 }, { x: 5, y: 3, alpha: 0.5 }], '#ff3300');
    p.commitEdit();
    p.addFrame('duplicate');
    p.paintStroke([{ x: 9, y: 9, alpha: 1 }], '#00ff00');
    p.commitEdit();
    await settle(p);
    for (let i = 0; i < p.frames.length; i++) {
      p.showFrame(i);
      expect(values((await p.builtFrame(i)).cells)).toEqual(values(p.cells));
    }
  }
});

for (const charChoice of ['best', 'shape']) test(`between a grid resize and its render, the old grid's cells are never used (${charChoice})`, async () => {
  const p = await gradient({ quantize: 'cga', charChoice, chars: SHADES });
  p.cols = 30; // the render this queues hasn't run yet
  expect(p.renderer.underCell(3, 3, p.processParams, p.renderedCells)).toBe(null);
  await settle(p);
  expect(p.cells.length).toBe(30 * 20);
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
});

test('the base under the paint stays snapped through partial edits, as a full render snaps it', async () => {
  const p = await gradient({ quantize: 'vga', charChoice: 'best', chars: SHADES });
  void p.renderer.basePixels; // snapped once, then kept up over each edit's area
  p.beginEdit();
  p.eraseBase([{ col: 5, row: 5 }]);
  p.commitEdit();
  p.moveSelection({ c0: 2, r0: 2, c1: 8, r1: 5 }, { base: true, edit: true }, 4, 6);
  const partial = Array.from(p.renderer.basePixels.data);
  p.renderer.reset();
  p.render();
  await settle(p);
  expect(Array.from(p.renderer.basePixels.data)).toEqual(partial);
});

for (const dithering of [{ dither: 0 }, { dither: 100, ditherStyle: 'floyd' }]) {
  test(`an edit just as Best match comes on rebuilds every cell (dither ${dithering.dither})`, async () => {
    const p = await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES, ...dithering }); // the reference font has loaded
    p.charChoice = 'random';
    await settle(p);
    p.charChoice = 'best'; // its render hasn't run yet: the edit's composite resolves the grid first
    p.beginEdit();
    p.eraseBase([{ col: 6, row: 6 }]);
    p.commitEdit();
    expect(key(p.cells)).toEqual(key(fullRebuild(p)));
  });
}

// By shape: each cell sampled 4 x 8 from the picture before it's shrunk to the grid, in every style.
const SHAPE_STYLES = [['ansi', { charChoice: 'shape' }, { charChoice: 'random' }], ['colorAscii', { charChoiceAscii: 'shape' }, { charChoiceAscii: 'weight' }], ['ascii', { charChoiceAscii: 'shape' }, { charChoiceAscii: 'weight' }]];
for (const [renderStyle, shape, other] of SHAPE_STYLES) {
  test(`By shape in ${renderStyle}: only the set's characters and CGA's colors, not the other way's, whatever the display font`, async () => {
    const p = await gradient({ renderStyle, quantize: 'cga', ...shape });
    const set = p.processParams.chars, cga = new Set(PALETTES.cga.map((c) => c.hex.toLowerCase()));
    for (const cell of p.cells) {
      expect(set.includes(cell.char), cell.char).toBe(true);
      for (const color of [cell.fg, cell.bg]) expect(cga.has(color.hex.toLowerCase()), color.hex).toBe(true);
    }
    const before = cellsKey(p);
    try {
      await setDisplayFont('unifont');
      p.render();
      await settle(p);
      expect(cellsKey(p)).toEqual(before);
    } finally {
      await setDisplayFont('jetbrains');
    }
    Object.assign(p, other);
    await settle(p);
    expect(cellsKey(p)).not.toEqual(before);
  });
}

// A picture of stripes half a grid pixel wide (8 image pixels a grid pixel: the picture is
// processed at 8 a grid pixel), white then black.
async function stripes(project, cols = 10, rows = 10) {
  const canvas = Object.assign(document.createElement('canvas'), { width: cols * 8, height: rows * 8 });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  for (let x = 0; x < canvas.width; x += 8) ctx.fillRect(x, 0, 4, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  await loadImage(project, URL.createObjectURL(blob), { cols, rows });
}

test('By shape sees inside a cell: stripes half a cell wide are ▌, where Best match sees only one gray', async () => {
  const { project: p } = await createTestApp();
  await stripes(p);
  Object.assign(p, { quantize: 'cga', charChoice: 'shape', chars: '▄▀▌▐█', solids: 0 });
  await settle(p);
  expect(new Set(p.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`.toLowerCase()))).toEqual(new Set(['▌#ffffff#000000']));
  const shape = cellsKey(p);
  p.charChoice = 'best'; // each half one gray: in linear light, ▌ of white and black is lighter than it
  await settle(p);
  expect(cellsKey(p)).not.toEqual(shape);
});

test('By shape samples the base layer\'s own pixels, not their average in the grid', async () => {
  const { project: p } = await createTestApp();
  await stripes(p, 40, 40); // large enough that undoing a few tiles of the base is a partial update, not a render
  Object.assign(p, { quantize: 'cga', charChoice: 'shape', chars: '▄▀▌▐█', solids: 0 });
  await settle(p);
  const at = (col, row) => `${p.cells[row * p.cols + col].char}${p.cells[row * p.cols + col].fg.hex}${p.cells[row * p.cols + col].bg.hex}`.toLowerCase();
  const black = (col, row) => {
    p.beginEdit();
    p.eraseBasePixels([{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }, { x: col + 1, y: 2 * row }, { x: col + 1, y: 2 * row + 1 }]); // no pins
    p.commitEdit();
  };
  black(30, 15); // so the base keeps pixels of its own through the undos below
  black(0, 3);
  expect(at(0, 3)).toBe('█#000000#000000');
  p.moveSelection({ c0: 0, r0: 0, c1: 1, r1: 0 }, { base: true, edit: true }, 0, 3); // the stripes' pixels, over the black
  expect([at(0, 3), at(1, 3)]).toEqual(['▌#ffffff#000000', '▌#ffffff#000000']);
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
  const partial = key(p.cells);
  p.undo(); // the move: the black is back over the stripes, and the cells it left are the picture's again
  await settle(p);
  expect([at(0, 0), at(0, 3)]).toEqual(['▌#ffffff#000000', '█#000000#000000']);
  p.undo(); // the black: the picture's stripes again, the base's pixels gone from over them (only there)
  expect(p._renderQueued).toBe(false);
  expect(at(0, 3)).toBe('▌#ffffff#000000');
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
  p.redo();
  p.redo();
  await settle(p);
  expect(key(p.cells)).toEqual(partial);
  p.renderer.reset();
  p.render();
  await settle(p);
  expect(key(p.cells)).toEqual(partial);
});

test('processImage makes By shape\'s samples only under By shape: 4 a grid pixel each way', async () => {
  const p = await gradient({ quantize: 'cga' });
  expect((await processImage(p.image, p.processParams)).samples).toBe(null);
  p.charChoice = 'shape';
  const { samples } = await processImage(p.image, p.processParams);
  expect([samples.width, samples.height]).toEqual([40 * 4, 40 * 4]);
});

test('By shape on a grid whose samples are taller than a canvas can be (rows x 4 over 32,767)', async () => {
  const { project: p } = await createTestApp();
  await loadImage(p, '/tests/fixtures/images/gradient.png', { cols: 4, rows: 8200 });
  // Chromium draws a canvas that tall; Firefox and Safari don't (32,767 at most a side): no canvas may be.
  const height = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  Object.defineProperty(HTMLCanvasElement.prototype, 'height', { ...height, set(v) {
    if (v > 32767) throw new RangeError(`a canvas ${v} tall`);
    height.set.call(this, v);
  } });
  let samples;
  try {
    Object.assign(p, { quantize: 'cga', charChoice: 'shape', chars: SHADES });
    await settle(p);
    ({ samples } = await processImage(p.image, p.processParams));
  } finally {
    Object.defineProperty(HTMLCanvasElement.prototype, 'height', height);
  }
  expect([samples.width, samples.height]).toEqual([16, 32800]);
  const { dy, dh } = p.fit; // the picture's rows, in the middle of the grid: sampled, not black
  let lit = 0;
  for (let y = dy * 4; y < (dy + dh) * 4; y++) for (let x = 0; x < 16; x++) lit += samples.data[(y * 16 + x) * 4] + samples.data[(y * 16 + x) * 4 + 2];
  expect(lit).toBeGreaterThan(0);
  const lines = p.cells.slice(Math.ceil(dy / 2) * 4, Math.floor((dy + dh) / 2) * 4);
  expect(lines.some((c) => c.fg.hex.toLowerCase() !== '#000000' || c.bg.hex.toLowerCase() !== '#000000')).toBe(true);
});
