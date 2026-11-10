// Make art layer: the drawing inside the Select tool's selection moves into one art layer above every shape, as one
// undo step, showing exactly what it showed; cells nothing was drawn on stay see-through.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { isArt, makeArt, MOST_ART_BYTES, artBytes } from '@/document/artLayers.js';
import { rectShape, withShape } from '@/document/shapes.js';
import { partKeys } from '@/document/keys.js';
import { toastMessage } from '@/composables/useToast';
import vnode from '@/tools/vnode.js';
import vselect, { boxHandles, selectionBox } from '@/tools/vselect.js';
import { shapeAt, shapesTouching } from '@/lib/shapeHits.js';
import { copyShapes, cutShapes, pasteShapes } from '@/composables/vectorClipboard.js';
import { createApp } from 'vue';
import VectorOptions from '@/components/VectorOptions.vue';
import { i18n } from '@/i18n';
import { readProject, writeProject } from '@/document/projectIO.js';
import { useVectorStyle } from '@/composables/useVectorStyle.js';
import { useDrawingStore } from '@/store/DrawingStore';

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

// What a cell shows, by its place: its character and colors.
const looks = (project, c0, r0, c1, r1) => {
  const out = [];
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
    const cell = project.cells[row * project.cols + col];
    out.push(`${col},${row} ${cell.char} ${cell.fg.hex} ${cell.bg.hex}`);
  }
  return out;
};

test('cells painted with no character typed keep the character they showed, as typed ones do', async () => {
  const { project, workspace } = await blank(); // the converter's characters chosen at random (charChoice), from ░▒▓■▄
  project.typeAt(2, 1, 'Q', { fg: RED });
  project.commitEdit();
  const pixels = [];
  for (let x = 2; x < 12; x++) for (let y = 2; y < 8; y++) pixels.push({ x, y, ...rgb(x % 2 ? '#00ff00' : '#0000ff'), alpha: 1 });
  project.paintEditPixels(pixels);
  project.commitEdit();
  await settle(project);
  const before = looks(project, 2, 1, 11, 3);
  expect(before.some((look) => !/ [▄Q] /.test(look))).toBe(true); // some painted cell shows a character other than ▄
  select(workspace, 0, 0, 12, 4);
  expect(project.makeArtLayer()).toBeTruthy();
  await settle(project);
  expect(looks(project, 2, 1, 11, 3)).toEqual(before);
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

test('an art layer moves by whole cells with Snap to on half cells, or Cmd held', async () => {
  const { project, workspace, key, ctx } = await layer();
  workspace.vectorSnap = 'half';
  vselect.begin(ctx, { x: 3, y: 3 }, {});
  vselect.move(ctx, { x: 3, y: 3 }, { x: 6.4, y: 4.3 });
  vselect.end(ctx);
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, 5, 4]);
  workspace.isMetaPressed = true;
  vselect.begin(ctx, { x: 5.5, y: 5 }, {});
  vselect.move(ctx, { x: 5.5, y: 5 }, { x: 8.9, y: 5.9 });
  vselect.end(ctx);
  workspace.isMetaPressed = false;
  expect(project.shapes.get(key).m).toEqual([1, 0, 0, 1, 8, 4]);
});

test('the Node tool passes over an art layer, and a double-click on one in Select steps into it, not to the Node tool', async () => {
  const { project, workspace, key, ctx } = await layer();
  const rect = project.addShape(rectShape(1, 1, 7, 7, { fill: '#0000ff' })); // under the layer, round its box
  workspace.vectorSelected = [];
  workspace.setActiveTool('vnode');
  vnode.begin(ctx, { x: 3, y: 3 }, {}); // over the layer and the rect: the rect's
  vnode.end(ctx);
  expect(workspace.vectorPoints).toBe(rect);
  project.deleteShapes([rect]);
  workspace.vectorPoints = null;
  vnode.begin(ctx, { x: 3, y: 3 }, {}); // only the layer: nothing to edit
  vnode.end(ctx);
  expect(workspace.vectorPoints).toBe(null);

  workspace.setActiveTool('vselect');
  for (let i = 0; i < 2; i++) {
    vselect.begin(ctx, { x: 3, y: 3 }, {});
    vselect.end(ctx);
  }
  expect(workspace.vectorActiveTool).toBe('vselect');
  expect(workspace.vectorSelected).toEqual([key]);
  expect(workspace.vectorPoints).toBe(null);
  expect(project.artInside).toBe(key);
  expect(workspace.editorTab).toBe('output');
  project.leaveArt();

  // A press that moves is a drag, not a double-click's second click.
  workspace.editorTab = 'vector';
  vselect.begin(ctx, { x: 3, y: 3 }, {});
  vselect.move(ctx, { x: 3, y: 3 }, { x: 4, y: 3 });
  vselect.end(ctx);
  expect(project.artInside).toBe(null);
});

