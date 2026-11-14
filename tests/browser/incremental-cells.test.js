// An edit rebuilds only the cells it touched, lays out only their rows again (wide characters), and
// recomposites only its area of the output (and of the base layer's grid): whatever the edits, the
// cells and the output come out as a full rebuild would make them.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { outputKey } from '../support/scenes.js';
import { cellIndex, composeCell, coverCell, layoutWide } from '@/lib/Cells';
import { parseKey } from '@/document/editCells';
import { rectShape, withShape } from '@/document/shapes.js';

const ATTRS = { fg: '#ffee00', bg: '#0044aa' };

// The cells as a full rebuild makes them from the output as it is now.
function fullRebuild(project) {
  const params = project.processParams;
  const composed = project.renderer.composeAll(project.renderer.cellsFromOutput(params), project.editCells, params);
  return layoutWide(composed, project.cols);
}
const key = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}${c.wide ?? ''}`);

const DITHERS = [{ dither: 0 }, { dither: 0 }, { dither: 0 }, { dither: 100, ditherStyle: 'floyd' }, { dither: 70, ditherStyle: 'bayer' }];
// Best match, with and without Dither (each cell resolved from the picture; Floyd–Steinberg carries from cell to cell).
const BEST = { charChoice: 'best', chars: '▄░▒▓█' };
const BEST_CASES = [['cga', { dither: 0 }], ['cga', { dither: 100, ditherStyle: 'floyd' }], ['count', { dither: 70, ditherStyle: 'bayer' }], ['none', { dither: 0 }]]
  .map(([quantize, dithering]) => [quantize, { ...BEST, ...dithering }]);
// By shape (each cell sampled 4 x 8 from the picture and the base's own pixels), in the default set and in Color ASCII.
const SHAPE_CASES = [['cga', { dither: 0 }], ['vga', { dither: 80, ditherStyle: 'bayer' }], ['cga', { dither: 100, ditherStyle: 'floyd' }]]
  .map(([quantize, dithering]) => [quantize, { charChoice: 'shape', ...dithering }])
  .concat([['cga', { dither: 0, renderStyle: 'colorAscii', charChoiceAscii: 'shape' }]]);
BEST_CASES.push(...SHAPE_CASES);
const named = (dithering) => `dither ${dithering.dither}${dithering.ditherStyle ? ` ${dithering.ditherStyle}` : ''}${dithering.charChoice ? `, ${dithering.charChoice}` : ''}${dithering.renderStyle ? `, ${dithering.renderStyle} ${dithering.charChoiceAscii}` : ''}`;
for (const [quantize, dithering] of [['none', DITHERS[0]], ['vga', DITHERS[1]], ['count', DITHERS[2]], ['cga', DITHERS[3]], ['count', DITHERS[4]], ...BEST_CASES]) {
  test(`brush, typing, wide characters and base edits come out as a full rebuild would (${quantize}, ${named(dithering)})`, async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    Object.assign(project, { quantize, ...dithering });
    project.setLayerChars('edit', dithering); // the character settings every layer's, so the edit layer is the lower group's
    project.render();
    await settle(project);

    project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 3 + k, y: 7 + (k % 3), alpha: 1 })), '#ff3300');
    project.commitEdit();
    for (const [col, char] of [[2, 'A'], [3, '漢'], [5, 'b'], [27, '字'], [4, 'x']]) project.typeAt(col, 4, char, ATTRS); // x breaks 漢
    project.commitEdit();
    project.typeAt(10, 2, '漢', ATTRS);
    project.typeAt(11, 2, 'y', ATTRS); // over its trail
    project.commitEdit();
    project.beginEdit();
    project.eraseBase([{ col: 6, row: 9 }, { col: 20, row: 12 }]);
    project.commitEdit();
    project.paintStroke(Array.from({ length: 20 }, (_, k) => ({ x: 2 + k, y: 8, alpha: 0.5 })), '#33ff66');
    project.commitEdit();

    expect(key(project.cells)).toEqual(key(fullRebuild(project)));
  });
}

test('undo and redo rebuild only what the edit changed, and come back to exactly the cells before and after it', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  project.paintStroke(Array.from({ length: 8 }, (_, k) => ({ x: 4 + k, y: 12, alpha: 1 })), '#ff3300');
  project.commitEdit();
  await settle(project);
  const before = key(project.cells);

  project.paintStroke(Array.from({ length: 10 }, (_, k) => ({ x: 6 + k, y: 12 + (k % 2), alpha: 0.6 })), '#00ff00');
  project.typeAt(20, 3, '漢', ATTRS);
  project.beginEdit();
  project.eraseBase([{ col: 2, row: 2 }]);
  project.commitEdit();
  await settle(project);
  const after = key(project.cells);

  project.undo(); // the erase
  project.undo(); // the stroke and the typing (one edit: typing ended it, and the erase began a new one)
  await settle(project);
  expect(key(project.cells)).toEqual(before);
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
  project.redo();
  project.redo();
  await settle(project);
  expect(key(project.cells)).toEqual(after);
  expect(key(project.cells)).toEqual(key(fullRebuild(project)));
});

for (const [quantize, smoothing, brightness, dithering = { dither: 0 }] of [
  ['none', 'high', 100], ['vga', 'medium', 120], ['cga', 'low', 85],
  ['cga', 'high', 100, { dither: 100, ditherStyle: 'floyd' }], ['vga', 'medium', 120, { dither: 80, ditherStyle: 'bayer' }],
  ...BEST_CASES.map(([quantize, dithering]) => [quantize, 'high', 100, dithering]),
]) {
  test(`partial recomposites leave the output, the cells and the base's colors as a full render does (${quantize}, ${smoothing}, brightness ${brightness}, ${named(dithering)})`, async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    Object.assign(project, { quantize, smoothing, brightness, ...dithering });
    project.render();
    await settle(project);

    project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 3 + k, y: 7 + (k % 3), alpha: 1 })), '#ff3300');
    project.paintStroke(Array.from({ length: 6 }, (_, k) => ({ x: 20 + k, y: 20, alpha: 0.5 })), '#33ff66');
    project.commitEdit();
    project.beginEdit();
    project.eraseBase([{ col: 6, row: 9 }, { col: 7, row: 9 }, { col: 20, row: 12 }]);
    project.commitEdit();
    project.moveSelection({ c0: 2, r0: 2, c1: 8, r1: 5 }, ['base', 'edit'], 4, 6);
    project.beginEdit();
    project.flipBase([{ col: 15, row: 3 }]);
    project.commitEdit();
    project.typeAt(4, 4, 'Z', ATTRS); // over paint
    project.commitEdit();
    project.paintStroke([{ x: 25, y: 25, alpha: 1 }], '#0000ff');
    project.commitEdit();
    project.undo();
    await settle(project);
    const baseColors = () => Array.from({ length: 30 * 30 }, (_, i) => project.baseColorAt(i % 30, Math.floor(i / 30)));
    const partial = { output: outputKey(project), cells: key(project.cells), base: baseColors() };

    project.renderer.reset(); // everything worked out again, from scratch
    project.render();
    await settle(project);
    expect(outputKey(project)).toBe(partial.output);
    expect(key(project.cells)).toEqual(partial.cells);
    expect(baseColors()).toEqual(partial.base);
  });
}

