// Recoloring a selection: in the ANSI view Set FG and Set BG give every cell in it your foreground or
// background color, on the layers lit (on Base, BG is a cell's top pixel and FG its bottom one); in
// the pixel view Fill paints every pixel in it your foreground color. One undo step.
import { test, expect } from 'vitest';
import { markRaw } from 'vue';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';

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
  project.recolorSelection(wand, 'output', ['base'], { bg: PINK });
  expect([halves(2, 2), halves(5, 3), halves(3, 2)]).toEqual([[PINK, before[0][1]], [PINK, before[1][1]], before[2]]);
  project.recolorSelection(wand, 'output', ['base'], { fg: TEAL });
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
  project.recolorSelection(wandOf('output', [[2, 2], [3, 2]]), 'output', ['edit'], { fg: PINK });
  expect(project.editCellAt(2, 2)).toMatchObject({ char: 'a', fg: PINK, bg: '#000000' });
  expect(project.editCellAt(3, 2)).toMatchObject({ fg: PINK });
  expect(project.editCellAt(4, 2)).toBe(undefined);
  expect(halves(2, 2)).toEqual(base);
});

test('a Select rectangle works the same: every cell in it', async () => {
  const { project, halves } = await scene();
  const outside = halves(4, 1);
  project.recolorSelection({ c0: 1, r0: 1, c1: 3, r1: 2 }, 'output', ['base'], { bg: PINK });
  expect([1, 2, 3].flatMap((c) => [1, 2].map((r) => halves(c, r)[0]))).toEqual(Array(6).fill(PINK));
  expect(halves(4, 1)).toEqual(outside);
});

test('in the pixel view, Fill paints each pixel in the selection: the picture on Base, paint on Edit', async () => {
  const { project, workspace, wandOf } = await scene();
  workspace.editorTab = 'input';
  const wand = wandOf('input', [[3, 3], [4, 7]]);
  const beside = project.baseColorAt(3, 4);
  project.recolorSelection(wand, 'input', ['base'], { fg: PINK });
  expect([project.baseColorAt(3, 3), project.baseColorAt(4, 7), project.baseColorAt(3, 4)]).toEqual([PINK, PINK, beside]);
  expect(project.hasPaint).toBe(false);
  project.recolorSelection(wand, 'input', ['edit'], { fg: TEAL });
  expect([project.rawColorAt(3, 3), project.rawColorAt(4, 7), project.baseColorAt(3, 3)]).toEqual([TEAL, TEAL, PINK]);
  // A rectangle in the pixel view is its cells' pixels.
  project.recolorSelection({ c0: 8, r0: 1, c1: 8, r1: 1 }, 'input', ['base'], { fg: PINK });
  expect([project.baseColorAt(8, 2), project.baseColorAt(8, 3), project.baseColorAt(8, 4)].map((c) => c === PINK)).toEqual([true, true, false]);
});

test('in the ASCII styles, where a cell shows its pixels’ average on black, Set FG gives both of its pixels your color', async () => {
  const { project, wandOf, halves } = await scene();
  project.renderStyle = 'colorAscii';
  project.recolorSelection(wandOf('output', [[2, 2]]), 'output', ['base'], { fg: PINK });
  expect(halves(2, 2)).toEqual([PINK, PINK]);
});

// What a converted photo shows is more than a cell's two pixels (CGA, Best match, contrast moved): recoloring one of
// its colors keeps the character and the other color it shows.
async function photo() {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 30, rows: 30 });
  Object.assign(project, { quantize: 'cga', charChoice: 'best', contrast: 130 });
  project.render();
  await settle(project);
  return project;
}
const RECT = { c0: 3, r0: 3, c1: 12, r1: 8 };
const shownIn = (project, { c0, r0, c1, r1 }) => {
  const out = [];
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) out.push(project.cells[cellIndex(col, row, project.cols)]);
  return out.map(({ char, fg, bg }) => ({ char, fg: fg.hex.toLowerCase(), bg: bg.hex.toLowerCase() }));
};
const PINK_IN_CGA = '#ff55ff'; // pink with the contrast moved, on CGA

for (const layers of [['base'], ['edit'], ['base', 'edit']]) {
  for (const which of ['fg', 'bg']) {
    test(`Set ${which.toUpperCase()} (${JSON.stringify(layers)}) changes only that color of what each cell shows`, async () => {
      const project = await photo();
      const before = shownIn(project, RECT);
      project.recolorSelection(RECT, 'output', layers, { [which]: PINK });
      project.render();
      await settle(project);
      expect(shownIn(project, RECT)).toEqual(before.map((cell) => ({ ...cell, [which]: PINK_IN_CGA })));
    });
  }
}

test('with both layers lit, a cell with an edit of its own is recolored there; the base under it is left alone', async () => {
  const project = await photo();
  project.typeAt(4, 4, 'S', { fg: '#ffffff', bg: '#0000aa' });
  project.commitEdit();
  const base = [project.baseColorAt(4, 8), project.baseColorAt(4, 9)];
  project.recolorSelection(RECT, 'output', ['base', 'edit'], { fg: PINK });
  expect(project.editCellAt(4, 4)).toEqual({ char: 'S', fg: PINK, bg: '#0000aa' });
  expect([project.baseColorAt(4, 8), project.baseColorAt(4, 9)]).toEqual(base);
  expect(project.editCellAt(5, 4)).toBe(undefined); // no edit of its own: its base is recolored
});

test('paint on a cell keeps showing as the color it gave that half', async () => {
  const project = await photo();
  project.paintStroke([{ x: 6, y: 10, alpha: 1 }], '#aa0000'); // the top half of cell (6, 5): its background
  project.commitEdit();
  project.render();
  await settle(project);
  const cell = { c0: 6, r0: 5, c1: 6, r1: 5 }, [before] = shownIn(project, cell);
  project.recolorSelection(cell, 'output', ['base', 'edit'], { fg: PINK });
  project.render();
  await settle(project);
  expect(shownIn(project, cell)).toEqual([{ ...before, fg: PINK_IN_CGA }]);
});

// Select all at a large document's size has to stay linear in its cells: each cell is sorted to its layer once, not by
// copying the layer's list so far (which froze the tab at 500k cells). Counted as the array elements iterated.
test('Set FG on a big selection goes through its cells a bounded number of times', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 80, rows: 100 }); // 4000 cells
  await settle(project);
  workspace.editorTab = 'output';
  const n = project.cols * 50, iterator = Array.prototype[Symbol.iterator];
  let steps = 0;
  Array.prototype[Symbol.iterator] = function () { steps += this.length; return iterator.call(this); };
  try {
    project.recolorSelection(project.gridRect(), 'output', ['base'], { fg: PINK });
  } finally {
    Array.prototype[Symbol.iterator] = iterator;
  }
  expect(project.baseColorAt(5, 2 * 7 + 1)).toBe(PINK);
  expect(steps).toBeLessThan(50 * n);
});
