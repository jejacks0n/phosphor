// Fills and the Magic Wand read the grid as the PIXEL view shows it (docs/model.md R11): a character of someone's own as
// it looks at half-cell scale, not its two stored pixels, and with All layers on the characters typed on the layers
// above as the Overlay draws them. What a fill writes is still paint.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { font8Text } from '../support/blockFonts.js';
import { useBitmapCoverage } from '@/lib/GlyphCoverage.js';
import bucket from '@/tools/bucket';
import wand from '@/tools/wand';

// A block of one character over columns 4–11, lines 3–8 of the base: grid pixels x 4–11, y 6–17, 96 pixels.
async function block(char, fg, bg) {
  const { project, workspace } = await createTestApp();
  await project.setDrawingFont(font8Text);
  useBitmapCoverage(font8Text); // a character's look is measured in the drawing's font, as App.vue has it
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 24 });
  const cells = [];
  for (let row = 3; row <= 8; row++) for (let col = 4; col <= 11; col++) cells.push({ col, row, char, fg, bg });
  project.writeBaseCells(cells);
  project.commitEdit();
  await settle(project);
  workspace.pickLayer('edit');
  Object.assign(workspace, { editFgColor: '#00ffff', editFillTolerance: 0, editFillContiguous: true, editFillAllLayers: true });
  return { project, workspace };
}

const ev = { stopPropagation() {} };
async function fill(app, view, x = 7.5, y = 10.5) {
  bucket.begin({ project: app.project, workspace: app.workspace, view }, { x, y }, ev);
  await settle(app.project);
}
const painted = (project) => {
  let n = 0;
  for (let y = 0; y < project.rows; y++) for (let x = 0; x < project.cols; x++) if (project.paintLayer?.colorAt(x, y)) n++;
  return n;
};
const insideBlock = (x, y) => x >= 4 && x < 12 && y >= 6 && y < 18;

test('R11: spaces whose foreground isn\'t their background (022.xb) fill whole, in the PIXEL view and the ANSI view', async () => {
  const counts = {};
  for (const view of ['input', 'output']) {
    const app = await block(' ', '#000000', '#ff0000');
    await fill(app, view);
    counts[view] = painted(app.project);
  }
  expect(counts).toEqual({ input: 96, output: 96 });
});

test('R11: a ░, a letter and a █ fill whole and never leak onto the canvas under them', async () => {
  const counts = {};
  for (const [char, fg, bg] of [['░', '#ff0000', '#000000'], ['A', '#ffffff', '#0000ff'], ['█', '#00ff00', '#000000']]) {
    const app = await block(char, fg, bg);
    await fill(app, 'input');
    counts[char] = painted(app.project);
  }
  expect(counts).toEqual({ '░': 96, A: 96, '█': 96 });
});

test('R11: a ▀ fills its top halves, as it looks (Contiguous off)', async () => {
  const app = await block('▀', '#ffff00', '#0000ff');
  app.workspace.editFillContiguous = false;
  await fill(app, 'input');
  const at = [];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 20; x++) if (app.project.paintLayer?.colorAt(x, y)) at.push([x, y]);
  expect(at).toHaveLength(48);
  expect(at.every(([x, y]) => insideBlock(x, y) && y % 2 === 0)).toBe(true);
});

test('R11: on the base with All layers off, a fill reads the base\'s own look', async () => {
  const app = await block('░', '#ff0000', '#000000');
  Object.assign(app.workspace, { editFillAllLayers: false });
  app.workspace.pickLayer('base');
  await fill(app, 'input');
  let cyan = 0;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 20; x++) {
    const p = app.project.baseLayer.pixelAt(x, y);
    if (p && p.r === 0 && p.g === 255 && p.b === 255) cyan++;
  }
  expect(cyan).toBe(96);
});

test('R11: with All layers on a fill on the base stops at characters typed on a layer above, even with the Overlay at 0; off, it runs under them', async () => {
  for (const [all, under] of [[true, null], [false, [0, 255, 255]]]) { // null: the base has nothing of its own there
    const { project, workspace } = await block(' ', '#000000', '#000000'); // a black block on the black canvas
    workspace.ansiOverlay = 0;
    for (let col = 4; col < 8; col++) project.typeAt(col, 1, '▓', { fg: '#ffffff', bg: '#000000' }); // on Layer 1: grid pixels y 2 and 3
    project.commitEdit();
    await settle(project);
    Object.assign(workspace, { editFillAllLayers: all });
    workspace.pickLayer('base');
    await fill({ project, workspace }, 'input', 1.5, 0.5);
    const rgb = (x, y) => { const p = project.baseLayer.pixelAt(x, y); return p && [p.r, p.g, p.b]; };
    expect(rgb(1, 0), String(all)).toEqual([0, 255, 255]);
    expect([rgb(5, 2), rgb(5, 3)], String(all)).toEqual([under, under]);
  }
});

test('R11: the Magic Wand in the PIXEL view selects what the fill fills', async () => {
  const { project, workspace } = await block(' ', '#000000', '#ff0000');
  Object.assign(workspace, { wandTolerance: 0, wandContiguous: true });
  wand.begin({ project, workspace, view: 'input' }, { x: 7.5, y: 10.5 }, {});
  expect(workspace.wand.mask.reduce((n, v) => n + (v ? 1 : 0), 0)).toBe(96);
});

// A layer not in use waits outside what Vue follows, so a change heard on it (a room's) must still reach the read.
test('R11: a character that lands on a layer not in use (a room\'s change, heard) is in what a fill reads', async () => {
  const { project, workspace } = await block(' ', '#000000', '#000000');
  workspace.pickLayer(project.addLayer('cells', 'edit'));
  await settle(project);
  const at = (seen) => [...seen.data.slice(4 * (20 * 20 + 15), 4 * (20 * 20 + 15) + 3)]; // grid pixel (15, 20): cell 15, 10
  expect(at(project.pixelsAsSeen())).toEqual([0, 0, 0]);
  project.applyChange({ cells: [['15,10', { char: '█', fg: '#ff0000', bg: '#ff0000' }]], runs: [] }); // on Layer 1
  await settle(project);
  expect(project.cells[10 * 20 + 15].char).toBe('█');
  expect(at(project.pixelsAsSeen())).toEqual([255, 0, 0]);
});