// Floyd–Steinberg under Best match and By shape: while a base stroke is open each move resolves only
// its cells, and its end carries the change on to every cell after it.
for (const charChoice of ['best', 'shape']) {
  test(`a base stroke of several moves under Floyd–Steinberg comes out as a full render when it ends (${charChoice})`, async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    Object.assign(project, { quantize: 'cga', charChoice, chars: '▄░▒▓█', dither: 100, ditherStyle: 'floyd' });
    project.render();
    await settle(project);

    project.beginEdit();
    for (const [col, row] of [[4, 3], [5, 3], [6, 4], [12, 8], [20, 2]]) project.eraseBase([{ col, row }]);
    project.commitEdit();
    expect(key(project.cells)).toEqual(key(fullRebuild(project)));
    const partial = { output: outputKey(project), cells: key(project.cells) };

    project.renderer.reset();
    project.render();
    await settle(project);
    expect(outputKey(project)).toBe(partial.output);
    expect(key(project.cells)).toEqual(partial.cells);
  });
}

// Layers above the lower group: each edit on any of them, or a shape moved, leaves the cells as a full render makes them.
test('partial equals full with upper layers', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  const vector = project.addLayer('vector', 'edit'), one = project.addLayer('cells', vector), two = project.addLayer('cells', one);
  const shape = project.addShape(rectShape(4, 6, 14, 18, { fill: '#ff0000' }));
  project.commitEdit();
  await settle(project);
  let seed = 7;
  const random = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32); // one sequence, run to run
  const pick = (list) => list[Math.floor(random() * list.length)];
  const layers = ['edit', one, two];
  for (let i = 0; i < 40; i++) {
    const op = pick(['type', 'type', 'paint', 'paint', 'erase', 'move']);
    if (op === 'move') {
      const was = project.shapes.get(shape);
      project.updateShapes([[shape, withShape(was, { m: [1, 0, 0, 1, Math.floor(random() * 10), Math.floor(random() * 10)] })]]);
    } else {
      project.useLayer(pick(layers));
      const x = Math.floor(random() * 30), y = Math.floor(random() * 30);
      if (op === 'type') project.typeAt(x, y >> 1, pick(['A', '漢', '█', ' ', 'b']), ATTRS);
      else if (op === 'paint') project.paintStroke(Array.from({ length: 4 }, (_, k) => ({ x: Math.min(29, x + k), y, alpha: pick([1, 0.5]) })), pick(['#ff3300', '#33ff66']));
      else project.eraseEditPixels([{ x, y }, { x: Math.min(29, x + 1), y }]);
    }
    project.commitEdit();
    const partial = key(project.cells);
    project.renderer.reset();
    project.render();
    await settle(project);
    expect(key(project.cells), `after edit ${i} (${op})`).toEqual(partial);
  }
});

