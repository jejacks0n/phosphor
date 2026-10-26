// An edit rebuilds only the cells it touched, lays out only their rows again (wide characters), and
// recomposites only its area of the output (and of the base layer's grid): whatever the edits, the
// cells and the output come out as a full rebuild would make them.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { outputKey } from '../support/scenes.js';
import { layoutWide } from '@/lib/Cells';

const ATTRS = { fg: '#ffee00', bg: '#0044aa' };

// The cells as a full rebuild makes them from the output as it is now.
function fullRebuild(project) {
  const params = project.processParams;
  const composed = project.renderer.composeAll(project.renderer.cellsFromOutput(params), project.editCells, params);
  return layoutWide(composed, project.cols);
}
const key = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}${c.wide ?? ''}`);

for (const quantize of ['none', 'vga']) {
  test(`brush, typing, wide characters and base edits come out as a full rebuild would (${quantize})`, async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    project.quantize = quantize;
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

for (const [quantize, smoothing, brightness] of [['none', 'high', 100], ['vga', 'medium', 120], ['cga', 'low', 85]]) {
  test(`partial recomposites leave the output, the cells and the base's colors as a full render does (${quantize}, ${smoothing}, brightness ${brightness})`, async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    Object.assign(project, { quantize, smoothing, brightness });
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
