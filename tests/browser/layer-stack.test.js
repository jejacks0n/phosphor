// The drawing's layers as an ordered list in the store: an old document opens as the bottom, the vector layer and the
// edit layer, and the edit layer's fields (editCells, paintLayer, hasPaint) follow the cells layer in use (editId).
import { test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { makeShape, rectShape, transformed, translation } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { MOST_LAYERS } from '@/document/layerInfo.js';
import { toastMessage } from '@/composables/useToast.js';
import { cellIndex, coverCell } from '@/lib/Cells.js';
import { typeText } from '@/composables/useTextTool.js';
import { createApp } from 'vue';
import ColorPopover from '@/components/ColorPopover.vue';
import { i18n } from '@/i18n';

const keys = (cells) => [...cells.keys()];

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
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
  await project.setBlankCanvas({ withLayer: true, cols: 10, rows: 10 });
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
  expect(project.layerById('edit').name).toBe(null);
  expect(project.editId).toBe('edit');
  expect(project._layerData.size).toBe(0);
});

test('in a room the host\'s new layer is no undo step and goes to the room as the whole stack', async () => {
  const { project } = await blank();
  const sent = [];
  project.startSharing({ send: (message) => sent.push(message), role: 'host', me: 'mine' });
  try {
    const version = project.history.version;
    const id = project.addLayer('cells', 'edit');
    expect(ids(project)).toEqual(['base', 'edit', id]);
    expect(project.history.version).toBe(version);
    expect(sent).toEqual([{ t: 'layers', n: project._ledger.n, by: 'mine', made: id, gone: [], stack: project.layers.map(({ id: each, kind, name, chars }) => ({ id: each, kind, name, chars })) }]);
    expect(project._ledger.tail.items.at(-1)).toBe(sent[0]);
  } finally {
    project.stopSharing();
  }
});

