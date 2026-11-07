// Art layers drawn: a block of hand-drawn cells on the vector layer, stacked by z with the shapes. Each half shows its
// own color or, with none, what's under it; the character shows exactly as drawn where nothing is over it, and the
// converter picks where a shape stacked above it reaches the cell. A move redraws only what it touched, as a full
// render would, and a frame built for export shows it as the editor does.
import { test, expect, afterEach } from 'vitest';
import { createApp } from 'vue';
import { createTestApp, settle } from '../support/app.js';
import { outputKey } from '../support/scenes.js';
import { makeArt } from '@/document/artLayers.js';
import { rectShape, withShape } from '@/document/shapes.js';
import { shapeAt, shapesTouching } from '@/lib/shapeHits.js';
import { selectionBox } from '@/tools/vselect.js';
import VectorOverlay from '@/components/VectorOverlay.vue';
import VectorOptions from '@/components/VectorOptions.vue';
import { i18n } from '@/i18n';
import { useDrawingStore } from '@/store/DrawingStore';

const key = (cells) => cells.map((c) => `${c.char}${c.fg.hex}${c.bg.hex}${c.wide ?? ''}`);
const at = (project, col, row) => project.cells[row * project.cols + col];
const look = (cell) => ({ char: cell.char, fg: cell.fg.hex.toLowerCase(), bg: cell.bg.hex.toLowerCase() });
// One art cell at grid cell (col, row): [char, top, bottom].
const artAt = (col, row, [char, top, bottom], z = 0) => makeArt({ z, m: [1, 0, 0, 1, col, 2 * row], art: { cols: 1, rows: 1, cells: [[0, char, top, bottom]] } });
const RED_RECT = rectShape(0, 0, 20, 20, { fill: '#ff0000' });

async function blank() {
  const app = await createTestApp();
  await app.project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(app.project);
  return app;
}

async function fromScratch(project) {
  project.renderer.reset();
  project.render();
  await settle(project);
  return { output: outputKey(project), cells: key(project.cells) };
}

test('an art layer shows its characters and colors exactly where nothing is over it', async () => {
  const { project } = await blank();
  project.addShape(artAt(3, 2, ['A', '#0000ff', '#ff0000']));
  expect(look(at(project, 3, 2))).toEqual({ char: 'A', fg: '#ff0000', bg: '#0000ff' });
});

test('a missing background or foreground shows what is under it', async () => {
  const { project } = await blank();
  project.addShape(RED_RECT);
  const bare = look(at(project, 3, 2));
  const art = project.addShape(artAt(3, 2, ['A', null, '#ffffff']));
  expect(look(at(project, 3, 2))).toEqual({ char: 'A', fg: '#ffffff', bg: '#ff0000' });
  project.updateShapes([[art, artAt(3, 2, ['A', null, null], project.shapes.get(art).z)]]);
  expect(look(at(project, 3, 2))).toEqual({ char: 'A', fg: bare.fg, bg: bare.bg });
});

test('a half with no color is see-through: ▀ over a shape shows the shape in its other half', async () => {
  const { project } = await blank();
  project.addShape(RED_RECT);
  project.addShape(artAt(3, 2, ['▄', '#00ff00', null]));
  expect(look(at(project, 3, 2))).toEqual({ char: '▄', fg: '#ff0000', bg: '#00ff00' });
});

test('stacking: a shape above an art layer covers it, and the converter picks the character there', async () => {
  const { project } = await blank();
  const art = project.addShape(artAt(3, 2, ['A', '#0000ff', '#ff0000']));
  const rect = project.addShape(rectShape(2, 2, 6, 8, { fill: '#00ff00' }));
  expect(project.shapes.get(rect).z).toBeGreaterThan(project.shapes.get(art).z);
  const covered = look(at(project, 3, 2));
  expect(covered.char).not.toBe('A');
  expect([covered.fg, covered.bg]).toEqual(['#00ff00', '#00ff00']);
  project.updateShapes([[rect, withShape(project.shapes.get(rect), { z: project.shapes.get(art).z - 1 })]]);
  expect(look(at(project, 3, 2))).toEqual({ char: 'A', fg: '#ff0000', bg: '#0000ff' });
  // A shape below the art, reaching cells the art leaves alone, still has the converter pick there.
  expect(at(project, 4, 2).char).not.toBe('A');
});

