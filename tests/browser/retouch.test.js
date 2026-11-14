// Retouch: Blur, Dodge and Burn change the colors that show. In the pixel view each grid pixel's, as paint; in the ANSI
// view each cell's, keeping its character. A stroke is one undo step and stays inside a selection.
import { test, expect } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { blur, dodge, burn } from '@/tools/retouch';
import { getTool } from '@/tools';
import { hex2rgb } from '@/lib/ColorUtils';

async function blank(view = 'input') {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  workspace.editorTab = view;
  Object.assign(workspace, { retouchSize: 4, retouchStrength: 100, retouchHardness: 100, retouchRange: 'midtones' });
  return { project, workspace, ctx: { project, workspace, view } };
}
function stroke(tool, ctx, from, to = from) {
  getTool(tool.id).begin(ctx, from, {});
  tool.move(ctx, from, to);
  tool.end(ctx);
}
const paintAt = (project, x, y) => { const p = project.paintLayer?.pixelAt(x, y); return p ? [p.r, p.g, p.b] : null; };
function paintGray(project, value = 128, x0 = 0, x1 = 19) {
  const pixels = [];
  for (let y = 0; y < 20; y++) for (let x = x0; x <= x1; x++) pixels.push({ x, y, r: value, g: value, b: value, alpha: 1 });
  project.paintEditPixels(pixels);
  project.commitEdit();
}

test('the toolbar offers them in the pixel and ANSI views, by R, O and Shift+O', () => {
  expect([blur, dodge, burn].map((tool) => [tool.id, tool.keys, tool.views])).toEqual([
    ['blur', ['R'], ['input', 'output']], ['dodge', ['O'], ['input', 'output']], ['burn', ['Shift+O'], ['input', 'output']],
  ]);
  expect(getTool('dodge')).toBe(dodge);
});

test('pixel view: Dodge lightens and Burn darkens what shows, each stroke one undo step', async () => {
  const { project, ctx } = await blank();
  paintGray(project);
  stroke(dodge, ctx, { x: 10, y: 10 });
  const [light] = paintAt(project, 10, 10);
  expect(light).toBeGreaterThan(180);
  expect(paintAt(project, 2, 2)).toEqual([128, 128, 128]); // out of the brush's reach
  project.undo();
  expect(paintAt(project, 10, 10)).toEqual([128, 128, 128]);
  stroke(burn, ctx, { x: 10, y: 10 });
  expect(paintAt(project, 10, 10)[0]).toBeLessThan(70);
});

test('going over a spot again in one stroke adds nothing; another stroke does', async () => {
  const { project, workspace, ctx } = await blank();
  workspace.retouchStrength = 40;
  paintGray(project);
  getTool('dodge').begin(ctx, { x: 10, y: 10 }, {});
  dodge.move(ctx, { x: 10, y: 10 }, { x: 14, y: 10 });
  dodge.move(ctx, { x: 14, y: 10 }, { x: 10, y: 10 });
  dodge.end(ctx);
  const once = paintAt(project, 10, 10)[0];
  expect(once).toBeGreaterThan(128);
  stroke(dodge, ctx, { x: 10, y: 10 });
  expect(paintAt(project, 10, 10)[0]).toBeGreaterThan(once);
});

test('pixel view: Blur softens an edge', async () => {
  const { project, ctx } = await blank();
  paintGray(project, 0, 0, 9);
  paintGray(project, 255, 10, 19);
  stroke(blur, ctx, { x: 10, y: 10 });
  const [left] = paintAt(project, 9, 10), [right] = paintAt(project, 10, 10);
  expect(left).toBeGreaterThan(0);
  expect(right).toBeLessThan(255);
});

test('ANSI view: Dodge recolors a cell\'s character and background, and the character stays', async () => {
  const { project, ctx } = await blank('output');
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: 'A', fg: '#808080', bg: '#606060' } }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 });
  const cell = project.editCellAt(5, 5);
  expect(cell.char).toBe('A');
  expect(hex2rgb(cell.fg).r).toBeGreaterThan(0x80);
  expect(hex2rgb(cell.bg).r).toBeGreaterThan(0x60);
});

test('ANSI view: Blur by a colored cell leaves a cell that shows no character showing none', async () => {
  const { project, ctx } = await blank('output');
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: 'A', fg: '#ff0000', bg: '#0000ff' } }]);
  project.commitEdit();
  stroke(blur, ctx, { x: 6.5, y: 11 });
  const next = project.editCellAt(6, 5);
  expect(next.fg).toBe(next.bg);
  expect(next.bg).not.toBe('#000000'); // the blue around it came in
  expect(project.editCellAt(5, 5).char).toBe('A');
});

test('a selection keeps the stroke inside it', async () => {
  const { project, workspace, ctx } = await blank();
  paintGray(project);
  workspace.selection = { c0: 0, r0: 0, c1: 9, r1: 19 };
  stroke(dodge, ctx, { x: 10, y: 10 });
  expect(paintAt(project, 9, 10)[0]).toBeGreaterThan(128);
  expect(paintAt(project, 10, 10)).toEqual([128, 128, 128]);
});

test('with the base picked it changes the base\'s own pixels', async () => {
  const { project, workspace, ctx } = await blank();
  workspace.pickLayer('base');
  workspace.retouchRange = 'shadows';
  stroke(dodge, ctx, { x: 10, y: 10 });
  expect(project.baseColorAt(10, 10)).toBe('#808080'); // black, halfway to white
  expect(paintAt(project, 10, 10)).toBeNull();
});

test('ANSI view: a cell the stroke doesn\'t change is left as it is, its 256-color index too', async () => {
  const { project, ctx } = await blank('output');
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: 'A', fg: '#ffffff', fgIndex: 231, bg: '#000000', bgIndex: 16 } }]);
  project.commitEdit();
  stroke(dodge, ctx, { x: 5.5, y: 11 }); // Midtones: black and white stay
  expect(project.editCellAt(5, 5)).toEqual({ char: 'A', fg: '#ffffff', fgIndex: 231, bg: '#000000', bgIndex: 16 });
  expect(project.editCellAt(4, 5)).toBeUndefined(); // the blank canvas's black, untouched
});