test('a whole-grid compose visits only the cells the upper layers touch, and comes out as one over every cell', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  const vector = project.addLayer('vector', 'edit'), one = project.addLayer('cells', vector), two = project.addLayer('cells', one);
  project.addShape(rectShape(4, 6, 14, 18, { fill: '#ff0000' }));
  project.commitEdit();
  project.useLayer(one);
  project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 10 + k, y: 20 + (k % 3), alpha: k % 2 ? 1 : 0.4 })), '#33ff66');
  project.typeAt(2, 2, '漢', ATTRS);
  project.typeAt(29, 14, 'Z', ATTRS);
  project.commitEdit();
  project.useLayer(two);
  project.paintStroke([{ x: 0, y: 0, alpha: 1 }, { x: 29, y: 29, alpha: 1 }, { x: 12, y: 21, alpha: 0.5 }], '#ff3300');
  project.typeAt(12, 10, 'q', ATTRS);
  project.commitEdit();
  project.eraseEditPixels([{ x: 29, y: 29 }]); // painted, then erased: nothing of this layer's there
  project.commitEdit();
  project._layerData.get(one).editCells.set('40,2', { char: 'P', fg: '#ffffff', bg: '#000000' }); // past the grid (a canvas shrunk): no cell of the grid is it
  await settle(project);
  const { renderer } = project, every = Array.from({ length: project.lowerCells.length }, (_, i) => i);
  const whole = renderer.composeUpper(project.lowerCells, null, renderer.palette);
  const each = renderer.composeUpper(project.lowerCells, every, renderer.palette, project.lowerCells);
  expect(key(whole)).toEqual(key(each));
  expect(key(whole)).not.toEqual(key(project.lowerCells)); // the upper layers show
  project.setLayerHidden('base', true);
  await settle(project);
  expect(key(renderer.composeUpper(project.lowerCells, null, renderer.palette))).toEqual(key(renderer.composeUpper(project.lowerCells, every, renderer.palette, project.lowerCells)));
});

test('a stack at the most layers, with every layer hidden or shown, composes as a render does', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  const { MOST_LAYERS } = await import('@/document/layerInfo.js');
  const ids = [];
  while (project.layers.length < MOST_LAYERS) ids.push(project.addLayer(ids.length % 5 === 4 ? 'vector' : 'cells', ids.at(-1) ?? 'edit'));
  for (const [i, id] of ids.entries()) {
    if (project.layerById(id).kind === 'vector') continue;
    project.useLayer(id);
    project.paintStroke([{ x: i % 20, y: (2 * i) % 40, alpha: 1 }], i % 2 ? '#ff3300' : '#33ff66');
    project.typeAt((i * 7) % 20, (i * 3) % 20, 'A', ATTRS);
    project.commitEdit();
  }
  await settle(project);
  const rendered = async () => { project.render(); await settle(project); return key(project.cells); };
  const shown = await rendered();
  for (const id of ['base', 'edit', ...ids]) project.setLayerHidden(id, true);
  await settle(project);
  const hidden = key(project.cells);
  expect(hidden).not.toEqual(shown);
  expect(hidden.every((cell) => cell.endsWith('#000000#000000'))).toBe(true); // nothing shows: black everywhere (the hidden base's blank cells)
  expect(hidden).toEqual(await rendered());
  for (const id of ['base', 'edit', ...ids]) project.setLayerHidden(id, false);
  await settle(project);
  expect(key(project.cells)).toEqual(shown);
  project.setLayerHidden(ids.at(-1), true);
  expect(key(project.cells)).toEqual(await rendered());
});

