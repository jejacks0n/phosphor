// The eye: a hidden edit or vector layer leaves the screen and the exports, can't be drawn on (a toast says so), and
// changes to it (an undo, a room's) still land, to show when it's shown again.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import { getTool } from '@/tools/index.js';
import { typeAtCursor, typeText } from '@/composables/useTextTool.js';
import { toast, toastMessage, closeToast } from '@/composables/useToast.js';

vi.mock('@/composables/useToast', { spy: true });

const GRADIENT = '/tests/fixtures/images/gradient.png';
const INK = { fg: '#ffee00', bg: '#0044aa' };
const RED = '#ff0000';
const look = ({ char, fg, bg }) => ({ char, fg: fg.hex, bg: bg.hex });

afterEach(() => {
  closeToast();
  vi.restoreAllMocks();
});

async function picture() {
  const app = await createTestApp();
  await loadImage(app.project, GRADIENT, { cols: 20, rows: 20 });
  return app;
}

async function hide(project, id, hidden = true) {
  project.setLayerHidden(id, hidden);
  await settle(project);
}

function typed(project, col, row, char) {
  project.typeAt(col, row, char, INK);
  project.commitEdit();
}

// The .ans file exportFile downloads, as bytes.
async function exported(project) {
  const spy = vi.spyOn(URL, 'createObjectURL');
  await project.exportFile('ans');
  const blob = spy.mock.calls.at(-1)[0];
  spy.mockRestore();
  return [...new Uint8Array(await blob.arrayBuffer())];
}

test('a hidden edit layer shows what\'s under it', async () => {
  const { project } = await picture();
  const before = look(project.cells[0]);
  typed(project, 0, 0, 'X');
  project.paintStroke([{ x: 5, y: 4, alpha: 1 }, { x: 5, y: 5, alpha: 1 }], RED);
  project.commitEdit();
  await settle(project);
  const under = look(project.cells[(2 * 20) + 5]);
  expect(project.cells[0].char).toBe('X');

  await hide(project, 'edit');
  expect(project.layerHidden('edit')).toBe(true);
  expect(look(project.cells[0])).toEqual(before);
  expect(project.cells[(2 * 20) + 5].bg.hex).not.toBe(RED);
  expect(look(project.cells[(2 * 20) + 5])).not.toEqual(under);

  await hide(project, 'edit', false);
  expect(project.cells[0].char).toBe('X');
  expect(look(project.cells[(2 * 20) + 5])).toEqual(under);
});

test('a hidden vector layer leaves its shapes out', async () => {
  const { project } = await picture();
  const without = cellsKey(project);
  project.addShape(rectShape(0, 0, 20, 40, { fill: RED }));
  await settle(project);
  expect(cellsKey(project)).not.toEqual(without);

  await hide(project, 'vector');
  expect(cellsKey(project)).toEqual(without);
  await hide(project, 'vector', false);
  expect(cellsKey(project)).not.toEqual(without);
});

test('an ANSI export leaves hidden layers out', async () => {
  const { project } = await picture();
  typed(project, 3, 3, 'Q');
  project.paintStroke([{ x: 8, y: 8, alpha: 1 }, { x: 8, y: 9, alpha: 1 }], RED);
  project.commitEdit();
  await settle(project);
  const shown = await exported(project);

  await hide(project, 'edit');
  const hidden = await exported(project);
  expect(hidden).not.toEqual(shown);

  await hide(project, 'edit', false);
  project.clearEditLayer();
  await settle(project);
  expect(hidden).toEqual(await exported(project));
});

test('an animation frame leaves hidden layers out', async () => {
  const { project } = await picture();
  project.addShape(rectShape(0, 0, 20, 40, { fill: RED }));
  project.addFrame('duplicate');
  await settle(project);
  const reds = (built) => built.cells.filter((cell) => cell.fg.hex === RED || cell.bg.hex === RED).length;
  expect(reds(await project.builtFrame(1))).toBeGreaterThan(0);

  await hide(project, 'vector');
  expect(reds(await project.builtFrame(1))).toBe(0);
  await hide(project, 'vector', false);
  expect(reds(await project.builtFrame(1))).toBeGreaterThan(0);
});

