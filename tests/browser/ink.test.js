// Draw with: Ink only (docs/model.md R17): Set FG along a stroke. Each cell the Pencil or the Brush reaches that shows a
// character with ink to tint (R2) takes the foreground color, its character and background kept; every other cell is
// left alone.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import { getTool } from '@/tools';
import { cellKey } from '@/document/editCells.js';
import { opensToPaint } from '@/lib/Cells.js';
import { rectShape } from '@/document/shapes.js';

const RED = '#ff0000', BLUE = '#0000aa', WHITE = '#ffffff';

const toolsOn = (workspace, settings) => Object.assign(workspace, {
  editorTab: 'output', pencilDrawWith: 'ink', brushDrawWith: 'ink', editFgColor: RED, editFgNone: false, editBgNone: true, editBrushSize: 1,
}, settings);

// A stroke along cells ([col, row] each), through getTool's begin (refusals and all).
const strokeWith = (ctx) => (cells, { tool = 'pencil' } = {}) => {
  const t = getTool(tool), at = ([col, row]) => ({ x: col + 0.5, y: 2 * row + 0.5 });
  if (t.begin(ctx, at(cells[0]), {}) === false) return false;
  for (let i = 1; i < cells.length; i++) t.move(ctx, at(cells[i - 1]), at(cells[i]));
  t.end(ctx);
  return true;
};

async function drawing({ layer = true, ...settings } = {}) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: layer, cols: 12, rows: 12 });
  await settle(project);
  toolsOn(workspace, settings);
  const ctx = { project, workspace, view: 'output' };
  const cell = (col, row) => project.cells[row * project.cols + col];
  const look = (col, row) => [cell(col, row).char, cell(col, row).fg.hex, cell(col, row).bg.hex];
  return { project, workspace, ctx, stroke: strokeWith(ctx), cell, look };
}

// A converted photo (CGA, Best match, contrast moved), as Set FG's tests have it: what shows is more than two pixels.
async function photo(style = 'ansi') {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 30, rows: 30 });
  Object.assign(project, { quantize: 'cga', charChoice: 'best', contrast: 130, renderStyle: style });
  project.render();
  await settle(project);
  toolsOn(workspace, { editFgColor: '#ff00ff' });
  const ctx = { project, workspace, view: 'output' };
  const row = (r, c0, c1) => Array.from({ length: c1 - c0 + 1 }, (_, i) => project.cells[r * project.cols + c0 + i]).map(({ char, fg, bg }) => ({ char, fg: fg.hex.toLowerCase(), bg: bg.hex.toLowerCase() }));
  return { project, workspace, ctx, stroke: strokeWith(ctx), row };
}
const PINK_IN_CGA = '#ff55ff';
const ROW = 4, FROM = 3, TO = 14;
const along = () => Array.from({ length: TO - FROM + 1 }, (_, i) => [FROM + i, ROW]);

test('R17: on a layer a letter and a shade take the foreground, their character and background kept; a space, a character in its own background, a solid or half block and a blank cell stay; one undo step', async () => {
  const { project, stroke, look } = await drawing();
  project.writeEditCells([
    { col: 1, row: 1, attrs: { char: 'A', fg: WHITE, bg: BLUE } },
    { col: 2, row: 1, attrs: { char: ' ', fg: WHITE, bg: BLUE } },
    { col: 3, row: 1, attrs: { char: 'B', fg: BLUE, bg: BLUE } },
    { col: 4, row: 1, attrs: { char: '█', fg: WHITE, bg: BLUE } },
    { col: 5, row: 1, attrs: { char: '▀', fg: WHITE, bg: BLUE } },
    { col: 6, row: 1, attrs: { char: '░', fg: WHITE, bg: BLUE } },
  ]);
  project.commitEdit();
  await settle(project);
  const before = [1, 2, 3, 4, 5, 6, 7].map((col) => look(col, 1));
  stroke([[1, 1], [7, 1]]);
  await settle(project);
  expect([1, 2, 3, 4, 5, 6, 7].map((col) => look(col, 1))).toEqual([['A', RED, BLUE], before[1], before[2], before[3], before[4], ['░', RED, BLUE], before[6]]);
  expect(project.editCellAt(7, 1)).toBe(undefined); // the blank canvas's cell: nothing written
  expect(project.paintLayer?.hasPaint ?? false).toBe(false);
  project.undo();
  await settle(project);
  expect([1, 2, 3, 4, 5, 6, 7].map((col) => look(col, 1))).toEqual(before);
});

