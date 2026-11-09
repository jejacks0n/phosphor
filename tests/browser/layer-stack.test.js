// The drawing's layers as an ordered list in the store: an old document opens as the bottom, the vector layer and the
// edit layer, and the edit layer's fields (editCells, paintLayer, hasPaint) follow the cells layer in use (editId).
import { test, expect, vi } from 'vitest';
import { createTestApp, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { makeShape, rectShape, transformed, translation } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { MOST_LAYERS } from '@/document/layerInfo.js';
import { toastMessage } from '@/composables/useToast.js';
import { coverCell } from '@/lib/Cells.js';
import { typeText } from '@/composables/useTextTool.js';
import { createApp } from 'vue';
import ColorPopover from '@/components/ColorPopover.vue';
import { i18n } from '@/i18n';

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

test('useLayer leaves a vector layer and the layer in use as they are, and the bottom hands a layer back its own', async () => {
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
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 60, rows: 60 });
  await settle(project);
  const top = project.addLayer('cells', 'edit');
  project.useLayer(top);
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }], '#ff0000');
  project.commitEdit();
  await settle(project);
  const first = project.renderer.shownCanvas();
  expect(first).not.toBe(project.renderer.outputCanvas); // an upper layer: a copy with its pixels over it
  // Two edits far from the origin, read once between: a rect from (0, 0) to either would be thousands of pixels.
  for (const [x, y] of [[50, 50], [40, 52]]) {
    project.paintStroke([{ x, y, alpha: 1 }], '#00ff00');
    project.commitEdit();
    const draws = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage'), reads = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
    try {
      const again = project.renderer.shownCanvas();
      expect(again).toBe(first); // the same canvas, caught up
      const sizes = [...draws.mock.calls.map((args) => (args.length === 9 ? args[7] * args[8] : Infinity)), ...reads.mock.calls.map((args) => args[2] * args[3])];
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(size).toBeLessThanOrEqual(2); // one cell's two grid pixels at most
    } finally {
      draws.mockRestore();
      reads.mockRestore();
    }
    const { data } = first.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1);
    expect([data[0], data[1], data[2]]).toEqual([0, 255, 0]);
  }
});

test('a whole compose reads an upper layer\'s paint once, not a pixel at a time', async () => {
  const { project } = await blank();
  const top = project.addLayer('cells', 'edit');
  project.useLayer(top);
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }, { x: 12, y: 13, alpha: 0.5 }], '#ff0000');
  project.commitEdit();
  await settle(project);
  const before = cellsKey(project);
  const reads = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
  try {
    project.applyEditCells(); // the whole grid, as a hide, a move or a slider step does
    expect(reads.mock.calls.length).toBeLessThanOrEqual(2); // the paint at grid resolution, once; nothing per cell
  } finally {
    reads.mockRestore();
  }
  expect(cellsKey(project)).toEqual(before);
  project.paintStroke([{ x: 2, y: 2, alpha: 1 }], '#0000ff'); // and an edit after that catches the cache up where it painted
  project.commitEdit();
  expect(cellAt(project, 2, 1).bg.hex.toLowerCase()).toBe('#0000ff');
});

// Deleting and duplicating: one undo step each, on every frame; the bottom stays.
const ids = (project) => project.layers.map((l) => l.id);
const canvasBytes = (paint) => paint.canvas.width * paint.canvas.height * 4;

