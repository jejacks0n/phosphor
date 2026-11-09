// An edit rebuilds only the cells it touched, lays out only their rows again (wide characters), and
// recomposites only its area of the output (and of the base layer's grid): whatever the edits, the
// cells and the output come out as a full rebuild would make them.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { outputKey } from '../support/scenes.js';
import { layoutWide } from '@/lib/Cells';
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
    project.moveSelection({ c0: 2, r0: 2, c1: 8, r1: 5 }, { base: true, edit: true }, 4, 6);
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