// An art layer on frame 0 of frames 0 to 7: moved to (8, 16) on frame 6 with a linear tween there from frame 0, a Stack
// key on frame 4, and frame 7 a Duplicate of frame 6 (its own copy of the record); frame 0 shows.
async function tweenedArt() {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  const key = project.addShape(makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 2, rows: 1, cells: [[0, 'A', RED, null]] } }));
  for (let i = 0; i < 6; i++) project.addFrame('blank');
  project.updateShapes([[key, withShape(project.shapes.get(key), { m: [1, 0, 0, 1, 8, 16] })]]);
  project.addFrame('duplicate');
  project.showFrame(4);
  project.addKey(key, 'z');
  project.showFrame(0);
  project.setKeyEasing(key, [{ part: 'transform', at: 0 }], 'linear');
  return { project, key };
}
const artOn = (project, key) => project.frames.map((_, at) => project.resolvedOf(at).get(key)?.cell.art);
const placesOf = (project, key) => project.frames.map((_, at) => project.resolvedOf(at).get(key)?.cell.m.slice(4));
const keysOf = (project, key) => JSON.stringify([...partKeys(project.frames, key, 0).rows]);

test('setArtContent changes an art layer on every frame it is on, keys kept, one undo step', async () => {
  const { project, key } = await tweenedArt();
  const old = project.shapes.get(key).art, places = placesOf(project, key), keys = keysOf(project, key);
  const art = { cols: 2, rows: 1, cells: [[0, 'B', RED, null], [1, 'C', null, '#0000ff']] };
  expect(places).toEqual([[0, 0], [1, 2], [3, 6], [4, 8], [5, 10], [7, 14], [8, 16], [8, 16]]);
  project.showFrame(3);
  const version = project.history.version;
  expect(project.setArtContent(key, art)).toBe(true);
  expect(project.history.version).toBe(version + 1);
  expect(project.shapes.get(key).art).toEqual(art);
  const changed = () => {
    expect(artOn(project, key)).toEqual(project.frames.map(() => art));
    expect(placesOf(project, key)).toEqual(places);
    expect(keysOf(project, key)).toBe(keys);
  };
  changed();
  for (const at of [6, 0, 7, 4, 3]) project.showFrame(at); // a frame left notes it, and shows what it resolves to
  project.noteFrame();
  changed();
  for (const frame of project.frames) frame.resolved = null;
  changed();

  project.undo();
  expect(artOn(project, key)).toEqual(project.frames.map(() => old));
  expect(placesOf(project, key)).toEqual(places);
  expect(keysOf(project, key)).toBe(keys);
  project.redo();
  changed();
  expect(project.shapes.get(key).art).toEqual(art);
});

test('setArtContent on a still is one step', async () => {
  const { project } = await blank();
  const key = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 2], art: { cols: 1, rows: 1, cells: [[0, 'A', RED, null]] } }));
  const old = project.shapes.get(key).art, art = { cols: 1, rows: 1, cells: [[0, 'Z', null, RED]] };
  const version = project.history.version;
  expect(project.setArtContent(key, art)).toBe(true);
  expect(project.history.version).toBe(version + 1);
  expect(project.shapes.get(key).art).toEqual(art);
  expect(project.cells[20 + 2].char).toBe('Z');
  project.undo();
  expect(project.shapes.get(key).art).toEqual(old);
  expect(project.cells[20 + 2].char).toBe('A');
});