test('drawing on a hidden layer does nothing and says so', async () => {
  const { project, workspace } = await picture();
  const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } };
  expect(workspace.pickedLayer).toBe('edit');
  await hide(project, 'edit');
  const version = project.editVersion;

  expect(getTool('pencil').begin(ctx, { x: 2, y: 2 })).toBe(false);
  expect(project.editVersion).toBe(version);
  expect(project.editCells.size).toBe(0);
  expect(toastMessage.value).toBe('Show the layer to draw on it');

  closeToast();
  workspace.textCursor = { col: 1, row: 1 };
  typeAtCursor(project, workspace, 'A');
  expect(project.editVersion).toBe(version);
  expect(toastMessage.value).toBe('Show the layer to draw on it');

  // Navigation, the picker and VECTOR's tools aren't refused: a hidden vector layer's shapes are still edited there.
  closeToast();
  project.addVectorLayer();
  await hide(project, 'vector');
  workspace.pickLayer('vector');
  getTool('vselect').begin({ ...ctx, view: 'vector' }, { x: 2, y: 2 });
  getTool('vselect').end?.({ ...ctx, view: 'vector' });
  expect(toastMessage.value).toBe(null);
});

test('changes to a hidden layer still land', async () => {
  const { project } = await picture();
  const before = look(project.cells[0]);
  typed(project, 0, 0, 'X');
  await hide(project, 'edit');
  const hiddenLook = cellsKey(project);
  project.undo();
  expect(project.editCells.has('0,0')).toBe(false);
  expect(cellsKey(project)).toEqual(hiddenLook); // still hidden, through the edit's own redraw too
  await hide(project, 'edit', false);
  expect(look(project.cells[0])).toEqual(before);
});

test('a merge presses a hidden vector layer\'s shapes in, as it would shown ones', async () => {
  const { project } = await picture();
  project.addShape(rectShape(0, 0, 20, 40, { fill: RED }));
  await hide(project, 'vector');
  project.mergeShapes();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect(project.cells.every((cell) => cell.bg.hex === RED)).toBe(true);
});

test('with the edit layer hidden, Merge down and Into the image are refused and change nothing', async () => {
  const { project } = await picture();
  typed(project, 2, 2, 'M');
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }, { x: 6, y: 7, alpha: 1 }], RED);
  project.commitEdit();
  await hide(project, 'edit');
  const kept = () => [project.editCells, project.baseRecords, project.editVersion, project.historyVersion, project.hasPaint];
  const before = kept();

  project.mergeDown();
  expect(kept()).toEqual(before);
  expect(kept()[0]).toBe(before[0]);
  expect(kept()[1]).toBe(before[1]);
  expect(toastMessage.value).toBe('Show the layer to merge it');

  closeToast();
  await project.mergeIntoPicture();
  expect(kept()).toEqual(before);
  expect(kept()[0]).toBe(before[0]);
  expect(toastMessage.value).toBe('Show the layer to merge it');
});

test('a pick reads what shows: a hidden edit layer\'s cells and paint aren\'t picked', async () => {
  const { project } = await picture();
  const under = project.underlyingAt(5, 2), raw = project.rawColorAt(5, 4);
  typed(project, 5, 2, 'Z');
  project.paintStroke([{ x: 5, y: 4, alpha: 1 }, { x: 5, y: 5, alpha: 1 }], RED);
  project.commitEdit();
  await settle(project);
  expect(project.underlyingAt(5, 2)).not.toEqual(under);
  expect(project.rawColorAt(5, 4)).toBe(RED);

  await hide(project, 'edit');
  expect(project.underlyingAt(5, 2)).toEqual(under);
  expect(project.rawColorAt(5, 4)).toBe(raw);
});

test('a paste into a hidden layer says so once', async () => {
  const { project, workspace } = await picture();
  await hide(project, 'edit');
  workspace.textCursor = { col: 1, row: 1 };
  vi.mocked(toast).mockClear();
  typeText(project, workspace, 'abc\ndef');
  expect(vi.mocked(toast).mock.calls).toEqual([['Show the layer to draw on it']]);
  expect(project.editCells.size).toBe(0);
});

// The base's eye: the picture, the base's own pixels and its pins leave; the shapes and the edit layer over it stay.
const BLACK = '#000000';
// Black on black: the converter's own character there doesn't show, and an export writes the cell as a space.
const blank = (cell) => cell.fg.hex === BLACK && cell.bg.hex === BLACK;
const PAST_THE_EDGE = '/tests/fixtures/ansi/past-the-edge.ans';

