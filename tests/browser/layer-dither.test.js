// Each layer's own Dither and Dither style (CHAR_KEYS, setLayerChars, commitLayerChars): an old document gives every
// layer the document's, a layer's own changes only that layer as one undo step, an upper vector layer dithers its
// shapes as the lower group does (Ordered by place, Floyd–Steinberg held still through an edit and worked out whole at
// its end).
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey, halves } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape, ellipseShape, transformed, translation } from '@/document/shapes.js';
import { readProject, writeProject } from '@/document/projectIO.js';

const GRADIENT = '/tests/fixtures/images/gradient.png';
const MAUVE = { fill: '#7a5a8a' }; // between CGA's colors: dithering mixes several
const magic = async (blob) => new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 8));
const saved = async (project) => writeProject({ imageBuffer: project.imageBuffer, ...await project.projectParts() });
const dithers = (project, id) => { const { ditherStyle, dither } = project.charsOf(id); return { ditherStyle, dither }; };

test('an old document opens looking the same, every layer with the document\'s Dither', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { cols: 30, rows: 30, quantize: 'cga' });
  project.addShape(rectShape(2, 2, 12, 10, MAUVE));
  project.commitEdit();
  for (const id of ['base', 'vector', 'edit']) project.setLayerChars(id, { dither: 40, ditherStyle: 'bayer' }); // as a file has it
  project.commitLayerChars();
  await settle(project);
  const shown = cellsKey(project), want = { ditherStyle: 'bayer', dither: 40 };
  const blob = await saved(project);
  expect(await magic(blob)).toBe('PHOSPHOR');
  await project.openParts(await readProject(blob), { filename: 'old' });
  await settle(project);
  for (const id of ['base', 'vector', 'edit']) expect(dithers(project, id), id).toEqual(want);
  expect(project.lowerGroup.upper).toEqual([]);
  expect(cellsKey(project)).toEqual(shown);

  // A stack file from before layers had their own Dither: its layers take the document's.
  project.setLayerChars('edit', { chars: '#' });
  await settle(project);
  const again = cellsKey(project), stacked = await saved(project);
  expect(await magic(stacked)).toBe('PHOSPHR2');
  const parts = await readProject(stacked);
  parts.stack = parts.stack.map(({ chars, ...layer }) => (chars ? { ...layer, chars: { ...chars, dither: undefined, ditherStyle: undefined } } : layer))
    .map((layer) => (layer.chars ? { ...layer, chars: Object.fromEntries(Object.entries(layer.chars).filter(([, v]) => v !== undefined)) } : layer));
  expect('dither' in parts.stack[2].chars).toBe(false);
  await project.openParts(parts, { filename: 'stack' });
  await settle(project);
  for (const id of ['base', 'vector', 'edit']) expect(dithers(project, id), id).toEqual(want);
  expect(project.charsOf('edit').chars).toBe('#');
  expect(cellsKey(project)).toEqual(again);
});

// A gradient under CGA with a vector layer above Layer 1 holding a mauve square: { project, workspace, vector }.
async function squareAbove({ cols = 24, rows = 24 } = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, GRADIENT, { cols, rows });
  project.quantize = 'cga';
  await settle(project);
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  project.addShape(rectShape(4, 4, 12, 12, MAUVE));
  project.commitEdit();
  await settle(project);
  return { project, workspace, vector };
}
const inSquare = (i, cols) => i % cols >= 4 && i % cols < 12 && Math.floor(i / cols) >= 2 && Math.floor(i / cols) < 6;

test('a layer\'s own Dither changes only that layer, and each change is one undo step', async () => {
  const { project, vector } = await squareAbove();
  expect(project.lowerGroup.upper).toEqual([vector]);
  const before = cellsKey(project), version = project.history.version;
  for (const dither of [30, 60, 100]) project.setLayerChars(vector, { dither }); // a slider's drag
  project.commitLayerChars();
  expect(project.history.version).toBe(version + 1);
  expect(dithers(project, vector)).toEqual({ ditherStyle: 'floyd', dither: 100 });
  for (const id of ['base', 'edit']) expect(project.charsOf(id).dither, id).toBe(0);
  expect(project.dither).toBe(0);
  await settle(project);
  const dithered = cellsKey(project);
  const changed = dithered.map((cell, i) => i).filter((i) => dithered[i] !== before[i]);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every((i) => inSquare(i, 24))).toBe(true);

  project.setLayerChars(vector, { ditherStyle: 'bayer' }); // a style picked
  project.commitLayerChars();
  project.commitLayerChars(); // nothing more to make a step of
  expect(project.history.version).toBe(version + 2);
  await settle(project);
  expect(cellsKey(project)).not.toEqual(dithered);
  project.undo();
  await settle(project);
  expect(dithers(project, vector)).toEqual({ ditherStyle: 'floyd', dither: 100 });
  expect(cellsKey(project)).toEqual(dithered);
  project.undo();
  await settle(project);
  expect(dithers(project, vector).dither).toBe(0);
  expect(cellsKey(project)).toEqual(before);
  project.redo();
  await settle(project);
  expect(cellsKey(project)).toEqual(dithered);
});