test('deleting a layer and undoing brings back its cells, paint and name', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  workspace.pickLayer(id);
  project.typeAt(1, 1, 'Q', WHITE);
  project.commitEdit();
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }], '#ff0000');
  project.commitEdit();
  project.renameLayer(id, 'Ink');
  workspace.pickLayer('edit');
  await settle(project);
  const shown = cellsKey(project), paint = project.paintOf(id);
  expect(project.deleteLayer(id)).toBe(true);
  await settle(project);
  expect(ids(project)).toEqual(['base', 'edit']);
  expect(project._layerData.has(id)).toBe(false);
  expect(cellAt(project, 1, 1).char).not.toBe('Q');
  expect(project.history.last.bytes).toBeGreaterThanOrEqual(canvasBytes(paint)); // what it holds counts toward undo's budget
  project.undo();
  await settle(project);
  expect(ids(project)).toEqual(['base', 'edit', id]);
  expect(project.layerById(id).name).toBe('Ink');
  expect(keys(project.cellsOf(id))).toEqual(['1,1']);
  expect(project.paintOf(id).pixelAt(4, 6)).not.toBe(null);
  expect(cellsKey(project)).toEqual(shown);
  project.redo();
  expect(ids(project)).toEqual(['base', 'edit']);
  project.undo();
  project.undo(); // the strokes under the delete are in reach again
  expect(project.paintOf(id).pixelAt(4, 6)).toBe(null);
  expect(keys(project.cellsOf(id))).toEqual(['1,1']);
});

test('deleting the picked layer picks the one under it', async () => {
  const { project, workspace } = await blank();
  const one = project.addLayer('cells', 'edit'), two = project.addLayer('cells', one); // [base, edit, L1, L2]
  workspace.pickLayer(two);
  project.typeAt(2, 2, 'T', WHITE);
  project.commitEdit();
  expect(project.deleteLayer(two)).toBe(true);
  expect(workspace.pickedLayer).toBe(one);
  expect(project.editId).toBe(one);
  project.typeAt(3, 3, 'O', WHITE);
  project.commitEdit();
  expect(keys(project.cellsOf(one))).toEqual(['3,3']);
  workspace.pickLayer('edit');
  expect(project.deleteLayer('edit')).toBe(true); // the layer in use: the base under it is picked, and the tools draw there
  expect(workspace.pickedLayer).toBe('base');
  expect(project.editId).toBe('base');
  expect(keys(project.cellsOf(one))).toEqual(['3,3']);
  project.undo();
  expect(ids(project)).toEqual(['base', 'edit', one]);
  expect(project.cellsOf('edit').size).toBe(0);
});

test('duplicate sits above the original, picked, named \'Layer 2 copy\'', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit'), above = project.addLayer('cells', id); // Layer 2, Layer 3
  workspace.pickLayer(id);
  project.typeAt(1, 1, 'Q', WHITE);
  project.commitEdit();
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }], '#ff0000');
  project.commitEdit();
  workspace.pickLayer('edit');
  await settle(project);
  const shown = cellsKey(project);
  const copy = project.duplicateLayer(id);
  await settle(project);
  expect(ids(project)).toEqual(['base', 'edit', id, copy, above]);
  expect(project.layerById(copy).name).toBe('Layer 2 copy');
  expect(workspace.pickedLayer).toBe(copy);
  expect(project.editId).toBe(copy);
  expect(JSON.stringify([...project.cellsOf(copy)])).toBe(JSON.stringify([...project.cellsOf(id)]));
  expect(project.paintOf(copy)).not.toBe(project.paintOf(id));
  expect(project.paintOf(copy).pixelAt(4, 6)).toEqual(project.paintOf(id).pixelAt(4, 6));
  expect(cellsKey(project)).toEqual(shown);
  expect(project.history.last.bytes).toBeGreaterThanOrEqual(canvasBytes(project.paintOf(copy)));
  project.typeAt(1, 1, 'Z', WHITE); // the copy is its own
  project.commitEdit();
  expect(project.cellsOf(id).get('1,1').char).toBe('Q');
  project.undo();
  project.undo();
  expect(ids(project)).toEqual(['base', 'edit', id, above]);
  expect(workspace.pickedLayer).toBe(id);
  project.redo();
  expect(ids(project)).toEqual(['base', 'edit', id, copy, above]);
  expect(project.cellsOf(copy).get('1,1').char).toBe('Q');
});

