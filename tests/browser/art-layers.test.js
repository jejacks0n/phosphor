// Make art layer: the drawing inside the Select tool's selection moves into one art layer above every shape, as one
// undo step, showing exactly what it showed; cells nothing was drawn on stay see-through.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { isArt, makeArt, MOST_ART_BYTES, artBytes } from '@/document/artLayers.js';
import { rectShape } from '@/document/shapes.js';
import { toastMessage } from '@/composables/useToast';
import vselect, { boxHandles, selectionBox } from '@/tools/vselect.js';
import { shapeAt, shapesTouching } from '@/lib/shapeHits.js';
import { copyShapes, cutShapes, pasteShapes } from '@/composables/vectorClipboard.js';

const RED = '#ff0000';
const rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const select = (workspace, c0, r0, c1, r1) => { workspace.selection = { c0, r0, c1, r1 }; };
const arts = (project) => [...project.shapes].filter(([, shape]) => isArt(shape));

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

// HI at (2, 1) in red, a painted top half at (5, 1), and a rect shape.
function drawn(project) {
  project.typeAt(2, 1, 'H', { fg: RED });
  project.typeAt(3, 1, 'I', { fg: RED });
  project.commitEdit();
  project.paintEditPixels([{ x: 5, y: 2, ...rgb('#00ff00'), alpha: 1 }]);
  project.commitEdit();
  return project.addShape(rectShape(10, 10, 16, 20, { fill: '#0000ff' }));
}

test('makeArtLayer moves the selected drawing into one art layer above every shape, one undo step', async () => {
  const { project, workspace } = await blank();
  const rect = drawn(project);
  const before = cellsKey(project), editBefore = project.editCells, version = project.history.version;
  select(workspace, 1, 0, 6, 2);
  const key = project.makeArtLayer();
  const art = project.shapes.get(key);
  expect(arts(project).map(([k]) => k)).toEqual([key]);
  expect(isArt(art)).toBe(true);
  expect(art.z).toBeGreaterThan(project.shapes.get(rect).z);
  expect(art.m).toEqual([1, 0, 0, 1, 2, 2]); // trimmed to the drawn cells
  expect([art.art.cols, art.art.rows]).toEqual([4, 1]);
  expect(project.editCells.size).toBe(0);
  expect(project.paintLayer.hasPaintIn({ c0: 0, r0: 0, c1: 19, r1: 9 })).toBe(false);
  expect(cellsKey(project)).toEqual(before);
  expect(project.history.version).toBe(version + 1);
  expect(workspace.vectorSelected).toEqual([key]);
  expect(workspace.editorTab).toBe('vector');
  expect(workspace.selection).toBe(null);

  project.undo();
  expect(arts(project)).toEqual([]);
  expect(project.editCells).toEqual(editBefore);
  expect(project.paintLayer.pixelAt(5, 2)).not.toBe(null);
  expect(cellsKey(project)).toEqual(before);
  project.redo();
  expect(arts(project).map(([k]) => k)).toEqual([key]);
  expect(cellsKey(project)).toEqual(before);
});

test('cells never drawn on, or erased, are see-through; black is drawn', async () => {
  const { project, workspace } = await blank();
  project.typeAt(3, 1, ' ', { bg: '#000000' });
  project.typeAt(4, 1, 'x', { fg: RED });
  project.commitEdit();
  project.clearEditCells([{ col: 4, row: 1 }]);
  select(workspace, 0, 0, 9, 4);
  project.commitEdit();
  const made = project.makeArtLayer();
  const { art } = project.shapes.get(made);
  expect(art.cells).toEqual([[0, '▄', '#000000', '#000000']]);
});

test('made on a later frame, the layer starts there', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.setAnimate(true);
  for (let i = 0; i < 3; i++) project.addFrame('blank');
  project.showFrame(2);
  project.typeAt(4, 4, 'Q', { fg: RED, bg: '#000000' });
  project.commitEdit();
  select(workspace, 0, 0, 10, 10);
  const key = project.makeArtLayer();
  expect(key).not.toBe(null);
  const has = [];
  for (const i of [0, 1, 2, 3]) {
    project.showFrame(i);
    has.push(project.shapes.has(key));
  }
  expect(has).toEqual([false, false, true, true]);
});

test('nothing drawn in the selection: no layer and no step', async () => {
  const { project, workspace } = await blank();
  drawn(project);
  const version = project.history.version;
  select(workspace, 12, 12, 18, 18);
  expect(project.makeArtLayer()).toBe(null);
  expect(project.history.version).toBe(version);
  expect(arts(project)).toEqual([]);
  expect(workspace.selection).not.toBe(null);
  workspace.selection = null;
  expect(project.makeArtLayer()).toBe(null);
});

