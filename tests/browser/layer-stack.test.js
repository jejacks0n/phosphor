// The drawing's layers as an ordered list in the store: an old document opens as the bottom, the vector layer and the
// edit layer, and the edit layer's fields (editCells, paintLayer, hasPaint) follow the cells layer in use (editId).
import { test, expect, vi } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { MOST_LAYERS } from '@/document/layerInfo.js';
import { toastMessage } from '@/composables/useToast.js';
import { coverCell } from '@/lib/Cells.js';

const keys = (cells) => [...cells.keys()];

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

test('an old document opens as base, vector, edit', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace);
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  project.commitEdit();
  const edits = JSON.stringify([...project.editCells]);
  const parts = await project.projectParts();
  const blob = await writeProject({ imageBuffer: project.imageBuffer, ...parts, layers: null }); // as a file from before layers
  await project.openParts(await readProject(blob), { filename: 'old' });
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  expect(project.editId).toBe('edit');
  expect(JSON.stringify([...project.cellsOf('edit')])).toBe(edits);
});

test('useLayer swaps the aliases', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', id]);
  project.typeAt(0, 0, 'A', { fg: '#ffffff', bg: '#000000' });
  project.useLayer(id);
  expect(project.editId).toBe(id);
  project.typeAt(1, 0, 'B', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  expect(keys(project.cellsOf('edit'))).toEqual(['0,0']);
  expect(keys(project.cellsOf(id))).toEqual(['1,0']);
  expect(project.editCells).toBe(project.cellsOf(id));
  expect(project.paintOf(id)).toBe(project.paintLayer);
  expect(project.paintOf('edit')).not.toBe(project.paintLayer);
  project.useLayer('edit');
  expect(keys(project.editCells)).toEqual(['0,0']);
});

test('useLayer leaves the bottom, a vector layer and the layer in use as they are', async () => {
  const { project } = await blank();
  const cells = project.editCells;
  project.addLayer('vector', 'base');
  for (const id of ['base', 'vector', 'edit']) project.useLayer(id);
  expect(project.editId).toBe('edit');
  expect(project.editCells).toBe(cells);
});

test('swapping layers isn\'t an edit', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  project.typeAt(0, 0, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  const version = project.editVersion, swaps = project._frameSwaps;
  project.useLayer(id);
  expect(project.editVersion).toBe(version);
  expect(project._frameSwaps).toBeGreaterThan(swaps);
});

test('addLayer puts the new layer directly above the one named, with the next number of its kind', async () => {
  const { project } = await blank();
  const one = project.addLayer('cells', 'base');
  const two = project.addLayer('cells', 'edit');
  expect(project.layers.map((l) => [l.id, l.n])).toEqual([['base', 1], [one, 2], ['edit', 1], [two, 3]]);
  expect(project.addLayer('vector', 'base')).toBe('vector');
  expect(project.layers[1].id).toBe('vector');
  expect(project.hasVectorLayer).toBe(true);
});

test('a new image or canvas starts from the bottom and the edit layer', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  project.useLayer(id);
  project.renameLayer('edit', 'Logo');
  await project.setBlankCanvas({ cols: 10, rows: 10 });
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
  expect(project.layerById('edit').name).toBe(null);
  expect(project.editId).toBe('edit');
  expect(project._layerData.size).toBe(0);
});

test('adding a layer in a room is refused, except the missing vector layer', async () => {
  const { project } = await blank();
  project.startSharing({ send: () => {}, role: 'host', me: 'mine' });
  try {
    toastMessage.value = null;
    expect(project.addLayer('cells', 'edit')).toBe(null);
    expect(toastMessage.value).toBe('Adding, deleting and moving layers isn\'t available in a room yet.');
    expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
    toastMessage.value = null;
    expect(project.addLayer('vector', 'base')).toBe('vector');
    expect(toastMessage.value).toBe(null);
    expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
    expect(project.addLayer('vector', 'base')).toBe(null); // one is there now
    expect(project.layers).toHaveLength(3);
  } finally {
    project.stopSharing();
  }
});

test('addLayer refuses past MOST_LAYERS, without a toast', async () => {
  const { project } = await blank();
  while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit');
  toastMessage.value = null;
  expect(project.addLayer('cells', 'edit')).toBe(null);
  expect(project.addLayer('vector', 'base')).toBe(null);
  expect(project.layers).toHaveLength(MOST_LAYERS);
  expect(toastMessage.value).toBe(null);
});