test('a duplicated vector layer\'s shapes have new keys; moving one leaves the original', async () => {
  const { project, workspace } = await blank();
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  const path = project.addShape(rectShape(1, 1, 12, 12, { stroke: '#ff0000' }));
  const rider = project.addShape(makeShape({ ...rectShape(0, 0, 2, 2, { fill: '#00ff00' }), follow: { key: path } }));
  project.commitEdit();
  const copy = project.duplicateLayer(vector);
  expect(ids(project)).toEqual(['base', 'edit', vector, copy]);
  const copies = [...project.shapes].filter(([, shape]) => shape.layer === copy);
  expect(copies).toHaveLength(2);
  expect(copies.some(([key]) => key === path || key === rider)).toBe(false);
  const [pathCopy] = copies.find(([, shape]) => !shape.follow), [, riderCopy] = copies.find(([, shape]) => shape.follow);
  expect(riderCopy.follow.key).toBe(pathCopy);
  const original = project.shapes.get(path);
  project.updateShapes([[pathCopy, transformed(project.shapes.get(pathCopy), translation(3, 0))]]);
  project.commitEdit();
  expect(project.shapes.get(path)).toBe(original);
  project.undo();
  project.undo();
  expect(ids(project)).toEqual(['base', 'edit', vector]);
  expect([...project.shapes.keys()].sort()).toEqual([path, rider].sort());
});

test('the bottom can\'t be deleted', async () => {
  const { project } = await blank();
  const version = project.history.version;
  expect(project.deleteLayer('base')).toBe(false);
  expect(project.deleteLayer('nope')).toBe(false);
  expect(project.duplicateLayer('base')).toBe(null);
  expect(project.history.version).toBe(version);
  project._sharing = { role: 'host' };
  expect(project.deleteLayer('edit')).toBe(false);
  expect(toastMessage.value).toBe('Adding, deleting and moving layers isn\'t available in a room yet.');
  expect(project.duplicateLayer('edit')).toBe(null);
  project._sharing = null;
  expect(ids(project)).toEqual(['base', 'edit']);
});

test('an undo step whose layer is gone writes no other layer', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  workspace.pickLayer(id);
  project.typeAt(1, 1, 'Q', WHITE);
  project.commitEdit();
  project.clearEditLayer(); // a whole-layer step on L1
  workspace.pickLayer('edit');
  project.layers = project.layers.filter((l) => l.id !== id); // gone some way history doesn't know of
  project._layerData.delete(id);
  project.undo();
  expect(project.editCells.size).toBe(0); // not L1's 'Q' written on the edit layer
  expect(project.editId).toBe('edit');
});

test('a stack opened without an edit layer picks the layer in use', async () => {
  const { project, workspace } = await blank();
  const one = project.addLayer('cells', 'edit'), two = project.addLayer('cells', one);
  workspace.pickLayer(two);
  project.typeAt(1, 1, 'T', WHITE);
  project.commitEdit();
  project.deleteLayer('edit'); // [base, L1, L2]: no old form
  const parts = await readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }));
  await project.openParts(parts, { filename: 'stack' });
  await settle(project);
  expect(ids(project)).toEqual(['base', one, two]);
  expect(project.editId).toBe(two);
  expect(workspace.pickedLayer).toBe(two);
});

