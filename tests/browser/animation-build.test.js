// Frames built for playing are the cells a still shows: the same path, in every style and palette, proven.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';

const INK = { fg: '#ffee00', bg: '#0044aa' };

const color = ({ hex, c }) => ({ hex, c });
const cellValues = (cells) => cells.map(({ char, wide, fg, bg }) => ({ char, wide, fg: color(fg), bg: color(bg) }));

async function movie(renderStyle, quantize) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 24, rows: 24 });
  project.renderStyle = renderStyle;
  project.quantize = quantize;
  project.colorCount = 16;
  project.palette = '#FFFFFF #AA5601 #000000';
  project.render();
  await settle(project);
  const stroke = (pixels, hex) => { project.paintStroke(pixels.map(([x, y, alpha = 1]) => ({ x, y, alpha })), hex); project.commitEdit(); };
  const type = (col, row, char) => { project.typeAt(col, row, char, INK); project.commitEdit(); };

  project.beginEdit();
  project.eraseBase([{ col: 2, row: 9 }]); // base pixels and a pin, under every frame
  project.commitEdit();
  project.render();
  await settle(project);

  // Typed cells, opaque paint, soft paint, paint over solid characters, a wide character.
  type(1, 1, 'A');
  type(3, 1, '█');
  type(5, 1, ' ');
  type(7, 1, '漢');
  stroke([[3, 2], [3, 3], [5, 2], [5, 3]], '#ff3300');
  stroke([[10, 4, 0.4], [11, 4, 0.05], [12, 5, 0.7]], '#33ff66');
  project.addFrame('blank');
  type(2, 3, 'B');
  stroke([[1, 2]], '#2266cc');
  project.addFrame('duplicate');
  stroke([[14, 14, 0.5]], '#c8285a');
  project.addFrame('wipe');
  type(4, 4, 'W');
  stroke([[9, 9]], '#00ff00');
  project.addFrame('blank');
  project.clearEditCells([{ col: 4, row: 4 }]);
  project.commitEdit();
  return { project, workspace };
}

for (const style of ['ansi', 'ascii', 'colorAscii']) {
  for (const palette of ['none', 'cga', 'vga', 'count', 'palette']) {
    test(`built frames equal the still: ${style}, ${palette}`, async () => {
      const { project } = await movie(style, palette);
      for (let i = 0; i < project.frames.length; i++) {
        project.showFrame(i);
        expect(cellValues((await project.builtFrame(i)).cells)).toEqual(cellValues(project.cells));
      }
    });
  }
}

test('built output and edit cells are the frame’s own', async () => {
  const { project } = await movie('ansi', 'none');
  const built = await project.builtFrame(0);
  project.showFrame(0);
  const pixels = (canvas) => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data];
  expect(pixels(built.output)).toEqual(pixels(project.renderer.outputCanvas));
  expect([...built.editCells]).toEqual([...project.editCells]);
});

test('built frames equal the still under the sliders, with Low smoothing, and at a scaled paint layer', async () => {
  const { project } = await movie('ansi', 'none');
  project.$patch({ brightness: 130, contrast: 80, hue: 40, smoothing: 'low' });
  await settle(project);
  for (let i = 0; i < project.frames.length; i++) {
    project.showFrame(i);
    expect(cellValues((await project.builtFrame(i)).cells)).toEqual(cellValues(project.cells));
  }
});

test('building leaves editCells, paintLayer, history and project.cells as they were', async () => {
  const { project } = await movie('ansi', 'none');
  project.showFrame(2);
  const cells = project.cells, editCells = project.editCells, version = project.history.version;
  const editVersion = project.editVersion, canvas = project.paintLayer.canvas, layerVersion = project.paintLayer.version;
  const output = project.renderer.outputCanvas, ledger = project._ledger;
  for (let i = 0; i < project.frames.length; i++) await project.builtFrame(i);
  expect(project.cells).toBe(cells);
  expect(project.editCells).toBe(editCells);
  expect(project.history.version).toBe(version);
  expect(project.editVersion).toBe(editVersion);
  expect(project.paintLayer.canvas).toBe(canvas);
  expect(project.paintLayer.version).toBe(layerVersion);
  expect(project.renderer.outputCanvas).toBe(output);
  expect(project._ledger).toBe(ledger);
  expect(project.frame).toBe(2);
});