// A stack with layers above the lower group: the bottom, the edit layer, a vector layer over it and a cells layer on top.
// A black picture, 'Y' typed on the edit layer at 2,2 and 3,3, a red rect over cols 2–4 and rows 2–4 on the vector layer,
// and 'X' at 2,2 on the top layer.
const WHITE = { fg: '#ffffff', bg: '#000000' };
const look = ({ char, fg, bg }) => ({ char, fg: fg.hex, bg: bg.hex });
const cellAt = (project, col, row) => project.cells[row * project.cols + col];
async function stacked() {
  const app = await createTestApp();
  const { project } = app;
  await project.setBlankCanvas({ cols: 10, rows: 20 }); // 10 x 10 cells
  await settle(project);
  const black = look(cellAt(project, 6, 6));
  for (const [col, row] of [[2, 2], [3, 3]]) project.typeAt(col, row, 'Y', WHITE);
  project.commitEdit();
  const vector = project.addLayer('vector', 'edit');
  project.addShape(rectShape(2, 4, 5, 10, { fill: '#ff0000' }));
  project.commitEdit();
  const top = project.addLayer('cells', vector);
  project.useLayer(top);
  project.typeAt(2, 2, 'X', WHITE);
  project.commitEdit();
  await settle(project);
  return { ...app, vector, top, black };
}

test('a shape between two cells layers: covered by the upper, covering the lower', async () => {
  const { project, black } = await stacked();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', 'vector', 'L1']);
  expect(cellAt(project, 2, 2).char).toBe('X');
  const covered = cellAt(project, 3, 3);
  expect(covered.char).not.toBe('Y');
  expect([covered.fg.hex, covered.bg.hex].map((hex) => hex.toLowerCase())).toContain('#ff0000');
  expect(look(cellAt(project, 6, 6))).toEqual(black);
});

test('paint on an upper layer over a typed cell covers it as paint covers edit cells', async () => {
  const { project } = await blank();
  project.typeAt(2, 2, 'Y', WHITE);
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  project.useLayer(top);
  await settle(project);
  const before = cellAt(project, 2, 2), red = { r: 255, g: 0, b: 0, a: 1 };
  project.paintStroke([{ x: 2, y: 4, alpha: 1 }], '#ff0000');
  project.commitEdit();
  expect(look(cellAt(project, 2, 2))).toEqual(look(coverCell(before, red, null, { renderStyle: 'ansi', palette: project.renderer.palette })));
});

test('an old document has no upper layers', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace);
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  project.commitEdit();
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  expect(project.renderer.upper).toEqual([]);
});

test('an edit on an upper layer doesn\'t run the lower group', async () => {
  const { project } = await blank();
  const top = project.addLayer('cells', 'edit');
  project.useLayer(top);
  await settle(project);
  const updateCells = vi.spyOn(project.renderer, 'updateCells'), composite = vi.spyOn(project.renderer, 'composite'), upper = vi.spyOn(project.renderer, 'composeUpper');
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }], '#ff0000');
  project.commitEdit();
  expect(updateCells).not.toHaveBeenCalled();
  expect(composite).not.toHaveBeenCalled();
  expect(upper).toHaveBeenCalled();
  expect(upper.mock.calls.at(-1)[1]).toEqual([3 * 20 + 4]);
});

test('a hidden layer between two leaves the group', async () => {
  const { project, vector } = await stacked();
  project.setLayerHidden(vector, true);
  await settle(project);
  expect(cellAt(project, 3, 3).char).toBe('Y');
  expect(cellAt(project, 2, 2).char).toBe('X');
  expect(project.renderer.upper.map((u) => u.kind)).toEqual(['cells']);
});

test('add and move are undo steps; undo puts the pick back on a layer that exists', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('edit');
  const id = project.addLayer('cells', 'edit');
  expect(project.canUndo).toBe(true);
  workspace.pickLayer(id);
  project.typeAt(0, 0, 'A', WHITE);
  project.commitEdit();
  expect(project.moveLayer(id, 1)).toBe(true);
  expect(project.layers.map((l) => l.id)).toEqual(['base', id, 'edit']);
  for (let i = 0; i < 3; i++) project.undo();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
  expect(workspace.pickedLayer).toBe('edit');
  expect(project.editId).toBe('edit');
  expect(project.canUndo).toBe(false);
  for (let i = 0; i < 3; i++) project.redo();
  expect(project.layers.map((l) => l.id)).toEqual(['base', id, 'edit']);
  expect(keys(project.cellsOf(id))).toEqual(['0,0']);
  await settle(project);
});

test('moveLayer refuses the bottom and below it', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  const was = project.layers;
  expect(project.moveLayer('base', 1)).toBe(false);
  expect(project.moveLayer(id, 0)).toBe(false);
  expect(project.moveLayer(id, 3)).toBe(false);
  expect(project.moveLayer(id, 2)).toBe(false); // where it is
  expect(project.moveLayer('nope', 1)).toBe(false);
  expect(project.layers).toBe(was);
});