test('the same art, or too big: no step', async () => {
  for (const frames of [0, 2]) {
    const { project } = await tweenedArt();
    while (project.frames.length > frames + 1) project.deleteFrame(); // 0: a still
    const key = [...project.shapes.keys()][0], shape = project.shapes.get(key), version = project.history.version;
    expect(project.setArtContent(key, JSON.parse(JSON.stringify(shape.art)))).toBe(false);
    const cells = Array.from({ length: 3000 }, (_, i) => [i, String.fromCharCode(0x4e00 + i), '#123456', '#654321']);
    expect(artBytes({ ...shape, art: { cols: 60, rows: 50, cells } })).toBeGreaterThan(MOST_ART_BYTES);
    expect(project.setArtContent(key, { cols: 60, rows: 50, cells })).toBe(false);
    expect(project.setArtContent('v:nothing', shape.art)).toBe(false);
    expect(project.history.version).toBe(version);
    expect(project.shapes.get(key)).toBe(shape);
  }
});

test('Join, Add, Subtract and Separate never take an art layer: nothing changes, and Join and Add are off with one selected', async () => {
  for (const artOnTop of [false, true]) {
    const { project, workspace } = await blank();
    const art = () => project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 2], art: { cols: 2, rows: 1, cells: [[0, 'A', RED, null]] } }));
    const keys = artOnTop ? [project.addShape(rectShape(0, 0, 6, 6, { fill: '#0000ff' })), art()] : [art(), project.addShape(rectShape(0, 0, 6, 6, { fill: '#0000ff' }))];
    const shapes = project.shapes, version = project.history.version;
    expect(project.joinShapes(keys)).toBe(null);
    expect(project.combineShapes(keys, 'add')).toBe(null);
    expect(project.combineShapes(keys, 'subtract')).toBe(null);
    expect(project.separateShape(keys[artOnTop ? 1 : 0])).toBe(null);
    expect(project.shapes).toBe(shapes);
    expect(project.history.version).toBe(version);

    Object.assign(workspace, { editorTab: 'vector', activeTool: 'vselect', vectorSelected: keys });
    const row = document.createElement('div'), options = createApp(VectorOptions).use(i18n);
    options.mount(row);
    await settle(project);
    const button = (name) => row.querySelector(`button[aria-label="${name}"]`);
    for (const name of ['Join', 'Add', 'Subtract', 'Separate']) expect([artOnTop, name, button(name).disabled]).toEqual([artOnTop, name, true]);
    workspace.vectorSelected = [keys[artOnTop ? 0 : 1], project.addShape(rectShape(8, 8, 12, 12, { fill: RED }))]; // two paths: Join's on
    await settle(project);
    expect(button('Join').disabled).toBe(false);
    options.unmount();
  }
});

// A drawing of cols across whose record, at m and z, is exactly bytes long: 'x' cells, some of them 'é' (a byte more).
function artOfBytes(bytes, { m = [1, 0, 0, 1, 0, 0], z = 0, cols = 100 } = {}) {
  const cellsOf = (n) => Array.from({ length: n }, (_, i) => [i, 'x', '#123456', '#654321']);
  const size = (n) => artBytes({ z, m, art: { cols, rows: Math.ceil(n / cols), cells: cellsOf(n) } });
  let lo = 1, hi = bytes; // the most cells that fit, found by halving (a record grows with every cell)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (size(mid) <= bytes) lo = mid;
    else hi = mid - 1;
  }
  const cells = cellsOf(lo);
  const art = { cols, rows: Math.ceil(cells.length / cols), cells };
  for (let i = 0, short = bytes - artBytes({ z, m, art }); i < short; i++) cells[i][1] = 'é';
  expect(artBytes({ z, m, art })).toBe(bytes);
  return art;
}

