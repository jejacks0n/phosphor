// The eye: a hidden edit or vector layer leaves the screen and the exports, can't be drawn on (a toast says so), and
// changes to it (an undo, a room's) still land, to show when it's shown again.
import { test, expect, vi, afterEach } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { rectShape } from '@/document/shapes.js';
import { getTool } from '@/tools/index.js';
import { typeAtCursor } from '@/composables/useTextTool.js';
import { toastMessage, closeToast } from '@/composables/useToast.js';

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
  project.undo();
  expect(project.editCells.has('0,0')).toBe(false);
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