test('two art layers: the upper one\'s character wins, the lower one shows through its see-through halves', async () => {
  const { project } = await blank();
  project.addShape(artAt(3, 2, ['A', '#0000ff', '#ff0000']));
  project.addShape(artAt(3, 2, ['B', null, '#00ff00']));
  expect(look(at(project, 3, 2))).toEqual({ char: 'B', fg: '#00ff00', bg: '#0000ff' });
  // A cell of the upper one with no character of its own keeps the lower one's.
  project.addShape(artAt(3, 2, [null, '#ffffff', null]));
  expect(look(at(project, 3, 2))).toEqual({ char: 'B', fg: '#00ff00', bg: '#ffffff' });
});

test('an art layer past the canvas edge draws what is on it, and all of it once moved back', async () => {
  const { project } = await blank();
  const cells = [...'WXYZ'].map((char, i) => [i, char, '#0000ff', '#ffffff']);
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 18, 4], art: { cols: 4, rows: 1, cells } }));
  expect([18, 19].map((col) => at(project, col, 2).char)).toEqual(['W', 'X']);
  project.updateShapes([[art, withShape(project.shapes.get(art), { m: [1, 0, 0, 1, 0, 4] })]]);
  expect([0, 1, 2, 3].map((col) => at(project, col, 2).char)).toEqual(['W', 'X', 'Y', 'Z']);
  expect([18, 19].map((col) => at(project, col, 2).char)).not.toContain('W');
  expect([18, 19].map((col) => at(project, col, 2).char)).not.toContain('X');
});

test('moving an art layer redraws exactly the cells it left and the ones it reached', async () => {
  const { project } = await blank();
  project.addShape(rectShape(4, 2, 12, 12, { fill: '#ff0000' }));
  const cells = [[0, 'A', '#0000ff', null], [1, '▄', null, '#00ff00'], [2, 'Ｗ', '#ffffff', '#000000'], [5, 'C', null, null]];
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 2], art: { cols: 4, rows: 2, cells } }));
  project.updateShapes([[art, withShape(project.shapes.get(art), { m: [1, 0, 0, 1, 7, 6] })]]);
  expect(at(project, 9, 3)).toMatchObject({ char: 'Ｗ', wide: 'lead' });
  expect(at(project, 10, 3)).toMatchObject({ wide: 'trail' });
  const partial = { output: outputKey(project), cells: key(project.cells) };
  expect(await fromScratch(project)).toEqual(partial);
});

// Shades only (no half block): a cell the converter picks takes colors of its own, an art cell its halves'.
for (const charChoice of ['best', 'shape']) test(`under ${charChoice === 'best' ? 'Best match' : 'By shape'}, an art character shows exactly where art is topmost and the converter picks elsewhere`, async () => {
  const { project } = await blank();
  Object.assign(project, { quantize: 'cga', charChoice, chars: '░▒▓', solids: 0 });
  await settle(project);
  const rect = project.addShape(rectShape(0, 0, 10, 20, { fill: '#aa0000' }));
  const bare = look(at(project, 4, 2));
  project.addShape(artAt(3, 2, ['A', '#0000aa', '#55ff55']));
  expect(look(at(project, 3, 2))).toEqual({ char: 'A', fg: '#55ff55', bg: '#0000aa' });
  expect(look(at(project, 4, 2))).toEqual(bare);
  const same = async () => {
    const partial = { output: outputKey(project), cells: key(project.cells) };
    expect(await fromScratch(project)).toEqual(partial);
  };
  await same(); // a full render's cells (cellsFromOutput) too
  expect(look(at(project, 3, 2))).toEqual({ char: 'A', fg: '#55ff55', bg: '#0000aa' });
  project.updateShapes([[rect, withShape(project.shapes.get(rect), { z: 10 })]]);
  expect(at(project, 3, 2).char).not.toBe('A');
  await same();
});