test('an edit that fits where the layer shows but not on another frame it is on is refused, so the file still opens with its frames', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  const key = project.addShape(makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 1, rows: 1, cells: [[0, 'A', RED, null]] } }));
  project.addFrame('blank');
  project.updateShapes([[key, withShape(project.shapes.get(key), { m: [1, 0, 0, 1, 123456, 246800] })]]); // frame 1's own copy, far off
  project.showFrame(0);
  const art = artOfBytes(MOST_ART_BYTES), version = project.history.version, shape = project.shapes.get(key);
  expect(artBytes({ ...shape, art })).toBe(MOST_ART_BYTES); // fits here
  expect(artBytes({ ...project.frames[1].changes.get(key).cell, art })).toBeGreaterThan(MOST_ART_BYTES); // not there
  toastMessage.value = null;
  const changed = project.setArtContent(key, art);
  const file = new File([await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() })], 'far.phosphor');
  const { project: opened } = await createTestApp();
  await opened.loadProject(file);
  expect(opened.frames.length).toBe(2);
  expect(changed).toBe(false);
  expect(toastMessage.value).toBe("That's too much for one art layer. Select a smaller piece.");
  expect(project.history.version).toBe(version);
  expect(project.shapes.get(key)).toBe(shape);
  // With room on every frame it's on, it's taken everywhere.
  const fits = artOfBytes(MOST_ART_BYTES, { m: [1, 0, 0, 1, 123456, 246800] });
  expect(project.setArtContent(key, fits)).toBe(true);
  expect(project.frames[1].changes.get(key).cell.art).toEqual(fits);
});

test('Make art layer checks the record at the stacking it gets, so a drawing at the limit is refused, not erased', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 100, rows: 200 });
  await settle(project);
  const rect = project.addShape(rectShape(0, 0, 2, 2, { fill: '#0000ff' }));
  project.updateShapes([[rect, withShape(project.shapes.get(rect), { z: 99 })]]); // the layer would be z 100
  const art = artOfBytes(MOST_ART_BYTES);
  project.writeEditCells(art.cells.map(([i, char, bg, fg]) => ({ col: i % 100, row: Math.floor(i / 100), attrs: { char, fg, bg } })));
  project.commitEdit();
  const edits = project.editCells, version = project.history.version;
  select(workspace, 0, 0, 99, art.rows - 1);
  toastMessage.value = null;
  expect(project.makeArtLayer()).toBe(null);
  expect(toastMessage.value).toBe("That's too much for one art layer. Select a smaller piece.");
  expect(project.editCells).toBe(edits);
  expect(project.history.version).toBe(version);
});

test('a move or restack an art layer at the limit has no room for is refused, and says so', async () => {
  const { project } = await blank();
  const key = project.addShape(makeArt({ m: [1, 0, 0, 1, 0, 0], art: artOfBytes(MOST_ART_BYTES) }));
  const shape = project.shapes.get(key);
  for (const change of [{ m: [1, 0, 0, 1, 10, 0] }, { z: 10 }]) {
    toastMessage.value = null;
    project.updateShapes([[key, withShape(shape, change)]]);
    expect(project.shapes.get(key)).toBe(shape);
    expect(toastMessage.value).toBe("That's too much for one art layer. Select a smaller piece.");
  }
});

test('Fill, Stroke and Swap leave an art layer as it is: no step, nothing unsaved, and in a room a mixed selection with a locked layer still restyles the rest', async () => {
  const { project, workspace } = await blank();
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 2], art: { cols: 1, rows: 1, cells: [[0, 'A', RED, null]] } }));
  project.markSaved();
  Object.assign(workspace, { editorTab: 'vector', activeTool: 'vselect', vectorSelected: [art] });
  const style = useVectorStyle(), shapes = project.shapes, version = project.history.version;
  style.set('fill', '#00ff00');
  style.set('stroke', '#0000ff');
  style.swap();
  expect(project.shapes).toBe(shapes);
  expect(project.history.version).toBe(version);
  expect(project.isDirty).toBe(false);

  const rect = project.addShape(rectShape(10, 10, 16, 20, { fill: '#0000ff' }));
  useDrawingStore().cursors = { ann: { at: null, view: null, name: 'Ann', inside: art } };
  workspace.vectorSelected = [art, rect];
  toastMessage.value = null;
  style.set('fill', '#00ff00');
  expect(project.shapes.get(rect).fill).toBe('#00ff00');
  expect(toastMessage.value).toBe(null);
});

