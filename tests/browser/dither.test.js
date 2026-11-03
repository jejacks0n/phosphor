// Dithering to the palette: the picture (with the base layer's pixels) is dithered, paint keeps its
// own color, and a stroke of paint leaves the pattern around it where it was.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { PALETTES } from '@/lib/ColorUtils.js';

async function gradient({ cols = 40, rows = 40, ...settings } = {}) {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols, rows });
  Object.assign(project, settings);
  project.render();
  await settle(project);
  return project;
}
const pairs = (project) => new Set(project.cells.map((c) => `${c.fg.hex}${c.bg.hex}`));
const outside = (project, rows) => project.cells.filter((_, i) => !rows.includes(Math.floor(i / project.cols))).map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);

test('at 0% nothing changes, whatever the style', async () => {
  for (const quantize of ['cga', 'vga', 'count', 'palette']) {
    const plain = cellsKey(await gradient({ quantize }));
    expect(cellsKey(await gradient({ quantize, dither: 0, ditherStyle: 'bayer' })), quantize).toEqual(plain);
  }
});

for (const ditherStyle of ['floyd', 'bayer']) {
  test(`${ditherStyle}: a gradient mixes the palette's colors, and every color is the palette's`, async () => {
    const plain = await gradient({ quantize: 'cga' });
    const dithered = await gradient({ quantize: 'cga', dither: 100, ditherStyle });
    expect(cellsKey(dithered)).not.toEqual(cellsKey(plain));
    expect(pairs(dithered).size).toBeGreaterThan(pairs(plain).size); // more pairs of colors side by side: no flat bands
    const cga = new Set(PALETTES.cga.map((p) => p.hex.toLowerCase()));
    for (const cell of dithered.cells) for (const hex of [cell.fg.hex, cell.bg.hex]) expect(cga.has(hex.toLowerCase()), hex).toBe(true);
  });
}

test('paint keeps its own color (the nearest), and a stroke leaves the pattern around it where it was', async () => {
  const project = await gradient({ quantize: 'cga', dither: 100, ditherStyle: 'floyd' });
  const before = outside(project, [10]);
  project.paintStroke(Array.from({ length: 30 }, (_, k) => ({ x: 5 + k, y: 20, alpha: 1 })), '#5a5a5a'); // between CGA's grays
  project.paintStroke(Array.from({ length: 30 }, (_, k) => ({ x: 5 + k, y: 21, alpha: 1 })), '#5a5a5a');
  project.commitEdit();
  await settle(project);
  const painted = project.cells.slice(10 * project.cols + 5, 10 * project.cols + 35);
  expect(new Set(painted.map((c) => `${c.fg.hex}${c.bg.hex}`)).size).toBe(1);
  expect(outside(project, [10])).toEqual(before);
});

test('a typed character sits on the dithered picture: the cell under it is the one shown', async () => {
  const project = await gradient({ quantize: 'cga', dither: 100, ditherStyle: 'floyd' });
  const params = project.processParams;
  for (let i = 0; i < project.cells.length; i += 7) {
    const col = i % project.cols, row = Math.floor(i / project.cols);
    const under = project.renderer.underCell(col, row, params, project.renderedCells);
    expect([under.fg.hex, under.bg.hex], `${col},${row}`).toEqual([project.cells[i].fg.hex, project.cells[i].bg.hex]);
  }
});