test('with the only cells layer deleted, a base move stays on the base, pastes and typing land on the base, and + Layer starts empty', async () => {
  const { project, workspace } = await blank();
  project.typeAt(1, 1, 'Q', WHITE);
  project.commitEdit();
  project.mergeDown(); // 'Q' pinned on the base
  await settle(project);
  expect(project.baseRecords.pins.get('1,1')).toBe('Q');
  expect(project.deleteLayer('edit')).toBe(true);
  expect(ids(project)).toEqual(['base']);
  expect(workspace.pickedLayer).toBe('base');
  expect(project.editId).toBe('base'); // the tools draw on the base
  expect(workspace.selectionIds).toEqual(['base']); // only layers in the stack
  project.moveSelection({ c0: 0, r0: 0, c1: 2, r1: 2 }, workspace.selectionIds, 5, 0);
  await settle(project);
  expect(project.baseRecords.pins.get('6,1')).toBe('Q'); // the base pins moved
  expect(cellAt(project, 6, 1).char).toBe('Q');
  expect(project.editCells.size).toBe(0);

  const block = { w: 1, h: 1, cells: [{ char: 'Z', ...WHITE }] };
  expect(project.pasteSelection(block, 3, 3)).toEqual({ c0: 3, r0: 3, c1: 3, r1: 3 });
  expect(project.baseRecords.pins.get('3,3')).toBe('Z'); // pasted onto the base
  workspace.textCursor = { col: 4, row: 4 };
  typeText(project, workspace, 'hi');
  project.commitEdit();
  expect([project.baseRecords.pins.get('4,4'), project.baseRecords.pins.get('5,4')]).toEqual(['h', 'i']);
  expect(project.editCells.size).toBe(0);

  // The last cells layer deleted with a vector layer picked: the edit layer's fields are no layer's, and a paste is refused.
  const gone = project.addLayer('cells', 'base');
  workspace.pickLayer(gone);
  const vector = project.addLayer('vector', gone);
  workspace.pickLayer(vector);
  project.deleteLayer(gone);
  expect(project.editId).toBe(gone);
  const version = project.history.version;
  expect(project.pasteSelection(block, 8, 3)).toBe(null);
  expect(toastMessage.value).toBe('Add a layer to draw on it.');
  expect(project.history.version).toBe(version);

  const id = project.addLayer('cells', 'base');
  workspace.pickLayer(id);
  expect(project.editId).toBe(id);
  expect(project.cellsOf(id).size).toBe(0);
  expect(project.hasPaint).toBe(false);
  expect(project._layerData.has(id)).toBe(false); // its data is the edit layer's fields, not a stale entry
});

test('the eyedropper reads what shows, through every shown layer', async () => {
  const { project, workspace } = await blank();
  const top = project.addLayer('cells', 'edit'); // [base, edit, L1]: L1 is above the lower group
  workspace.pickLayer(top);
  project.typeAt(2, 2, 'X', { fg: '#ff0000', bg: '#0000ff' });
  project.commitEdit();
  project.paintStroke([{ x: 6, y: 6, alpha: 1 }], '#00ff00');
  project.commitEdit();
  workspace.pickLayer('edit');
  expect(project.underlyingAt(2, 2)).toMatchObject({ char: 'X', fg: '#ff0000', bg: '#0000ff' });
  expect(project.rawColorAt(6, 6)).toBe('#00ff00');
  expect(project.underlyingAt(6, 3).bg).toBe('#00ff00');
  project.setLayerHidden(top, true);
  expect(project.underlyingAt(2, 2).fg).toBe('#000000');
  expect(project.rawColorAt(6, 6)).toBe('#000000');
});

test('Clear clears the picked cells layer: refused while it\'s hidden, off with the base or a vector layer picked', async () => {
  const { project, workspace } = await blank();
  const id = project.addLayer('cells', 'edit');
  project.typeAt(1, 1, 'A', WHITE);
  project.commitEdit();
  workspace.pickLayer(id);
  project.typeAt(2, 2, 'B', WHITE);
  project.commitEdit();
  const both = () => [keys(project.cellsOf('edit')), keys(project.cellsOf(id))];
  project.setLayerHidden(id, true);
  project.clearEditLayer();
  expect(toastMessage.value).toBe('Show the layer to merge it');
  expect(both()).toEqual([['1,1'], ['2,2']]);
  project.setLayerHidden(id, false);
  workspace.pickLayer('base');
  expect(workspace.pickedCells).toBe(false); // the toolbar's Clear is off
  project.clearEditLayer();
  expect(both()).toEqual([['1,1'], ['2,2']]);
  workspace.pickLayer(project.addLayer('vector', id));
  expect(workspace.pickedCells).toBe(false);
  project.clearEditLayer();
  expect(both()).toEqual([['1,1'], ['2,2']]);
  workspace.pickLayer('edit');
  expect(workspace.pickedCells).toBe(true);
  project.clearEditLayer();
  expect(both()).toEqual([[], ['2,2']]);
});