test('Save in a room writes a drawing that fits the old form in it, which older copies open; what a room is sent keeps the stack form', async () => {
  const { project } = await blank();
  project.typeAt(2, 2, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  project.startSharing({ send: () => {}, role: 'host', me: 'mine' });
  try {
    const download = vi.spyOn(URL, 'createObjectURL');
    expect(await project.saveProject()).toBe(true);
    const file = await readProject(download.mock.calls.at(-1)[0]);
    expect(file.stack).toBeUndefined();
    expect(file.editCells.get('2,2')?.char).toBe('A');
    expect((await project.projectParts()).stack.map(({ id }) => id)).toEqual(['base', 'edit']);
  } finally {
    project.stopSharing();
    vi.restoreAllMocks();
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

test('the first shape is refused with the most layers, since the vector layer it brings would be one too many', async () => {
  const { project, workspace } = await blank();
  while (project.layers.length < MOST_LAYERS) project.addLayer('cells', 'edit');
  expect(project.hasVectorLayer).toBe(false);
  workspace.editorTab = 'vector'; // still offered: it picks the vector layer the first shape would bring
  toastMessage.value = null;
  expect(project.addShape(rectShape(2, 2, 6, 6, { fill: '#ff0000' }))).toBe(null);
  expect(project.addShapes([rectShape(2, 2, 6, 6, { fill: '#ff0000' })])).toEqual([]); // a paste, an SVG
  project.commitEdit();
  expect(toastMessage.value).toBe(`A drawing can have up to ${MOST_LAYERS} layers.`);
  toastMessage.value = null;
  expect(project.addSvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="4" height="4" fill="red"/></svg>')).toEqual([]);
  expect(toastMessage.value).toBe(`A drawing can have up to ${MOST_LAYERS} layers.`); // not "Left out: other parts."
  expect(project.shapes.size).toBe(0);
  expect(project.layers).toHaveLength(MOST_LAYERS);
  await expect(readProject(await writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() }))).resolves.toBeTruthy();
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
  await project.setBlankCanvas({ withLayer: true, cols: 10, rows: 20 }); // 10 x 10 cells
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

// docs/model.md R2: paint over a character with no ink to tint (a space, or one in its own background color) shows as
// paint in every style. ANSI makes a ▄ of it (coverCell); the ASCII styles, with no half-blocks, convert it as paint.
for (const [renderStyle, where] of [['colorAscii', 'own layer'], ['colorAscii', 'layer above'], ['ascii', 'layer above']]) {
  test(`R2: in ${renderStyle} paint over a typed space (on the ${where}) shows as paint; a letter is tinted and kept`, async () => {
    const { project } = await blank();
    project.renderStyle = renderStyle;
    await settle(project);
    project.typeAt(2, 2, ' ', WHITE);
    project.typeAt(5, 2, 'A', { fg: '#ff0000', bg: '#000000' });
    project.commitEdit();
    if (where === 'layer above') project.useLayer(project.addLayer('cells', 'edit'));
    await settle(project);
    const blank2 = cellAt(project, 2, 2).char;
    for (const x of [2, 5]) project.paintStroke([{ x, y: 4, alpha: 1 }, { x, y: 5, alpha: 1 }], '#ffffff');
    project.commitEdit();
    await settle(project);
    const painted = cellAt(project, 2, 2), letter = cellAt(project, 5, 2), asPaint = cellAt(project, 8, 2);
    expect(blank2).toBe(' ');
    expect(painted.char).not.toBe(' '); // the paint shows, converted
    expect(painted.fg.hex.toLowerCase()).toBe('#ffffff');
    project.paintStroke([{ x: 8, y: 4, alpha: 1 }, { x: 8, y: 5, alpha: 1 }], '#ffffff'); // the same paint with no cell under it
    project.commitEdit();
    await settle(project);
    expect(painted.char).toBe(cellAt(project, 8, 2).char);
    expect(asPaint.char).toBe(' '); // was blank before
    expect(letter.char).toBe('A'); // ink: tinted, kept
  });
}

// docs/model.md R7: an upper layer converts its paint and shapes over the pixels the PIXEL view shows under it, not over
// the shown character's halves. Faint red over white paint on the layer below is near-white, as it is in the PIXEL view.
for (const [renderStyle, charChoiceAscii] of [['colorAscii', 'intensity'], ['colorAscii', 'shape'], ['ansi', null]]) {
  test(`R7: ${renderStyle}${charChoiceAscii ? ` by ${charChoiceAscii}` : ''}: faint paint on a layer above converts over the pixels under it`, async () => {
    const { project } = await blank();
    Object.assign(project, { renderStyle, ...(charChoiceAscii && { charChoiceAscii }) });
    await settle(project);
    project.paintEditPixels([{ x: 5, y: 4, r: 255, g: 255, b: 255, alpha: 1 }, { x: 5, y: 5, r: 255, g: 255, b: 255, alpha: 1 }]); // white on the lower group
    project.commitEdit();
    project.useLayer(project.addLayer('cells', 'edit'));
    project.paintEditPixels([{ x: 5, y: 4, r: 255, g: 0, b: 0, alpha: 0.1 }, { x: 5, y: 5, r: 255, g: 0, b: 0, alpha: 0.1 }]); // faint red over it
    project.commitEdit();
    await settle(project);
    const cell = cellAt(project, 5, 2), light = renderStyle === 'ansi' ? cell.bg : cell.fg;
    expect(light.r).toBe(255); // 255,230,230: white with a tenth of red, not the glyph's gray halves with red
    expect(light.g).toBeGreaterThan(220);
    expect(light.b).toBeGreaterThan(220);
    if (charChoiceAscii === 'intensity') expect(cell.char).toBe('@');
  });
}

// docs/model.md R7: paint converts the same above the lower group as in it, so a layer moved down into the lower group
// (past an empty one) shows as it did.
for (const [renderStyle, charChoiceAscii] of [['colorAscii', 'intensity'], ['colorAscii', 'shape'], ['ansi', null]]) {
  test(`R7: ${renderStyle}${charChoiceAscii ? ` by ${charChoiceAscii}` : ''}: a painted layer moved down into the lower group looks the same`, async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 24, rows: 24 });
    Object.assign(project, { renderStyle, charChoice: 'shape', ...(charChoiceAscii && { charChoiceAscii }) });
    await settle(project);
    const top = project.addLayer('cells', 'edit'); // Layer 1 stays empty under it
    project.useLayer(top);
    project.paintEditPixels(Array.from({ length: 40 }, (_, k) => ({ x: 2 + (k % 20), y: 8 + Math.floor(k / 20) * 3, r: 255, g: 64, b: 0, alpha: 0.35 + (k % 5) / 10 })));
    project.commitEdit();
    await settle(project);
    const before = project.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);
    expect(project.moveLayer(top, 1)).toBe(true);
    await settle(project);
    expect(project.layers.map((l) => l.id)).toEqual(['base', top, 'edit']);
    const after = project.cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}`);
    expect(after.filter((cell, i) => cell !== before[i])).toEqual([]);
  });
}

// The report (projects/blur-merged-upper.phosphor): a shape merged into Layer 3 and blurred, its soft edge over Layer 1's
// white stroke, came out as dark '#' and '=' cells in Color ASCII while the PIXEL view showed near-white.
test('R7: the report: a blurred shape\'s soft edge over the white stroke under it is light, as the PIXEL view shows it', async () => {
  const { project } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/blur-merged-upper.phosphor')).arrayBuffer()], 'x.phosphor'));
  await settle(project);
  const light = (cell) => cell.fg.r > 240 && cell.fg.g > 200 && cell.fg.b > 200;
  expect([[52, 8], [53, 8]].map(([col, row]) => light(cellAt(project, col, row)))).toEqual([true, true]); // #7f6058 and #75625e before
  project.charChoiceAscii = 'intensity';
  await settle(project);
  expect([[52, 8], [53, 8]].map(([col, row]) => cellAt(project, col, row).char)).toEqual(['@', '@']);
});

test('the Brush paints on a cells layer above a vector layer with no shapes yet, itself above a cells layer', async () => {
  const { project } = await blank();
  const vector = project.addLayer('vector', 'edit'); // above the lower group: an upper vector layer with no shape layer yet
  project.useLayer(project.addLayer('cells', vector));
  project.paintStroke([{ x: 5, y: 6, alpha: 1 }], '#0000ff', { blockChars: 'plain' }); // Colors only reads what's under the cell
  project.commitEdit();
  expect(project.hasPaint).toBe(true);
  expect(look(cellAt(project, 5, 3)).bg).toBe('#0000ff');
  expect(project.underlyingAt(5, 3, { evenHidden: true }).bg).toBe('#0000ff'); // what Colors only asks over a picture
  expect(() => project.storedLookAt(5, 3)).not.toThrow();
});

test('R9: a shape past a quarter of the grid on an upper vector layer keeps the paint drawn under it since the last render', async () => {
  const { project } = await blank();
  project.render();
  await settle(project);
  project.addLayer('vector', 'edit');
  project.paintStroke([{ x: 18, y: 18, alpha: 1 }, { x: 18, y: 19, alpha: 1 }], '#0000ff'); // in the output, not in the last render's cells
  project.commitEdit();
  const painted = look(cellAt(project, 18, 9));
  project.beginEdit(); // a drag: the edit stays open
  const key = project.addShape(rectShape(0, 0, 12, 12, { fill: '#ff0000' }));
  expect(look(cellAt(project, 18, 9))).toEqual(painted);
  project.updateShapes([[key, rectShape(0, 0, 16, 16, { fill: '#ff0000', z: 0 })]]);
  expect(look(cellAt(project, 18, 9))).toEqual(painted);
  project.commitEdit();
  expect(look(cellAt(project, 18, 9))).toEqual(painted);
});

test('undo and redo of an upper layer\'s edits, a fill of the whole layer among them, don\'t run the lower group or the pipeline', async () => {
  const { project } = await blank();
  project.render();
  await settle(project);
  project.paintStroke([{ x: 9, y: 9, alpha: 1 }], '#0000ff'); // on the lower group's layer after the last render: in the output, not in its cells
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  project.useLayer(top);
  project.typeAt(2, 2, 'A', { fg: '#ffffff', bg: '#000000' });
  project.commitEdit();
  const everywhere = [];
  for (let y = 0; y < project.rows; y++) for (let x = 0; x < project.cols; x++) everywhere.push({ x, y, alpha: 1 });
  project.paintStroke(everywhere, '#ff0000'); // past a quarter of the grid
  project.commitEdit();
  await settle(project);
  const rendered = async () => { project.render(); await settle(project); return cellsKey(project); };
  const filled = cellsKey(project); // no render here: the lower stroke stays out of the last render's cells
  const updateCells = vi.spyOn(project.renderer, 'updateCells'), composite = vi.spyOn(project.renderer, 'composite'), pipeline = vi.spyOn(project.renderer, 'render');
  project.undo();
  const unfilled = cellsKey(project);
  expect(unfilled).not.toEqual(filled);
  project.undo();
  const untyped = cellsKey(project);
  project.redo();
  expect(cellsKey(project)).toEqual(unfilled);
  project.redo();
  expect(cellsKey(project)).toEqual(filled);
  expect(updateCells).not.toHaveBeenCalled();
  expect(composite).not.toHaveBeenCalled();
  expect(pipeline).not.toHaveBeenCalled();
  project.undo();
  project.undo();
  expect(untyped).toEqual(await rendered());
  // The lower group's cells layer still goes through the pipeline's path.
  project.useLayer('edit');
  project.paintStroke([{ x: 4, y: 6, alpha: 1 }], '#00ff00');
  project.commitEdit();
  project.undo();
  expect(composite).toHaveBeenCalled();
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
  project.undo(); // the shape; the vector layer removes with it, since it was auto-created for it
  project.undo(); // the add
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit']);
  project.redo();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', id]); // above the edit layer, not at the index it had
  project.redo();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit', id]); // shape redone, vector layer back
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
  await project.setBlankCanvas({ withLayer: true, cols: 60, rows: 60 });
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
      const k = project.paintOf(top).scale;
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(size).toBeLessThanOrEqual(2 * k * k); // one cell's two grid pixels at most: their blocks of layer pixels read (PaintLayer.average), two pixels drawn
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
  // An artist's are asked of the host, the bottom's never, and nothing changes until the stack comes.
  const sent = [];
  project._sharing = { role: 'artist', send: (message) => sent.push(message), heard: [] };
  expect(project.deleteLayer('base')).toBe(false);
  expect(project.deleteLayer('edit')).toBe(false);
  expect(project.duplicateLayer('edit')).toBe(null);
  project._sharing = null;
  expect(sent).toEqual([{ t: 'layer-op', op: { kind: 'delete', id: 'edit' } }, { t: 'layer-op', op: { kind: 'duplicate', id: 'edit' } }]);
  expect(ids(project)).toEqual(['base', 'edit']);
  expect(project.history.version).toBe(version);
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

test('with the only cells layer deleted over a vector layer, a shape edit is still an undo step', async () => {
  const { project } = await blank();
  project.addShape(rectShape(2, 2, 12, 10, { fill: '#ff0000' }));
  project.commitEdit();
  expect(project.deleteLayer('edit')).toBe(true);
  expect(ids(project)).toEqual(['base', 'vector']);
  project.addShape(rectShape(4, 4, 8, 8, { fill: '#00ff00' }));
  project.commitEdit();
  expect(project.shapes.size).toBe(2);
  project.undo(); // the shape drawn since, not the layer's delete
  expect(project.shapes.size).toBe(1);
  expect(ids(project)).toEqual(['base', 'vector']);
  project.redo();
  expect(project.shapes.size).toBe(2);
  project.undo();
  project.undo(); // the delete
  expect(ids(project)).toEqual(['base', 'vector', 'edit']);
});

test('with the only cells layer deleted, a base move stays on the base, pastes and typing land on the base, and Add layer starts empty', async () => {
  const { project, workspace } = await blank();
  project.typeAt(1, 1, 'Q', WHITE);
  project.commitEdit();
  project.mergeDown('edit', project.gridRect()); // 'Q' pinned on the base, and the layer stays, empty
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
  expect(toastMessage.value).toBe('Add a drawing layer before drawing.');
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
  expect(toastMessage.value).toBe('Make the layer visible to merge it');
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
  expect(toastMessage.value).toBe('Make the layer visible to draw on it');
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

test('Flip on an upper cells layer swaps its own paint, and a bare cell takes the flip of what shows under it', async () => {
  const { project, workspace } = await blank();
  project.paintStroke([{ x: 5, y: 10, alpha: 1 }], '#00ff00'); // Layer 1 (the lower group): green over yellow at 5,5
  project.paintStroke([{ x: 5, y: 11, alpha: 1 }], '#ffff00');
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.paintStroke([{ x: 2, y: 4, alpha: 1 }], '#ff0000'); // Layer 2: red over blue at 2,2
  project.paintStroke([{ x: 2, y: 5, alpha: 1 }], '#0000ff');
  project.commitEdit();
  await settle(project);
  const colors = (col, row) => [cellAt(project, col, row).fg.hex, cellAt(project, col, row).bg.hex].map((hex) => hex.toLowerCase());
  expect(colors(2, 2)).toEqual(['#0000ff', '#ff0000']);
  project.flipCell(2, 2);
  project.flipCell(5, 5);
  project.commitEdit();
  await settle(project);
  expect(colors(2, 2)).toEqual(['#ff0000', '#0000ff']);
  expect(colors(5, 5)).toEqual(['#00ff00', '#ffff00']);
  expect(project.paintOf(top).pixelAt(5, 10)).toMatchObject({ r: 255, g: 255, b: 0 });
  expect(project.paintOf('edit').pixelAt(5, 10)).toMatchObject({ r: 0, g: 255, b: 0 }); // the layer under is untouched
});

test('Flip on an upper cells layer takes the flip of an upper vector layer under it too', async () => {
  const { project, workspace } = await blank();
  const vector = project.addLayer('vector', 'edit'); // above Layer 1: an upper layer
  workspace.pickLayer(vector);
  project.addShape(rectShape(2, 4, 3, 5, { fill: '#ff0000' })); // red on cell 2,2's top half, black under it
  const top = project.addLayer('cells', vector);
  workspace.pickLayer(top);
  await settle(project);
  const colors = () => [cellAt(project, 2, 2).fg.hex, cellAt(project, 2, 2).bg.hex].map((hex) => hex.toLowerCase());
  expect(colors()).toEqual(['#000000', '#ff0000']);
  project.flipCell(2, 2);
  project.commitEdit();
  await settle(project);
  expect(colors()).toEqual(['#ff0000', '#000000']);
});

test('Flip and the ANSI eyedropper on an edit cell with no paint read an upper vector layer under it; one above, or a hidden one, is left out', async () => {
  const { project, workspace } = await blank();
  const vector = project.addLayer('vector', 'edit'); // above Layer 1: an upper layer
  workspace.pickLayer(vector);
  project.addShape(rectShape(2, 4, 3, 5, { fill: '#ff0000' })); // red on cell 2,2's top half, black under it
  const top = project.addLayer('cells', vector);
  const over = project.addLayer('vector', top); // above the layer flipped
  workspace.pickLayer(over);
  project.addShape(rectShape(4, 4, 5, 5, { fill: '#00ff00' })); // green on cell 4,4's top half
  workspace.pickLayer(top);
  project.typeAt(2, 2, 'A', { fg: '#ffffff' });
  project.typeAt(4, 2, 'B', { fg: '#ffffff' });
  project.commitEdit();
  await settle(project);
  const under = (col) => { const { fg, bg } = project.underlyingAt(col, 2, { evenHidden: true }); return [fg, bg].map((hex) => hex.toLowerCase()); };
  expect(under(2)).toEqual(['#ffffff', '#ff0000']); // its own FG, the shape's red behind it, as the eyedropper picks it
  expect(under(4)).toEqual(['#ffffff', '#000000']); // the green over it isn't under it
  project.setLayerHidden(vector, true);
  await settle(project);
  expect(under(2)).toEqual(['#ffffff', '#000000']); // hidden, the red isn't behind it
  project.setLayerHidden(vector, false);
  await settle(project);
  project.flipCell(2, 2);
  project.commitEdit();
  expect(project.cellsOf(top).get('2,2')).toMatchObject({ fg: '#ff0000', bg: '#ffffff' });
});

test('Flip of a bare cell on an upper cells layer leaves out a vector layer above it, and a hidden one under it', async () => {
  const { project, workspace } = await blank();
  const hidden = project.addLayer('vector', 'edit');
  workspace.pickLayer(hidden);
  project.addShape(rectShape(2, 4, 3, 5, { fill: '#0000ff' })); // blue on cell 2,2's top half, hidden below
  const top = project.addLayer('cells', hidden);
  const above = project.addLayer('vector', top);
  workspace.pickLayer(above);
  project.addShape(rectShape(2, 4, 3, 5, { fill: '#00ff00' })); // green there too, above the layer flipped
  project.setLayerHidden(hidden, true);
  workspace.pickLayer(top);
  await settle(project);
  project.flipCell(2, 2);
  project.commitEdit();
  const black = project.paintOf(top).pixelAt(2, 5);
  expect(black).toMatchObject({ r: 0, g: 0, b: 0 }); // the black under the top half, not blue or green
  expect(project.paintOf(top).pixelAt(2, 4)).toMatchObject({ r: 0, g: 0, b: 0 });
});

test('a save after a one-cell edit encodes one layer\'s PNG, not every layer\'s', async () => {
  const { project } = await blank();
  const ids = [project.addLayer('cells', 'edit')];
  for (let i = 0; i < 3; i++) ids.push(project.addLayer('cells', ids.at(-1)));
  for (const id of ids) {
    project.useLayer(id);
    project.paintStroke([{ x: 2, y: 2, alpha: 1 }], '#ff0000');
    project.commitEdit();
  }
  await project.projectParts();
  const encoded = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
  await project.projectParts();
  expect(encoded).not.toHaveBeenCalled(); // nothing changed: every PNG kept
  project.paintStroke([{ x: 3, y: 3, alpha: 1 }], '#00ff00');
  project.commitEdit();
  const parts = await project.projectParts();
  expect(encoded).toHaveBeenCalledTimes(1);
  expect(parts.stack.filter((layer) => layer.paintBlob).length).toBe(4);
  encoded.mockRestore();
});

// docs/model.md R7: under a character of someone's own (a pin here) the pixels an upper layer converts over are the
// character as the PIXEL view shows it (its look, R11), not the two the base stores under it, its background over its
// foreground: a soft shape's edge over a red █ mixed into black on every top half and red on every bottom one, stripes.
for (const where of ['above', 'on the base']) test(`R7: a vector layer's soft edge over pinned blocks converts over the blocks' color, the same in both halves (${where})`, async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  project.charChoice = 'best'; // its blocks say which color each half is
  workspace.pickLayer('base');
  project.writeEditCells(Array.from({ length: 40 }, (_, k) => ({ col: 2 + (k % 8), row: 2 + Math.floor(k / 8), attrs: { char: '█', fg: '#ff0000', bg: '#000000' } })));
  project.commitEdit();
  project.addLayer('cells', 'base');
  const vector = project.addLayer('vector', where === 'above' ? undefined : 'base');
  workspace.pickLayer(vector);
  project.addShape(rectShape(5.5, 0, 20, 40, { fill: '#00ff00' })); // half of column 5 covered: its alpha a half
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup[where === 'above' ? 'upper' : 'vectors']).toContain(vector);
  const halves = (col, row) => { const { fg, bg, char } = project.cells[cellIndex(col, row, 20)]; return char === ' ' ? [bg.hex, bg.hex] : char === '▄' ? [bg.hex, fg.hex] : char === '▀' ? [fg.hex, bg.hex] : char === '█' ? [fg.hex, fg.hex] : [char]; };
  for (let row = 2; row < 7; row++) {
    const [top, bottom] = halves(5, row);
    expect(top, `row ${row}: ${halves(5, row)}`).toBe(bottom); // no stripe
    expect(top).not.toBe('#000000');
  }
  const before = project.cells.map(({ char, fg, bg }) => char + fg.hex + bg.hex);
  project.mergeDown(vector); // R3: pressed into the base (or onto the layer under it) as it showed
  await settle(project);
  expect(project.cells.map(({ char, fg, bg }) => char + fg.hex + bg.hex)).toEqual(before);
});

// The report (projects/vector-edge-over-pins.phosphor): a circle on a vector layer over an opened file's red box lines
// and blocks banded along its edge, black and olive by turns. Under a pinned █ whose foreground isn't black, the edge
// shows no black.
test('R7: the report: a vector circle\'s edge over a file\'s pinned blocks shows no black stripes', async () => {
  const { project } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/vector-edge-over-pins.phosphor')).arrayBuffer()], 'x.phosphor'));
  await settle(project);
  const r = project.renderer, W = r.outputCanvas.width, H = r.outputCanvas.height;
  const view = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = view.getContext('2d'); // as the PIXEL view lays them
  g.drawImage(r.shownCanvas(), 0, 0);
  g.drawImage(r.looksCanvas(project.processParams), 0, 0);
  const shown = g.getImageData(0, 0, W, H).data;
  const shapes = project._upperShapes.get('vector'), black = [];
  let checked = 0;
  for (let row = 0; row < project.rows / 2; row++) for (let col = 0; col < project.cols; col++) {
    if (r.pinAt(col, row) !== '█' || project.baseColorAt(col, 2 * row + 1) === '#000000') continue; // a █ in a color
    for (const k of [0, 1]) {
      const y = 2 * row + k, a = r.upperStoredAt(shapes, col, y)?.a ?? 0;
      if (!a || a > 0.9) continue; // the circle's soft edge
      checked++;
      const o = (y * W + col) * 4;
      if (!shown[o] && !shown[o + 1] && !shown[o + 2]) black.push(`${col},${y}`);
    }
  }
  expect(checked).toBeGreaterThan(5);
  expect(black).toEqual([]);
});

// docs/model.md R7: under a shape on the bottom a pin's look is drawn into the shapes' pixels, so a pin changed with its
// pixels left as they were (an undo of typing over it in its own colors) draws that cell again.
test('R7: a pin changed alone under a shape on the base shows its new look, and undo its old one', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  project.charChoice = 'best';
  await settle(project);
  workspace.pickLayer('base');
  project.writeEditCells([{ col: 5, row: 2, attrs: { char: '█', fg: '#ff0000', bg: '#000000' } }]);
  project.commitEdit();
  const vector = project.addLayer('vector', 'base');
  workspace.pickLayer(vector);
  project.addShape(rectShape(5.5, 0, 20, 40, { fill: '#00ff00' }));
  project.commitEdit();
  await settle(project);
  const at = () => { const { char, fg, bg } = project.cells[cellIndex(5, 2, 20)]; return char + fg.hex + bg.hex; };
  const solid = at();
  workspace.pickLayer('base');
  project.writeEditCells([{ col: 5, row: 2, attrs: { char: ' ', fg: '#ff0000', bg: '#000000' } }]); // the same two pixels
  project.commitEdit();
  await settle(project);
  const space = at();
  expect(space).not.toBe(solid);
  project.render();
  await settle(project);
  expect(at()).toBe(space);
  project.undo();
  await settle(project);
  expect(at()).toBe(solid);
  project.render();
  await settle(project);
  expect(at()).toBe(solid);
});