test('R17: a letter the layer\'s paint tints keeps the background the paint gave it, the paint gone into the cell', async () => {
  const { project, stroke, look } = await drawing();
  project.writeEditCells([{ col: 2, row: 2, attrs: { char: 'A', fg: WHITE, bg: BLUE } }]);
  project.commitEdit();
  project.paintStroke([{ x: 2, y: 4, alpha: 1 }], '#00aa00'); // the top half: the letter's background
  project.commitEdit();
  await settle(project);
  stroke([[2, 2]]);
  await settle(project);
  expect(look(2, 2)).toEqual(['A', RED, '#00aa00']);
  expect(project.cellHasPaint(2, 2)).toBe(false);
});

test('R17: a frozen cell and a laid one become characters of their own, unmarked, in the new color', async () => {
  const { project, stroke } = await drawing();
  project.paintEditPixels([6, 7].map((y) => ({ x: 2, y, r: 255, g: 255, b: 255, alpha: 1 }))); // what Merge down froze
  project.commitEdit();
  project.setEditCells(new Map([...project.editCells,
    ['2,3', Object.freeze({ char: '%', fg: WHITE, bg: '#000000', frozen: true })],
    ['3,3', Object.freeze({ char: '▌', fg: WHITE, bg: '#000000', laid: true })],
  ]), ['2,3', '3,3']);
  project.commitEdit();
  project.render();
  await settle(project);
  stroke([[2, 3], [3, 3]]);
  await settle(project);
  expect(project.editCellAt(2, 3)).toEqual({ char: '%', fg: RED, bg: '#000000' });
  expect(project.editCellAt(3, 3)).toEqual({ char: '▌', fg: RED, bg: '#000000' });
});

for (const on of ['base', 'layer']) {
  test(`R17: on the ${on}, the converter's cells that show a character take the foreground as Set FG gives it, and the rest stay as they show`, async () => {
    const { project, workspace, stroke, row } = await photo();
    if (on === 'base') workspace.pickLayer('base'); // the photo comes with a layer, picked
    const before = row(ROW, FROM, TO);
    const inked = before.map((cell) => !opensToPaint({ char: cell.char, fg: { hex: cell.fg }, bg: { hex: cell.bg } }, 'ansi'));
    expect(inked.filter(Boolean).length).toBeGreaterThan(2); // the photo has letters and shades there
    stroke(along());
    project.render();
    await settle(project);
    expect(row(ROW, FROM, TO)).toEqual(before.map((cell, i) => (inked[i] ? { ...cell, fg: PINK_IN_CGA } : cell)));
    const keys = along().map(([col, r]) => cellKey(col, r)), held = on === 'base' ? project.baseRecords.pins : project.editCells;
    expect(keys.map((key) => held.has(key))).toEqual(inked); // pinned on the base, the layer's own on a layer
    expect(workspace.editorTab).toBe('output');
  });
}

test('R17: in Color ASCII a converted cell keeps showing on black, on the base or a layer, and a pin that shows a background keeps it', async () => {
  for (const on of ['base', 'layer']) {
    const { project, workspace, stroke, row } = await photo('colorAscii');
    if (on === 'base') workspace.pickLayer('base');
    const before = row(ROW, FROM, TO);
    stroke(along());
    project.render();
    await settle(project);
    const after = row(ROW, FROM, TO);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].char, `${on} ${i}`).toBe(before[i].char);
      expect(after[i].bg, `${on} ${i}`).toBe(before[i].bg);
      if (before[i].char.trim()) expect(after[i].fg, `${on} ${i}`).toBe(PINK_IN_CGA);
    }
  }
  // A pin with a background of its own (R8: two pixels that differ), on the base and in a layer's cell.
  const { project: p2, workspace, stroke: s2, look } = await drawing({ layer: false });
  p2.renderStyle = 'colorAscii';
  workspace.pickLayer('base');
  p2.writeEditCells([{ col: 3, row: 3, attrs: { char: 'A', fg: WHITE, bg: BLUE } }]);
  p2.commitEdit();
  await settle(p2);
  expect(look(3, 3)).toEqual(['A', WHITE, BLUE]);
  s2([[3, 3]]);
  await settle(p2);
  expect(look(3, 3)).toEqual(['A', RED, BLUE]);
});