test('Make art layer with Magic Wand cells that hold nothing says so, and makes nothing', async () => {
  const { project, workspace } = await blank();
  drawn(project);
  const version = project.history.version, mask = new Uint8Array(20 * 10);
  mask[8 * 20 + 1] = 1; // nothing drawn there
  workspace.editorTab = 'output';
  workspace.setActiveTool('wand');
  Object.assign(workspace, { wand: { view: 'output', width: 20, height: 10, mask } });
  toastMessage.value = null;
  expect(project.makeArtLayer()).toBe(null);
  expect(toastMessage.value).toBe('Nothing is drawn in the selected cells.');
  expect(project.history.version).toBe(version);
  expect(arts(project)).toEqual([]);
});

test('Make art layer from Layer 2 lands in the vector layer above it, made there if missing', async () => {
  const { project, workspace } = await blank();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(2, 1, 'Q', { fg: RED });
  project.commitEdit();
  await settle(project);
  const before = cellsKey(project), version = project.history.version;
  select(workspace, 1, 0, 4, 2);
  const key = project.makeArtLayer();
  expect(key).toBeTruthy();
  expect(project.layers.map((l) => l.id).slice(0, 3)).toEqual(['base', 'edit', top]);
  expect(project.layers).toHaveLength(4);
  const made = project.layers[3];
  expect(made.kind).toBe('vector');
  expect(project.shapes.get(key).layer ?? 'vector').toBe(made.id);
  expect(project.cellsOf(top).size).toBe(0);
  expect(cellsKey(project)).toEqual(before);
  expect(project.history.version).toBe(version + 1); // one step, the layer made with it
  project.undo();
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', top]);
  expect(project.shapes.size).toBe(0);
  expect(project.cellsOf(top).get('2,1').char).toBe('Q');
  expect(cellsKey(project)).toEqual(before);
  project.redo();
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', top, made.id]);
  expect(project.shapes.has(key)).toBe(true);

  // the vector layer that's there now takes the next one
  workspace.pickLayer(top);
  project.typeAt(8, 1, 'R', { fg: RED });
  project.commitEdit();
  select(workspace, 7, 0, 9, 2);
  const next = project.makeArtLayer();
  expect(project.layers).toHaveLength(4);
  expect(project.shapes.get(next).layer ?? 'vector').toBe(made.id);
});

test('Make art layer at the most layers a drawing holds is refused when it would add one', async () => {
  const { project, workspace } = await blank();
  project.typeAt(2, 1, 'Q', { fg: RED });
  project.commitEdit();
  while (project.addLayer('cells', 'edit')); // up to the limit, every one above the edit layer
  const count = project.layers.length, version = project.history.version;
  workspace.pickLayer('edit');
  select(workspace, 1, 0, 4, 2);
  toastMessage.value = null;
  expect(project.makeArtLayer()).toBe(null);
  expect(toastMessage.value).toBe(`A drawing holds at most ${count} layers.`);
  expect(project.layers).toHaveLength(count);
  expect(project.history.version).toBe(version);
  expect(project.cellsOf('edit').get('2,1').char).toBe('Q');
});

test('Make art layer in an animation makes the vector layer above in the same undo step', async () => {
  const { project, workspace } = await blank();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(2, 1, 'Q', { fg: RED });
  project.commitEdit();
  project.addFrame('blank');
  project.showFrame(0);
  await settle(project);
  const ids = project.layers.map((l) => l.id), version = project.history.version;
  select(workspace, 1, 0, 4, 2);
  const key = project.makeArtLayer();
  expect(key).toBeTruthy();
  expect(project.history.version).toBe(version + 1);
  const made = project.layers.at(-1);
  expect([made.kind, project.shapes.get(key).layer ?? 'vector']).toEqual(['vector', made.id]);
  project.undo();
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual(ids);
  expect(project.shapes.size).toBe(0);
  expect(project.cellsOf(top).get('2,1')?.char).toBe('Q');
  project.redo();
  await settle(project);
  expect(project.layers.map((l) => l.id)).toEqual([...ids, made.id]);
  expect(project.shapes.has(key)).toBe(true);
});