test('too big for one layer: refused, the drawing untouched', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 200, rows: 80 });
  await settle(project);
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const cells = [];
  for (let row = 0; row < 40; row++) for (let col = 0; col < 200; col++) cells.push({ col, row, attrs: { char: String.fromCharCode(0x4e00 + col), fg: hex(0x100000 + row * 200 + col), bg: hex(0x800000 + row * 200 + col) } });
  project.writeEditCells(cells);
  project.commitEdit();
  const edits = project.editCells, version = project.history.version;
  select(workspace, 0, 0, 199, 39);
  toastMessage.value = null;
  expect(project.makeArtLayer()).toBe(null);
  expect(toastMessage.value).toBe("That's too much for one art layer. Select a smaller piece.");
  expect(project.history.version).toBe(version);
  expect(project.editCells).toBe(edits);
  expect(project.shapes.size).toBe(0);
  expect(workspace.selection).not.toBe(null);
  expect(MOST_ART_BYTES).toBeLessThan(artBytes({ cells: cells.map(({ col, row, attrs }) => [row * 200 + col, attrs.char, attrs.fg, attrs.bg]) }));
});

test('a wide character shows the same in the layer as it did in the drawing', async () => {
  const { project, workspace } = await blank();
  project.typeAt(2, 1, '日', { fg: RED, bg: '#0000ff' });
  project.commitEdit();
  const look = () => [2, 3, 4].map((col) => cellsKey(project)[20 + col]);
  const before = look();
  select(workspace, 0, 0, 9, 4);
  expect(project.makeArtLayer()).not.toBe(null);
  expect(look()).toEqual(before);
  expect(project.cells[20 + 2].char).toBe('日');
});

test('a copied art layer is its own: pasting makes a new key and editing one leaves the other', async () => {
  const { project, workspace } = await blank();
  project.typeAt(2, 1, 'A', { fg: RED, bg: '#000000' });
  project.commitEdit();
  select(workspace, 0, 0, 9, 4);
  const original = project.makeArtLayer();
  const first = project.shapes.get(original);
  expect(copyShapes(project, workspace)).toBe(true);
  expect(pasteShapes(project, workspace)).toBe(true);
  const [copy] = workspace.vectorSelected;
  expect(copy).not.toBe(original);
  expect(arts(project)).toHaveLength(2);
  const pasted = project.shapes.get(copy);
  expect(pasted.m).not.toEqual(first.m); // landed a little off, not on top
  project.updateShapes([[copy, { ...pasted, art: { ...pasted.art, cells: [[0, 'Z', '#ffffff', '#ffffff']] } }]]);
  expect(project.shapes.get(copy).art.cells[0][1]).toBe('Z');
  expect(project.shapes.get(original)).toBe(first);
  expect(project.shapes.get(original).art.cells[0][1]).toBe('A');
});

test('pasting an art layer where a different one sits at the same place lands exactly there', async () => {
  const { project, workspace } = await blank();
  project.typeAt(2, 1, 'A', { fg: RED, bg: '#000000' });
  project.commitEdit();
  select(workspace, 0, 0, 9, 4);
  const made = project.makeArtLayer(), original = project.shapes.get(made);
  expect(cutShapes(project, workspace)).toBe(true);
  project.addShape(makeArt({ z: 0, m: original.m, art: { cols: 1, rows: 1, cells: [[0, 'B', '#ffffff', '#ffffff']] } }));
  expect(pasteShapes(project, workspace)).toBe(true);
  expect(project.shapes.get(workspace.vectorSelected[0]).m).toEqual(original.m);
});

test('a Magic Wand selection makes a layer of just its cells; the rest stays in the drawing, and one undo puts it all back', async () => {
  const { project, workspace } = await blank();
  'abcde'.split('').forEach((ch, i) => project.typeAt(2 + i, 2, ch, { fg: RED, bg: '#000000' }));
  project.commitEdit();
  project.paintEditPixels([{ x: 4, y: 4, ...rgb('#00ff00'), alpha: 1 }, { x: 8, y: 4, ...rgb('#00ff00'), alpha: 1 }]);
  project.commitEdit();
  const before = cellsKey(project), editBefore = project.editCells, version = project.history.version;
  const mask = new Uint8Array(20 * 10);
  for (const col of [3, 4, 5]) mask[2 * 20 + col] = 1; // b, c, d
  workspace.editorTab = 'output';
  workspace.setActiveTool('wand');
  Object.assign(workspace, { wand: { view: 'output', width: 20, height: 10, mask } });
  const key = project.makeArtLayer();
  const art = project.shapes.get(key);
  expect(isArt(art)).toBe(true);
  expect(art.m).toEqual([1, 0, 0, 1, 3, 4]);
  expect(art.art.cols).toBe(3);
  expect(art.art.cells).toEqual([[0, 'b', '#000000', '#ff0000'], [1, 'c', '#00ff00', '#ff0000'], [2, 'd', '#000000', '#ff0000']]);
  expect([...project.editCells.keys()].sort()).toEqual(['2,2', '6,2']); // a and e stay
  expect(project.paintLayer.pixelAt(4, 4)).toBe(null);
  expect(project.paintLayer.pixelAt(8, 4)).not.toBe(null); // painted outside the wand: stays
  expect(cellsKey(project)).toEqual(before);
  expect(project.history.version).toBe(version + 1);
  expect(workspace.wand).toBe(null);

  project.undo();
  expect(arts(project)).toEqual([]);
  expect(project.editCells).toEqual(editBefore);
  expect(project.paintLayer.pixelAt(4, 4)).not.toBe(null);
  expect(cellsKey(project)).toEqual(before);
});