test('a cells layer added under a painted one shows what a full render does', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 40, rows: 40 });
  project.addLayer('vector', 'base'); // [base, vector, edit]
  project.paintStroke(Array.from({ length: 10 }, (_, k) => ({ x: 18 + k, y: 32 + (k % 3), alpha: k % 2 ? 0.5 : 1 })), '#123456');
  project.commitEdit();
  workspace.pickLayer('vector');
  project.addLayer('cells', 'vector'); // the edit layer's paint is over the new one now
  await settle(project);
  const shown = cellsKey(project);
  project.render();
  await settle(project);
  expect(shown).toEqual(cellsKey(project));
});

test('the color box offers every cells layer\'s colors, not only the one in use', async () => {
  const { project, workspace } = await blank();
  project.typeAt(1, 1, 'a', { fg: '#ff0000' }); // on edit
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(2, 1, 'b', { fg: '#00ff00' });
  project.commitEdit();
  project.paintStroke([{ x: 5, y: 5, alpha: 1 }], '#0000ff');
  project.commitEdit();
  workspace.pickLayer('base');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ColorPopover, { slotName: 'fg' }).use(i18n);
  app.mount(host);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const titles = [...host.querySelectorAll('.swatch')].map((b) => b.title.toLowerCase());
  const fold = host.querySelector('.fold')?.textContent ?? '';
  app.unmount();
  host.remove();
  expect(titles).toEqual(expect.arrayContaining(['#ff0000', '#00ff00']));
  expect(fold).toContain('1'); // the top layer's paint, folded away
});

// A picture added to a drawing is paint on a cells layer, fitted to the canvas: one undo step.
const pictureFile = async () => new File([await (await fetch('/tests/fixtures/images/gradient.png')).blob()], 'gradient.png', { type: 'image/png' });

test('a picture added with Layer 1 picked becomes its paint, one undo step', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('edit');
  const version = project.history.version;
  expect(await project.addPictureToLayer(await pictureFile())).toBe('edit');
  expect(ids(project)).toEqual(['base', 'edit']);
  expect(project.paintOf('edit').hasPaint).toBe(true);
  expect(project.history.version).toBe(version + 1);
  project.undo();
  expect(project.paintOf('edit').hasPaint).toBe(false);
  project.redo();
  expect(project.paintOf('edit').hasPaint).toBe(true);
});

test('a picture isn\'t added to a hidden layer picked: the toast says to show it', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('edit');
  project.setLayerHidden('edit', true);
  const version = project.history.version;
  toastMessage.value = null;
  expect(await project.addPictureToLayer(await pictureFile())).toBe(null);
  expect(toastMessage.value).toBe('Show the layer to draw on it');
  expect(project.paintOf('edit')?.hasPaint ?? false).toBe(false);
  expect(ids(project)).toEqual(['base', 'edit']);
  expect(project.history.version).toBe(version);
});

test('with the base picked it lands on a new layer named after the file', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('base');
  const id = await project.addPictureToLayer(await pictureFile());
  expect(ids(project)).toEqual(['base', id, 'edit']);
  expect(project.layerById(id).name).toBe('gradient');
  expect(project.paintOf(id).hasPaint).toBe(true);
  expect(project.paintOf('edit')?.hasPaint ?? false).toBe(false);
  project.undo();
  expect(ids(project)).toEqual(['base', 'edit']);
  project.redo();
  expect(ids(project)).toEqual(['base', id, 'edit']);
  expect(project.paintOf(id).hasPaint).toBe(true);
});