test('a redo of Make art layer brings the layer it made back as it was when undone, renamed and hidden, on a still or a movie', async () => {
  for (const movie of [false, true]) {
    const { project, workspace } = await blank();
    const top = project.addLayer('cells', 'edit');
    workspace.pickLayer(top);
    project.typeAt(2, 1, 'Q', { fg: RED });
    project.commitEdit();
    if (movie) {
      project.addFrame('blank');
      project.showFrame(0);
    }
    await settle(project);
    select(workspace, 1, 0, 4, 2);
    project.makeArtLayer();
    const id = project.layers.at(-1).id;
    project.renameLayer(id, 'Sky');
    project.setLayerHidden(id, true);
    project.undo();
    await settle(project);
    expect(project.layerById(id)).toBeFalsy();
    project.redo();
    await settle(project);
    expect(project.layerById(id)).toMatchObject({ name: 'Sky', hidden: true });
  }
});

// [base, vector, edit, a vector layer above it], with an art layer made from the edit layer: it lands on the upper one.
async function artOnUpper() {
  const app = await blank();
  const { project, workspace } = app;
  project.addLayer('vector', 'base');
  const upper = project.addLayer('vector', 'edit');
  workspace.pickLayer('edit');
  project.typeAt(2, 1, 'H', { fg: RED });
  project.commitEdit();
  select(workspace, 1, 0, 6, 2);
  const key = project.makeArtLayer();
  expect(project.shapes.get(key).layer).toBe(upper);
  await settle(project);
  return { ...app, upper, key };
}

test('an art layer on a vector layer above the first goes by its own layer\'s eye, and its row shows as picked inside', async () => {
  const { project, workspace, upper, key } = await artOnUpper();
  project.setLayerHidden(upper, true);
  await settle(project);
  toastMessage.value = null;
  expect(project.enterArt(key)).toBe(false);
  expect(toastMessage.value).toBe('Show the layer to draw on it');
  expect(project.artInside).toBe(null);

  project.setLayerHidden(upper, false);
  project.setLayerHidden('vector', true); // the first one's eye has nothing to do with it
  await settle(project);
  expect(project.enterArt(key)).toBe(true);
  expect(workspace.shownPick).toBe(upper); // LayersList's highlighted row
  expect(project.shownLayers.some((layer) => layer.id === project.editId)).toBe(true); // the art's drawing shows
  project.leaveArt();
});

test('Make art layer is refused while the cells layer or the vector layer above it is hidden, so nothing vanishes', async () => {
  for (const hidden of ['upper', 'edit']) {
    const { project, workspace } = await blank();
    const upper = project.addLayer('vector', 'edit'); // directly above the edit layer: where the art would go
    workspace.pickLayer('edit');
    project.typeAt(2, 1, 'H', { fg: RED });
    project.commitEdit();
    project.setLayerHidden(hidden === 'upper' ? upper : 'edit', true);
    await settle(project);
    const shown = cellsKey(project), version = project.history.version;
    select(workspace, 1, 0, 6, 2);
    toastMessage.value = null;
    expect(project.makeArtLayer()).toBe(null);
    expect(toastMessage.value).toBe('Show the layer to draw on it');
    expect(project.history.version).toBe(version);
    expect(project.cellsOf('edit').get('2,1')?.char).toBe('H');
    expect(cellsKey(project)).toEqual(shown);
  }
});

test('Make art layer with the base picked puts nothing of the base among the waiting layers, and the file still opens', async () => {
  const { project, workspace } = await blank();
  workspace.pickLayer('base');
  expect(project.editId).toBe('base');
  project.typeAt(2, 1, 'H', { fg: RED });
  project.commitEdit();
  select(workspace, 1, 0, 6, 2);
  const key = project.makeArtLayer();
  expect([...project._layerData.keys()]).not.toContain('base');
  if (key) await expect(readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }))).resolves.toBeTruthy();
});