test('unchanged cells are the same objects as the previous frame’s', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 24, rows: 24 });
  project.addFrame('blank');
  project.typeAt(1, 1, 'A', INK);
  project.commitEdit();
  const first = await project.builtFrame(0), second = await project.builtFrame(1);
  const differ = second.cells.filter((cell, i) => cell !== first.cells[i]);
  expect(differ).toHaveLength(1);
  expect(differ[0].char).toBe('A');
});

test('an edit stales its frame onward and a slider stales all', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 24, rows: 24 });
  project.addFrame('blank');
  project.addFrame('blank');
  project.addFrame('wipe');
  const builtAll = () => Promise.all(project.frames.map((_, i) => project.builtFrame(i)));
  const [a, b, c, d] = await builtAll();
  expect((await builtAll())[1]).toBe(b); // nothing changed: the same builds

  project.showFrame(1);
  project.typeAt(1, 1, 'A', INK);
  project.commitEdit();
  const [a2, b2, c2, d2] = await builtAll();
  expect(a2).toBe(a);
  expect(b2).not.toBe(b);
  expect(c2).not.toBe(c);
  expect(d2).toBe(d); // a Wipe is out of its reach
  expect(c2.cells[25].char).toBe('A');

  project.setSlider('brightness', 140);
  project.commitSliders();
  await settle(project);
  const [a3, , , d3] = await builtAll();
  expect(a3).not.toBe(a2);
  expect(d3).not.toBe(d2);
  expect(a3.cells[0].fg.hex).not.toBe(a2.cells[0].fg.hex);
});

test('base pixels and pins stale all', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 24, rows: 24 });
  project.addFrame('blank');
  const first = await project.builtFrame(0);
  project.beginEdit();
  project.eraseBase([{ col: 3, row: 3 }]);
  project.commitEdit();
  const again = await project.builtFrame(0);
  expect(again).not.toBe(first);
  expect(again.cells[3 * 24 + 3].char).toBe(' ');
});

test('a scrub keeps what’s built, so going back is cheap', async () => {
  const { project } = await movie('ansi', 'none');
  const built = await project.builtFrame(1);
  project.showFrame(1);
  project.showFrame(3);
  project.showFrame(1);
  expect(await project.builtFrame(1)).toBe(built);
});

test('a still with no second frame builds too, for nothing to differ', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 12, rows: 12 });
  const shown = cellsKey(project);
  const built = await project.builtFrame(0);
  expect(built.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`)).toEqual(shown);
});

// What was just drawn is rebuilt cell by cell; arriving at a frame rebuilds it all. They must agree.
for (const style of ['ansi', 'ascii', 'colorAscii']) {
  for (const palette of ['none', 'cga', 'vga', 'count', 'palette']) {
    test(`a frame just drawn looks the same after going away and back: ${style}, ${palette}`, async () => {
      const { project } = await movie(style, palette);
      for (let i = 0; i < project.frames.length; i++) {
        project.showFrame(i);
        project.typeAt(16, 8, 'q', INK);
        project.commitEdit();
        project.paintStroke([[18, 6], [18, 7], [19, 6]].map(([x, y]) => ({ x, y, alpha: 1 })), '#aa22cc');
        project.commitEdit();
        project.paintStroke([[20, 6, 0.3], [20, 7, 0.6]].map(([x, y, alpha]) => ({ x, y, alpha })), '#22aacc');
        project.commitEdit();
        const drawn = cellValues(project.cells);
        project.showFrame(i ? i - 1 : i + 1);
        project.showFrame(i);
        expect(cellValues(project.cells)).toEqual(drawn);
      }
    });
  }
}

test('a frame with only the edit layer\'s cells is built from its own map, with no pass over it for other layers', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 24, rows: 24 });
  project.typeAt(1, 1, 'A', INK);
  project.commitEdit();
  project.addFrame('blank');
  const resolved = project.resolvedOf(0), keys = resolved.keys.bind(resolved);
  let passes = 0;
  resolved.keys = () => { passes++; return keys(); };
  await project.builtFrame(0);
  expect(passes).toBe(0);
});

test('another cells layer\'s cells are left out of a built frame, for now', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 24, rows: 24 });
  project.typeAt(1, 1, 'A', INK);
  project.commitEdit();
  workspace.pickLayer(project.addLayer('cells', 'edit'));
  project.typeAt(2, 2, 'B', INK);
  project.commitEdit();
  project.addFrame('blank');
  expect([...(await project.builtFrame(0)).editCells.keys()]).toEqual(['1,1']);
});