async function ansFile(project) {
  const blob = await (await fetch(PAST_THE_EDGE)).blob();
  await project.openArtFile(new File([blob], 'past-the-edge.ans'));
  await settle(project);
}

for (const charChoice of ['random', 'best', 'shape']) {
  const under = { random: '', best: ' (Best match)', shape: ' (By shape)' }[charChoice];

  test(`a hidden base shows blank cells where nothing else is${under}`, async () => {
    const { project } = await picture();
    project.charChoice = charChoice;
    await settle(project);
    const shown = cellsKey(project);
    expect(project.cells.some((cell) => !blank(cell))).toBe(true);

    await hide(project, 'base');
    expect(project.layerHidden('base')).toBe(true);
    expect(project.cells.filter((cell) => !blank(cell))).toEqual([]);
    expect(project.rawColorAt(5, 4)).toBe(BLACK); // a pick reads what shows

    await hide(project, 'base', false);
    expect(cellsKey(project)).toEqual(shown);
  });

  test(`a hidden base keeps the shapes and edit cells${under}`, async () => {
    const { project } = await picture();
    project.charChoice = charChoice;
    project.addShape(rectShape(0, 0, 6, 8, { fill: RED }));
    typed(project, 15, 7, 'X');
    await settle(project);
    const shapeCell = (1 * 20) + 1, editCell = (7 * 20) + 15, elsewhere = (8 * 20) + 4;
    const kept = [look(project.cells[shapeCell]), look(project.cells[editCell])];
    expect(kept[0].bg).toBe(RED);
    expect(kept[1]).toEqual({ char: 'X', ...INK });
    expect(blank(project.cells[elsewhere])).toBe(false);

    await hide(project, 'base');
    expect([look(project.cells[shapeCell]), look(project.cells[editCell])]).toEqual(kept);
    expect(blank(project.cells[elsewhere])).toBe(true);
  });

  test(`a hidden base hides its pins${under}`, async () => {
    const { project } = await createTestApp();
    await ansFile(project);
    project.charChoice = charChoice;
    await settle(project);
    expect(project.baseRecords.pins.size).toBeGreaterThan(0);
    const shown = cellsKey(project);

    await hide(project, 'base');
    expect(project.cells.filter((cell) => !blank(cell))).toEqual([]);
    await hide(project, 'base', false);
    expect(cellsKey(project)).toEqual(shown);
  });

  test(`edits with the base hidden draw what a full render would, the base still left out${under}`, async () => {
    const { project } = await picture();
    project.charChoice = charChoice;
    await hide(project, 'base');
    typed(project, 3, 3, 'Q');
    project.paintStroke([{ x: 8, y: 8, alpha: 1 }, { x: 8, y: 9, alpha: 1 }], RED);
    project.commitEdit();
    project.addShape(rectShape(12, 0, 16, 4, { fill: RED }));
    await settle(project);
    const edited = cellsKey(project);
    expect(blank(project.cells[(8 * 20) + 1])).toBe(true);
    project.render();
    await settle(project);
    expect(cellsKey(project)).toEqual(edited);
  });
}

test('an animation frame leaves a hidden base out', async () => {
  const { project } = await picture();
  project.addFrame('duplicate');
  await settle(project);
  expect((await project.builtFrame(1)).cells.every(blank)).toBe(false);

  await hide(project, 'base');
  expect((await project.builtFrame(1)).cells.every(blank)).toBe(true);
});

test('with the base hidden, Merge up, Merge down and Into the image are refused and change nothing', async () => {
  const { project } = await createTestApp();
  await ansFile(project);
  typed(project, 2, 2, 'M');
  await hide(project, 'base');
  const kept = () => [project.editCells, project.baseRecords, project.editVersion, project.historyVersion];
  const before = kept();

  for (const merge of [() => project.mergeUp(null), () => project.mergeDown(), () => project.mergeIntoPicture()]) {
    closeToast();
    await merge();
    expect(kept()).toEqual(before);
    expect(kept()[0]).toBe(before[0]);
    expect(kept()[1]).toBe(before[1]);
    expect(toastMessage.value).toBe('Show the layer to merge it');
  }
});