test('a wide art character in the last column has no room for its trail: it shows as a space there, as a pinned one does', async () => {
  const { project } = await blank();
  project.addShape(artAt(19, 2, ['Ｗ', '#0000ff', '#ffffff']));
  expect(look(at(project, 19, 2))).toEqual({ char: ' ', fg: '#ffffff', bg: '#0000ff' });
  expect(at(project, 19, 2).wide).toBeUndefined();
});

test('a frame built for export shows an art layer as the editor does', async () => {
  const { project } = await blank();
  project.setAnimate(true);
  project.addShape(RED_RECT);
  project.addShape(artAt(3, 2, ['A', '#0000ff', null]));
  project.addShape(artAt(5, 2, ['Ｗ', null, '#ffffff']));
  project.addFrame('blank');
  project.showFrame(0);
  await settle(project);
  const [frame] = await project.animationCells();
  expect(key(frame)).toEqual(key(project.cells));
  expect(at(project, 3, 2).char).toBe('A');
});

let mounted = null;
afterEach(() => { mounted?.unmount(); mounted = null; });

test('an art layer selected in VECTOR draws its box, and hits and marquees pass over it without throwing', async () => {
  const { project, workspace } = await blank();
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 4], art: { cols: 3, rows: 2, cells: [[0, 'A', '#0000ff', '#ff0000']] } }));
  Object.assign(workspace, { editorTab: 'vector', activeTool: 'vselect', vectorSelected: [art] });
  const box = selectionBox(project.shapes, [art]);
  expect(box.corners).toEqual([{ x: 2, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 8 }, { x: 2, y: 8 }]);
  expect(() => shapeAt(project.shapes, 3, 5, 1)).not.toThrow();
  expect(shapesTouching(project.shapes, { x0: 0, y0: 0, x1: 10, y1: 10 })).toEqual([art]);
  const host = document.createElement('div');
  mounted = createApp(VectorOverlay, { unit: { x: 8, y: 8 } });
  mounted.mount(host);
  await settle(project);
  expect(host.querySelector('[data-vector-overlay] polygon.box')).not.toBeNull();
});

test('in a room, an art layer someone else is drawing in shows its box saying who, and Edit art is off with it', async () => {
  const { project, workspace } = await blank();
  const art = project.addShape(makeArt({ m: [1, 0, 0, 1, 2, 4], art: { cols: 3, rows: 2, cells: [[0, 'A', '#0000ff', '#ff0000']] } }));
  Object.assign(workspace, { editorTab: 'vector', activeTool: 'vselect', vectorSelected: [art] });
  const drawing = useDrawingStore();
  drawing.cursors = { ann: { at: null, view: null, name: 'Ann', inside: art } };
  expect(project._locks).toEqual({ ann: art });
  const host = document.createElement('div'), row = document.createElement('div');
  mounted = createApp(VectorOverlay, { unit: { x: 8, y: 8 } });
  mounted.mount(host);
  const options = createApp(VectorOptions).use(i18n);
  options.mount(row);
  await settle(project);
  expect(host.querySelector(`[data-locked="${art}"] text`).textContent).toBe('Ann is drawing in this layer');
  const edit = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit art');
  expect(edit.disabled).toBe(true);
  expect(edit.title).toBe('Ann is drawing in this layer');
  drawing.cursors = { ann: { at: null, view: null, name: 'Ann', inside: null } }; // stepped out
  await settle(project);
  expect(host.querySelector('[data-locked]')).toBeNull();
  expect(edit.disabled).toBe(false);
  options.unmount();
});
