// Recoloring a selection: in the ANSI view Set FG and Set BG give every cell in it your foreground or
// background color, on the layers lit (on Base, BG is a cell's top pixel and FG its bottom one); in
// the pixel view Fill paints every pixel in it your foreground color. One undo step.
import { test, expect } from 'vitest';
import { markRaw } from 'vue';
import { createTestApp, loadImage } from '../support/app.js';

const PINK = '#ff00ff', TEAL = '#008080';

async function scene() {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  workspace.editorTab = 'output';
  // A wand selection of these units (cells in the ANSI view, pixels in the pixel view).
  const wandOf = (view, units) => {
    const width = project.cols, height = view === 'output' ? 10 : project.rows;
    const mask = new Uint8Array(width * height);
    for (const [x, y] of units) mask[y * width + x] = 1;
    return markRaw({ view, width, height, mask, within: null });
  };
  const halves = (col, row) => [project.baseColorAt(col, 2 * row), project.baseColorAt(col, 2 * row + 1)];
  return { project, workspace, wandOf, halves };
}

test('on Base, Set BG gives the top pixel of every cell in the selection your color, Set FG the bottom one; one undo step', async () => {
  const { project, wandOf, halves } = await scene();
  const wand = wandOf('output', [[2, 2], [5, 3]]);
  const before = [halves(2, 2), halves(5, 3), halves(3, 2)];
  project.recolorSelection(wand, 'output', { base: true, edit: false }, { bg: PINK });
  expect([halves(2, 2), halves(5, 3), halves(3, 2)]).toEqual([[PINK, before[0][1]], [PINK, before[1][1]], before[2]]);
  project.recolorSelection(wand, 'output', { base: true, edit: false }, { fg: TEAL });
  expect([halves(2, 2), halves(5, 3)]).toEqual([[PINK, TEAL], [PINK, TEAL]]);
  expect(project.editCellAt(2, 2)).toBe(undefined); // the edit layer is left alone
  project.undo();
  expect([halves(2, 2), halves(5, 3)]).toEqual([[PINK, before[0][1]], [PINK, before[1][1]]]);
  project.undo();
  expect([halves(2, 2), halves(5, 3), halves(3, 2)]).toEqual(before);
});

test('on Edit, the cells in the selection take the color as edit cells, keeping their characters; the base is left alone', async () => {
  const { project, wandOf, halves } = await scene();
  project.typeAt(2, 2, 'a', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  const base = halves(2, 2);
  project.recolorSelection(wandOf('output', [[2, 2], [3, 2]]), 'output', { base: false, edit: true }, { fg: PINK });
  expect(project.editCellAt(2, 2)).toMatchObject({ char: 'a', fg: PINK, bg: '#000000' });
  expect(project.editCellAt(3, 2)).toMatchObject({ fg: PINK });
  expect(project.editCellAt(4, 2)).toBe(undefined);
  expect(halves(2, 2)).toEqual(base);
});

test('a Select rectangle works the same: every cell in it', async () => {
  const { project, halves } = await scene();
  const outside = halves(4, 1);
  project.recolorSelection({ c0: 1, r0: 1, c1: 3, r1: 2 }, 'output', { base: true, edit: false }, { bg: PINK });
  expect([1, 2, 3].flatMap((c) => [1, 2].map((r) => halves(c, r)[0]))).toEqual(Array(6).fill(PINK));
  expect(halves(4, 1)).toEqual(outside);
});

test('in the pixel view, Fill paints each pixel in the selection: the picture on Base, paint on Edit', async () => {
  const { project, workspace, wandOf } = await scene();
  workspace.editorTab = 'input';
  const wand = wandOf('input', [[3, 3], [4, 7]]);
  const beside = project.baseColorAt(3, 4);
  project.recolorSelection(wand, 'input', { base: true, edit: false }, { fg: PINK });
  expect([project.baseColorAt(3, 3), project.baseColorAt(4, 7), project.baseColorAt(3, 4)]).toEqual([PINK, PINK, beside]);
  expect(project.hasPaint).toBe(false);
  project.recolorSelection(wand, 'input', { base: false, edit: true }, { fg: TEAL });
  expect([project.rawColorAt(3, 3), project.rawColorAt(4, 7), project.baseColorAt(3, 3)]).toEqual([TEAL, TEAL, PINK]);
  // A rectangle in the pixel view is its cells' pixels.
  project.recolorSelection({ c0: 8, r0: 1, c1: 8, r1: 1 }, 'input', { base: true, edit: false }, { fg: PINK });
  expect([project.baseColorAt(8, 2), project.baseColorAt(8, 3), project.baseColorAt(8, 4)].map((c) => c === PINK)).toEqual([true, true, false]);
});

test('in the ASCII styles, where a cell shows its pixels’ average on black, Set FG gives both of its pixels your color', async () => {
  const { project, wandOf, halves } = await scene();
  project.renderStyle = 'colorAscii';
  project.recolorSelection(wandOf('output', [[2, 2]]), 'output', { base: true, edit: false }, { fg: PINK });
  expect(halves(2, 2)).toEqual([PINK, PINK]);
});