test('a layer waiting in _layerData follows a grid change, and picking a layer changes nothing shown', async () => {
  const { project, workspace } = await stacked();
  const shown = cellsKey(project);
  workspace.pickLayer('edit');
  expect(cellsKey(project)).toEqual(shown);
  expect(project.editId).toBe('edit');
  project.paintStroke([{ x: 8, y: 8, alpha: 1 }], '#00ff00'); // the top layer has paint of its own now
  project.commitEdit();
  workspace.pickLayer('L1');
  project.paintStroke([{ x: 9, y: 9, alpha: 1 }], '#00ff00');
  project.commitEdit();
  workspace.pickLayer('edit');
  project.cols = 30;
  project.render();
  await settle(project);
  expect(project.paintOf('L1').cols).toBe(30);
  expect(project.paintOf('edit').cols).toBe(30);
  expect(cellAt(project, 2, 2).char).toBe('X');
});

test('Bake and VECTOR\'s Merge down press only the vector layers on the bottom: an upper one\'s shapes stay shapes', async () => {
  const { project } = await stacked();
  const key = [...project.shapes.keys()][0];
  project.mergeShapes([key]);
  expect(project.shapes.has(key)).toBe(true);
  expect(project.canUndo).toBe(true); // the stack's steps, none for the merge
  const steps = project.history.version;
  await project.bake();
  await settle(project);
  expect(project.shapes.has(key)).toBe(true);
  expect(project.history.version).toBe(steps); // nothing to bake: the sliders are neutral and no shape presses
});

test('a redone add lands on the layer it was put above, even when the stack changed meanwhile', async () => {
  const { project } = await blank();
  const id = project.addLayer('cells', 'edit');
  project.addShape(rectShape(1, 1, 3, 3, { fill: '#ff0000' })); // the first shape brings the vector layer, on the bottom, with no step of its own
  project.commitEdit();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit', id]);
  project.undo(); // the shape; the vector layer stays
  project.undo(); // the add
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit']);
  project.redo();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit', id]); // above the edit layer, not at the index it had
  project.redo();
  expect(project.shapes.size).toBe(1);
  await settle(project);
});

test('a shape drawn with Vector 2 picked lands on it, draws in its place in the stack, and hides with its eye', async () => {
  const { project, workspace } = await blank();
  project.typeAt(2, 2, 'Y', WHITE);
  project.commitEdit();
  project.addLayer('vector', 'base');
  const two = project.addLayer('vector', 'edit'); // [base, vector, edit, L1]
  expect(two).toBe('L1');
  workspace.pickLayer(two);
  const key = project.addShape(rectShape(2, 4, 3, 6, { fill: '#ff0000' }));
  project.commitEdit();
  await settle(project);
  expect(project.shapes.get(key).layer).toBe(two);
  expect(cellAt(project, 2, 2).char).not.toBe('Y'); // above the edit layer: it covers the Y
  project.setLayerHidden('vector', true); // Vector 1's eye leaves it alone
  await settle(project);
  expect(cellAt(project, 2, 2).char).not.toBe('Y');
  project.setLayerHidden(two, true);
  await settle(project);
  expect(cellAt(project, 2, 2).char).toBe('Y');
  // Pasted copies land on the picked vector layer too, and on Vector 1 when that's the pick.
  project.setLayerHidden(two, false);
  const [copy] = project.addShapes([project.shapes.get(key)]);
  expect(project.shapes.get(copy).layer).toBe(two);
  workspace.pickLayer('vector');
  const [onOne] = project.addShapes([project.shapes.get(key)]);
  expect(project.shapes.get(onOne).layer).toBeUndefined();
});

test('after an edit on an upper layer, the PIXEL canvas is redrawn only where the edit was', async () => {
  const { project } = await blank();
  const top = project.addLayer('cells', 'edit');
  project.useLayer(top);
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }], '#ff0000');
  project.commitEdit();
  await settle(project);
  const first = project.renderer.shownCanvas();
  expect(first).not.toBe(project.renderer.outputCanvas); // an upper layer: a copy with its pixels over it
  project.paintStroke([{ x: 9, y: 9, alpha: 1 }], '#00ff00');
  project.commitEdit();
  const draws = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage'), reads = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
  try {
    const again = project.renderer.shownCanvas();
    expect(again).toBe(first); // the same canvas, caught up
    const sizes = [...draws.mock.calls.map((args) => (args.length === 9 ? args[7] * args[8] : Infinity)), ...reads.mock.calls.map((args) => args[2] * args[3])];
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(2 * project.paintLayer.scale ** 2); // one cell's pixels at most, at the paint's scale
  } finally {
    draws.mockRestore();
    reads.mockRestore();
  }
  const { data } = first.getContext('2d', { willReadFrequently: true }).getImageData(9, 9, 1, 1);
  expect([data[0], data[1], data[2]]).toEqual([0, 255, 0]);
});
