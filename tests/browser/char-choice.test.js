// Choosing characters: Best match picks each base cell's character and colors from the picture, in
// the reference font whatever the display font, with paint, pins and frames as a still has them.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { setDisplayFont } from '@/lib/displayFonts';
import { layoutWide } from '@/lib/Cells';
import { PALETTES } from '@/lib/ColorUtils.js';

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

test('an odd number of pixel rows renders, and equals a full rebuild', async () => {
  const p = await gradient({ rows: 31, quantize: 'cga', charChoice: 'best', chars: SHADES, dither: 100, ditherStyle: 'floyd' });
  expect(p.cells.length).toBe(40 * 15);
  expect(key(p.cells)).toEqual(key(fullRebuild(p)));
});

test('an animation frame is built as the still is', async () => {
  const color = ({ hex, c }) => ({ hex, c });
  const values = (cells) => cells.map(({ char, wide, fg, bg }) => ({ char, wide, fg: color(fg), bg: color(bg) }));
  for (const dither of [{ dither: 0 }, { dither: 100, ditherStyle: 'floyd' }]) {
    const p = await gradient({ cols: 24, rows: 24, quantize: 'cga', charChoice: 'best', chars: SHADES, solids: 0, ...dither });
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

test('between a grid resize and its render, the old grid\'s cells are never used', async () => {
  const p = await gradient({ quantize: 'cga', charChoice: 'best', chars: SHADES });
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
