// A Color count palette covers the whole movie, so colors don't shift between frames. Worked out, not saved.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';

const hexes = (project) => project.activePalette.map((p) => p.hex.toLowerCase());
const stroke = (project, pixels, hex) => { project.paintStroke(pixels.map(([x, y]) => ({ x, y, alpha: 1 })), hex); project.commitEdit(); };
const line = (y) => Array.from({ length: 8 }, (_, k) => [4 + k, y]);

async function counted(frames = 1, url = '/tests/fixtures/images/tiny.gif') {
  const { project } = await createTestApp();
  await loadImage(project, url, { cols: 20, rows: 20 });
  project.quantize = 'count';
  project.colorCount = 8;
  project.render();
  await settle(project);
  for (let i = 1; i < frames; i++) project.addFrame('blank');
  await project.pickPalette();
  return project;
}

test('with Color count, a color painted only on frame 5 is in the palette on frame 1', async () => {
  const project = await counted(6);
  project.showFrame(5);
  stroke(project, line(6), '#ff00aa');
  project.showFrame(0);
  await project.pickPalette();
  expect(project.frame).toBe(0);
  expect(hexes(project)).toContain('#ff00aa');
});

test('a blank canvas does not end up with an all-black palette', async () => {
  const { project } = await createTestApp();
  project.cols = 20;
  project.rows = 20;
  await project.setBlankCanvas();
  await settle(project);
  project.quantize = 'count';
  project.colorCount = 8;
  project.render();
  await settle(project);
  project.addFrame('blank');
  await project.pickPalette();
  stroke(project, line(6), '#00ff00');
  await project.pickPalette();
  expect(hexes(project)).toContain('#00ff00');
  project.showFrame(0);
  await project.pickPalette();
  expect(hexes(project)).toContain('#00ff00');
});

test('a re-pick happens when a stroke ends, not during it, and stales all frames', async () => {
  const project = await counted(3);
  const first = await project.builtFrame(0);
  project.showFrame(2);
  const before = hexes(project);
  project.paintStroke(line(6).map(([x, y]) => ({ x, y, alpha: 1 })), '#ff00aa'); // left open
  await project.pickPalette();
  expect(hexes(project)).toEqual(before);
  project.commitEdit();
  await project.pickPalette();
  expect(hexes(project)).toContain('#ff00aa');
  expect(await project.builtFrame(0)).not.toBe(first);
});

test('a re-pick comes by itself after a stroke, a frame change to the list, and an undo', async () => {
  const project = await counted(2);
  stroke(project, line(6), '#ff00aa');
  await project._palettePick;
  expect(hexes(project)).toContain('#ff00aa');
  project.undo();
  await project._palettePick;
  expect(hexes(project)).not.toContain('#ff00aa');
});

test('colors match between editing a frame and its built cells', async () => {
  const project = await counted(3, '/tests/fixtures/images/gradient.png');
  stroke(project, line(6), '#ff00aa');
  project.showFrame(1);
  stroke(project, line(10), '#00ffaa');
  project.showFrame(2);
  project.clearEditCells([]);
  await project.pickPalette();
  const palette = hexes(project);
  for (let i = 0; i < 3; i++) {
    project.showFrame(i);
    expect(hexes(project)).toEqual(palette);
    const built = await project.builtFrame(i);
    expect(built.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`)).toEqual(cellsKey(project));
    for (const cell of project.cells) expect(palette).toContain(cell.bg.hex.toLowerCase());
  }
});

test('moving between frames doesn’t change the palette', async () => {
  const project = await counted(3, '/tests/fixtures/images/gradient.png');
  stroke(project, line(6), '#ff00aa');
  await project.pickPalette();
  const palette = hexes(project);
  project.showFrame(1);
  expect(hexes(project)).toEqual(palette);
  project.showFrame(2);
  expect(hexes(project)).toEqual(palette);
});

test('a slider re-picks it over the whole movie too', async () => {
  const project = await counted(2);
  project.showFrame(1);
  stroke(project, line(6), '#ff00aa');
  await project.pickPalette();
  const palette = hexes(project);
  project.setSlider('invert', 100);
  project.commitSliders();
  await settle(project);
  await project.pickPalette();
  expect(hexes(project)).not.toEqual(palette);
  expect(await project.builtFrame(0)).toBeTruthy();
  project.showFrame(0);
  expect((await project.builtFrame(0)).cells.map((c) => c.bg.hex)).toEqual(project.cells.map((c) => c.bg.hex));
});

test('a still picks its palette exactly as today, and so does one frame left after deleting', async () => {
  const project = await counted(1);
  const stillKeys = () => cellsKey(project);
  stroke(project, line(6), '#ff00aa');
  const drawn = [hexes(project), stillKeys()];
  project.render();
  await settle(project);
  expect([hexes(project), stillKeys()]).toEqual(drawn);
  project.addFrame('blank');
  await project.pickPalette();
  project.deleteFrame();
  await project.pickPalette();
  stroke(project, line(9), '#00ffaa');
  expect(hexes(project)).toContain('#00ffaa');
});

test('a movie\'s palette counts every layer', async () => {
  const project = await counted(2);
  project.showFrame(1);
  stroke(project, line(6), '#ff00aa'); // on L1, which is hidden next
  project.useLayer(project.addLayer('cells', 'edit')); // above the lower group
  stroke(project, line(9), '#00ffaa');
  project.setLayerHidden('edit', true);
  await settle(project);
  project.showFrame(0);
  await project.pickPalette();
  expect(hexes(project)).toEqual(expect.arrayContaining(['#ff00aa', '#00ffaa']));
});

test('leaving Color count lets the palette go', async () => {
  const project = await counted(2);
  project.quantize = 'vga';
  project.render();
  await settle(project);
  expect(project.activePalette.length).toBe(256);
  project.quantize = 'none';
  project.render();
  await settle(project);
  expect(project.activePalette ?? []).toHaveLength(0);
});