// Each entry as #composeOne lays it: over the cell under it (underCell), with the paint over that (coverCell), or the
// generated cell where there's none under it (a resize's render still to come).
function composedOneByOne(project, params, base) {
  const r = project.renderer, cells = base.slice();
  for (const [key, entry] of project.editCells) {
    const { col, row } = parseKey(key), i = cellIndex(col, row, params.cols);
    if (col >= params.cols || 2 * row >= params.rows) continue;
    const under = r.underCell(col, row, params, base);
    cells[i] = under ? coverCell(composeCell(under, entry, params.renderStyle, (hex, index) => r.effective(hex, params, index)),
      r.paintAt(col, 2 * row), r.paintAt(col, 2 * row + 1), { renderStyle: params.renderStyle, palette: r.palette }) : base[i];
  }
  return cells;
}

const STYLES = [['none', {}], ['cga', {}], ['count', {}], ['vga', { renderStyle: 'colorAscii' }], ['cga', { renderStyle: 'ascii' }], ['cga', BEST], ['cga', { charChoice: 'shape', dither: 100, ditherStyle: 'floyd' }]];
for (const [quantize, settings] of STYLES) for (const paint of [false, true]) {
  test(`composeAll lays every kind of entry as over the cell under it (${quantize}, ${JSON.stringify(settings)}${paint ? ', paint' : ''})`, async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 24, rows: 24 });
    Object.assign(project, { quantize, colorCount: 8, ...settings });
    project.setLayerChars('edit', settings);
    project.writeBaseCells([{ col: 2, row: 1, char: 'Z', fg: '#ffffff', bg: '#000000' }, { col: 3, row: 1, char: '漢', fg: '#ffffff', bg: '#000000' }]);
    project.commitEdit();
    if (paint) {
      project.paintStroke(Array.from({ length: 12 }, (_, k) => ({ x: 1 + k, y: 2 + (k % 3), alpha: k % 2 ? 0.5 : 1 })), '#ff3300');
      project.commitEdit();
    }
    project.writeEditCells([
      ['A', '#ffee00', '#0044aa'], ['漢', '#ffffff', '#000000'], [null, '#ffee00', '#0044aa'], ['b', undefined, '#0044aa'], ['c', '#ffee00', undefined],
      ['▄', undefined, undefined], ['█', '#000000', '#000000', 16, 16], ['x', '#ffffff', '#ffffff', 231, 15], [' ', '#00ff00', '#ff00ff'], ['░', '#123456', '#654321'],
    ].flatMap(([char, fg, bg, fgIndex, bgIndex], k) => [0, 1, 2].map((row) => ({ col: 1 + 2 * k, row, attrs: Object.fromEntries(Object.entries({ char, fg, bg, fgIndex, bgIndex }).filter(([, v]) => v != null)) }))));
    project.writeEditCells([{ col: 2, row: 1, attrs: { char: 'Q', fg: '#ffee00', bg: '#0044aa' } }, { col: 3, row: 1, attrs: { fg: '#ffee00' } }]); // over the pins
    project.commitEdit();
    project.render();
    await settle(project);

    const params = project.processParams, base = project.renderer.cellsFromOutput(params);
    expect(project.renderer.composeAll(base, project.editCells, params)).toEqual(composedOneByOne(project, params, base));
    project.cols = 30; // the pipeline's pixels are the old size until the render: no cell under any entry
    const resized = project.processParams;
    expect(project.renderer.composeAll(base, project.editCells, resized)).toEqual(composedOneByOne(project, resized, base));
  });
}