// A mauve square on a vector layer on a blank CGA canvas, in the lower group (right on Base) or above Layer 1, every
// layer set to settings: how the cells inside the square look (their two halves: a cell of one color can be any
// character, and By shape's ties go either way on the GPU).
async function squareCells(where, settings) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 24, rows: 24, quantize: 'cga' });
  await settle(project);
  const vector = project.addLayer('vector', where);
  for (const id of ['base', 'edit', vector]) project.setLayerChars(id, settings);
  workspace.pickLayer(vector);
  project.addShape(rectShape(4, 4, 20, 20, MAUVE));
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup.upper.length).toBe(where === 'base' ? 0 : 1);
  const shows = (hex) => project.renderer.effective(hex, project.processParams).hex;
  for (const i of [2 * 24 + 4, 5 * 24 + 9, 9 * 24 + 19]) { // Copy takes the colors the cells show
    const look = project.storedLookAt(i % 24, Math.floor(i / 24)), cell = project.cells[i];
    expect([shows(look.fg), shows(look.bg)], `${where} ${i}`).toEqual([cell.fg.hex, cell.bg.hex]);
  }
  return halves(project).map((cell) => cell.join()).filter((cell, i) => i % 24 >= 4 && i % 24 < 20 && Math.floor(i / 24) >= 2 && Math.floor(i / 24) < 10);
}

for (const [name, settings] of [['Random', {}], ['Best match', { charChoice: 'best', chars: '▄░▒▓█', solids: 0 }], ['By shape', { charChoice: 'shape', solids: 0 }]]) {
  test(`under ${name} Ordered Dither on an upper vector layer makes the pattern the lower group makes`, async () => {
    const ordered = { ...settings, dither: 100, ditherStyle: 'bayer' };
    const lower = await squareCells('base', ordered), upper = await squareCells('edit', ordered);
    expect(new Set(lower).size).toBeGreaterThan(1); // a pattern, not one flat color
    expect(upper).toEqual(lower);
    expect(new Set(await squareCells('edit', settings)).size).toBeLessThan(new Set(upper).size);
  });
}

test('Floyd–Steinberg on an upper vector layer holds outside a drag until it ends, then shows what a full render does', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 40, rows: 40 });
  project.quantize = 'cga';
  await settle(project);
  const vector = project.addLayer('vector', 'edit');
  project.setLayerChars(vector, { dither: 100, ditherStyle: 'floyd' });
  project.commitLayerChars();
  workspace.pickLayer(vector);
  project.addShape(ellipseShape(0.5, 0.5, 39.5, 39.5, MAUVE));
  const shape = project.addShape(rectShape(4, 4, 10, 10, { fill: '#ff0000' }));
  project.commitEdit();
  await settle(project);
  expect(project.lowerGroup.upper).toEqual([vector]);
  const before = cellsKey(project);
  const inArea = (i) => i % 40 >= 3 && i % 40 <= 19 && Math.floor(i / 40) >= 1 && Math.floor(i / 40) <= 8;
  project.beginEdit();
  const start = project.shapes.get(shape);
  for (let k = 1; k <= 5; k++) {
    project.updateShapes([[shape, transformed(start, translation(1.5 * k, k))]]);
    expect(cellsKey(project).filter((c, i) => c !== before[i] && !inArea(i))).toEqual([]);
  }
  const held = cellsKey(project);
  project.commitEdit();
  await settle(project);
  const ended = cellsKey(project);
  expect(ended.filter((c, i) => c !== held[i] && !inArea(i)).length).toBeGreaterThan(0); // its error reaches past the area
  project.renderer.reset();
  project.render();
  await settle(project);
  expect(cellsKey(project)).toEqual(ended);
});

test('a document whose layers all have the base\'s Dither saves in the old form; one with its own saves as a stack and comes back', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, GRADIENT, { cols: 24, rows: 24 });
  project.quantize = 'cga';
  await settle(project);
  const vector = project.addLayer('vector', 'base');
  workspace.pickLayer(vector);
  project.addShape(rectShape(4, 4, 12, 12, MAUVE));
  project.commitEdit();
  await settle(project);
  expect(await magic(await saved(project))).toBe('PHOSPHOR');
  project.setLayerChars(vector, { dither: 70, ditherStyle: 'bayer' });
  project.commitLayerChars();
  await settle(project);
  expect(project.fitsRoom).toBe(false);
  const shown = cellsKey(project), blob = await saved(project);
  expect(await magic(blob)).toBe('PHOSPHR2');
  await project.openParts(await readProject(blob), { filename: 'own' });
  await settle(project);
  expect(dithers(project, vector)).toEqual({ ditherStyle: 'bayer', dither: 70 });
  expect(project.dither).toBe(0);
  expect(cellsKey(project)).toEqual(shown);
});
