// An edit rebuilds only the cells it touched, and lays out only their rows again (wide characters):
// whatever the edits, the cells come out as a full rebuild from the same output would make them.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
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