test('R17: Monochrome ASCII has no Ink only: the menu leaves it out and the Pencil and Brush draw Colors only', async () => {
  const { project, workspace, stroke } = await drawing();
  for (const tool of [pencil, brush]) {
    const option = tool.options.find((o) => o.drawWith);
    const offered = () => option.choices.filter((c) => !c.when || c.when(workspace)).map((c) => c.value);
    expect(offered().slice(-2), tool.id).toEqual(['ink', 'shade']); // after Half-block, before Shade
    project.renderStyle = 'ascii';
    expect(offered(), tool.id).not.toContain('ink');
    expect(option.drawn(workspace), tool.id).toBe('normal');
    project.renderStyle = 'colorAscii';
    expect(offered(), tool.id).toContain('ink');
    expect(option.drawn(workspace), tool.id).toBe('ink');
    project.renderStyle = 'ansi';
  }
  project.renderStyle = 'ascii';
  await settle(project);
  stroke([[2, 2]]);
  expect(project.paintLayer.hasPaint).toBe(true);
});

test('R17: the Brush reaches the cells its Size covers, hard, paints no paint, and shows no Opacity, Flow, Hardness or Build up', async () => {
  const { project, workspace, stroke, look } = await drawing({ editBrushHardness: 0, editBrushFlow: 1, editBrushOpacity: 10 });
  project.writeEditCells([4, 5, 6].map((col) => ({ col, row: 3, attrs: { char: 'x', fg: WHITE, bg: BLUE } })).concat([{ col: 5, row: 2, attrs: { char: 'x', fg: WHITE, bg: BLUE } }]));
  project.commitEdit();
  stroke([[5, 3]], { tool: 'brush' });
  await settle(project);
  expect([look(4, 3), look(5, 3), look(6, 3), look(5, 2)].map(([, fg]) => fg)).toEqual([WHITE, RED, WHITE, WHITE]);
  expect(project.paintLayer?.hasPaint ?? false).toBe(false);
  const shown = () => brush.options.filter((o) => (!o.views || o.views.includes(workspace.editorTab)) && (!o.when || o.when(workspace))).map((o) => o.key);
  expect(shown()).toEqual(['editBrushSize', 'brushDrawWith']);
  workspace.editorTab = 'input'; // the PIXEL view has no Draw with: the Brush paints
  expect(shown()).toEqual(['editBrushSize', 'editBrushOpacity', 'editBrushFlow', 'editBrushHardness', 'editBrushStack']);
});

test('R17: a cell a layer above shows is left alone: the stroke judges what shows, and what shows isn\'t the picked layer\'s', async () => {
  const { project, workspace, stroke, look } = await drawing();
  const upper = project.addLayer('cells', 'edit');
  workspace.pickLayer(upper);
  project.writeEditCells([{ col: 3, row: 1, attrs: { char: 'A', fg: WHITE, bg: BLUE } }]);
  project.commitEdit();
  workspace.pickLayer('edit');
  project.writeEditCells([{ col: 4, row: 1, attrs: { char: 'B', fg: WHITE, bg: BLUE } }]);
  project.commitEdit();
  await settle(project);
  const version = project.history.version;
  stroke([[3, 1]]);
  await settle(project);
  expect(project.editCellAt(3, 1)).toBe(undefined); // nothing written under the A
  expect(look(3, 1)).toEqual(['A', WHITE, BLUE]);
  expect(project.history.version).toBe(version); // and no undo step spent
  stroke([[4, 1]]); // its own letter, which nothing covers, takes it
  await settle(project);
  expect(look(4, 1)).toEqual(['B', RED, BLUE]);
  workspace.pickLayer('base'); // on the base, under both layers' letters: no pin
  stroke([[3, 1], [4, 1]]);
  await settle(project);
  expect([project.baseRecords.pins.has(cellKey(3, 1)), project.baseRecords.pins.has(cellKey(4, 1))]).toEqual([false, false]);
});

test('R17: a cell a vector layer under the picked layer reaches is left alone', async () => {
  const { project, workspace, stroke, cell } = await drawing();
  const vector = project.addLayer('vector', 'edit'), top = project.addLayer('cells', vector);
  project.addShape({ ...rectShape(2, 2, 6, 6, { fill: '#ff8800', stroke: '#00ff00', width: 1 }), layer: vector });
  workspace.pickLayer(top);
  await settle(project);
  const reached = [];
  for (let col = 1; col < 9; col++) for (let row = 0; row < 5; row++) if (project._upperShapes.get(vector)?.charAt(col, row) !== undefined && !opensToPaint(cell(col, row), 'ansi')) reached.push([col, row]);
  expect(reached.length).toBeGreaterThan(0); // the shape shows characters there
  const before = reached.map(([col, row]) => cell(col, row).char + cell(col, row).fg.hex);
  stroke(reached);
  await settle(project);
  expect(project.editCells.size).toBe(0);
  expect(reached.map(([col, row]) => cell(col, row).char + cell(col, row).fg.hex)).toEqual(before);
});