// An art layer at (2, 2), four cells wide and one tall, selected with Vector select (Snap to off) and a rect far off.
async function layer() {
  const app = await blank();
  const { project, workspace } = app;
  drawn(project);
  select(workspace, 1, 0, 6, 2);
  const key = project.makeArtLayer();
  project.clearHistory();
  workspace.setActiveTool('vselect');
  workspace.vectorSnap = 'none';
  return { ...app, key, ctx: { project, workspace, view: 'vector', unit: { x: 8, y: 8 } } };
}

test('a drag or an arrow moves an art layer by whole cells, never half a line', async () => {
  const { project, key, ctx } = await layer();
  const key0 = (project.shapes.get(key).m);
  const [e, f] = [key0[4], key0[5]];
  vselect.begin(ctx, { x: 3, y: 3 }, {});
  vselect.move(ctx, { x: 3, y: 3 }, { x: 6.4, y: 4.3 });
  vselect.end(ctx);
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, e + 3, f + 2]);
  vselect.keydown(ctx, new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, e + 3, f + 4]);
  vselect.keydown(ctx, new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, e + 13, f + 4]);
  vselect.keydown(ctx, new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, e + 12, f + 4]);
});

test('a drag of an art layer with a path shape moves both by whole cells', async () => {
  const { project, workspace, key, ctx } = await layer();
  const rect = project.addShape(rectShape(10.5, 10.5, 16, 20, { fill: '#0000ff' }));
  workspace.vectorSelected = [key, rect];
  const was = project.shapes.get(rect).m;
  vselect.begin(ctx, { x: 3, y: 3 }, {});
  vselect.move(ctx, { x: 3, y: 3 }, { x: 6.4, y: 4.3 });
  vselect.end(ctx);
  expect(project.shapes.get(key).m.slice(4)).toEqual([5, 4]);
  expect(project.shapes.get(rect).m.slice(4)).toEqual([was[4] + 3, was[5] + 2]);
});

test('an art layer has no size or turn handles, alone or with a path shape', async () => {
  const { project, workspace, key, ctx } = await layer();
  const rect = project.addShape(rectShape(10, 10, 16, 20, { fill: '#0000ff' }));
  const unit = ctx.unit;
  for (const keys of [[key], [key, rect]]) {
    const { handles, knob } = boxHandles(selectionBox(project.shapes, keys), unit);
    expect(handles).toEqual([]);
    expect(knob).toBe(null);
  }
  expect(boxHandles(selectionBox(project.shapes, [rect]), unit).handles).toHaveLength(8);
  // A press where a corner handle would be moves the layer, it doesn't scale it.
  workspace.vectorSelected = [key];
  vselect.begin(ctx, { x: 6, y: 4 }, {});
  vselect.move(ctx, { x: 6, y: 4 }, { x: 8, y: 4 });
  vselect.end(ctx);
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, 4, 2]);
});

test('an art layer is hit anywhere in its box, even where nothing is drawn', async () => {
  const { project, key } = await layer(); // cells at (2, 2) to (6, 4): H, I, then two cells with nothing
  expect(shapeAt(project.shapes, 2.5, 2.2, 0.1)).toBe(key);
  expect(shapeAt(project.shapes, 5.9, 3.9, 0.1)).toBe(key);
  expect(shapeAt(project.shapes, 6.5, 3, 0.1)).toBe(null);
  expect(shapesTouching(project.shapes, { x0: 5, y0: 3, x1: 9, y1: 9 })).toEqual([key]);
  expect(shapesTouching(project.shapes, { x0: 7, y0: 3, x1: 9, y1: 9 })).toEqual([]);
  expect(shapesTouching(project.shapes, { x0: 0, y0: 0, x1: 9, y1: 9 })).toEqual([key]);
});
