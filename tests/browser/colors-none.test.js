// None on either side leaves what's there. A tool that would put down nothing refuses at the press and says why; a
// painted shape with the foreground None is its fill alone, in the background color; and with both None, typing and the
// tools that write characters still write them, in the colors already there, and say so.
import { test, expect, afterEach } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import { getTool } from '@/tools';
import { typeAtCursor } from '@/composables/useTextTool.js';
import { toastMessage, closeToast } from '@/composables/useToast.js';

afterEach(() => closeToast());

const RED = '#ff0000', BLUE = '#0000ff';
const FG_NONE = 'Your foreground color is None, so there’s nothing to paint. Choose a color first.';
const BG_NONE = 'Your background color is None, so there\u2019s nothing to paint. Choose a color first.';
const BOTH_NONE = 'Your foreground and background colors are both None, so there’s nothing to paint. Choose a color first.';
const KEPT = 'Your foreground and background colors are both None, so the characters keep the colors already there.';

async function drawing(view, settings = {}) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.editorTab = view;
  Object.assign(workspace, { editFgColor: RED, editBgColor: BLUE, editFgNone: true, editBgNone: false, editBrushOpacity: 100, shapeAntialias: false }, settings);
  closeToast();
  return { project, workspace, ctx: { project, workspace, view, unit: { x: 1, y: 1 } } };
}
const press = (ctx, id, pos = { x: 4, y: 4 }) => getTool(id).begin(ctx, pos, new MouseEvent('pointerdown'));
function shape(ctx, from, to) {
  const tool = getTool('shapes');
  if (!tool.begin(ctx, from)) return false;
  tool.move(ctx, from, to);
  tool.end(ctx);
  return true;
}
const hex = (p) => p && `#${[p.r, p.g, p.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

test('with the foreground None the Brush, the Pencil and the Paint Bucket paint nothing and say why, in both views', async () => {
  for (const view of ['input', 'output']) {
    const { project, ctx } = await drawing(view);
    for (const id of ['brush', 'pencil', 'bucket']) {
      closeToast();
      expect(press(ctx, id), `${view} ${id}`).toBe(false);
      expect(toastMessage.value, `${view} ${id}`).toBe(FG_NONE);
    }
    expect([project.hasPaint, project.editCells.size], view).toEqual([false, 0]);
    // With a color, the same press paints.
    ctx.workspace.editFgNone = false;
    closeToast();
    expect(press(ctx, 'brush'), view).toBe(true);
    project.commitEdit();
    expect([project.hasPaint, toastMessage.value], view).toEqual([true, null]);
  }
});

test('X on a new drawing makes the foreground None (the background starts None), and the Brush then says why it paints nothing', async () => {
  const { workspace, ctx } = await drawing('input', { editFgNone: false, editBgNone: true });
  workspace.swapColors();
  expect([workspace.editFgNone, workspace.editBgNone]).toEqual([true, false]);
  expect(press(ctx, 'brush')).toBe(false);
  expect(toastMessage.value).toBe(FG_NONE);
});

// Each way the Shape tool paints: an outline in the foreground and the inside in the background. A rectangle from grid
// pixel (4, 4) to (12, 12) has its edge at x 4 and its inside at x 8; in cells, columns 4 and 8 of line 4.
const PAINTED = [
  ['input', {}],
  ['output', { shapeDrawWith: 'half' }],
  ['output', { shapeDrawWith: 'half', shapeBlockChars: true }],
  ['output', { shapeDrawWith: 'full' }],
];
const CELLS = [
  ['full', { shapeDrawWith: 'full', shapeBlockChars: true }],
  ['vertical halves', { shapeKind: 'ellipse', shapeDrawWith: 'half', shapeVerticalHalves: true }],
];

test('with the foreground None a painted shape is its fill alone, the outline in the background color too', async () => {
  for (const [view, settings] of PAINTED) {
    const label = `${view} ${JSON.stringify(settings)}`;
    for (const fgNone of [false, true]) {
      const { project, ctx } = await drawing(view, { shapeKind: 'rect', ...settings, editFgNone: fgNone });
      expect(shape(ctx, { x: 4, y: 4 }, { x: 12, y: 12 }), label).toBe(true);
      expect(hex(project.paintLayer.pixelAt(4, 8)), `${label} edge, fg none ${fgNone}`).toBe(fgNone ? BLUE : RED);
      expect(hex(project.paintLayer.pixelAt(8, 8)), `${label} inside`).toBe(BLUE);
      expect(toastMessage.value, label).toBe(null);
    }
  }
  for (const [label, settings] of CELLS) {
    for (const fgNone of [false, true]) {
      const { project, ctx } = await drawing('output', { shapeKind: 'rect', ...settings, editFgNone: fgNone });
      expect(shape(ctx, { x: 4, y: 4 }, { x: 16, y: 16 }), label).toBe(true);
      const edge = [...project.editCells.values()].filter((e) => e.char.trim());
      expect(edge.length, label).toBeGreaterThan(0);
      expect(edge.every((e) => e.fg === (fgNone ? BLUE : RED)), `${label} edge, fg none ${fgNone}`).toBe(true);
    }
  }
});

test('with nothing to fill, a painted shape draws nothing and says why: both colors None, or a line with the foreground None', async () => {
  for (const [view, settings] of [...PAINTED, ...CELLS.map(([, s]) => ['output', s])]) {
    const label = `${view} ${JSON.stringify(settings)}`;
    const both = await drawing(view, { shapeKind: 'rect', ...settings, editBgNone: true });
    expect(shape(both.ctx, { x: 4, y: 4 }, { x: 12, y: 12 }), label).toBe(false);
    expect(toastMessage.value, label).toBe(BOTH_NONE);
    expect([both.project.hasPaint, both.project.editCells.size], label).toEqual([false, 0]);
    const line = await drawing(view, { ...settings, shapeKind: 'line' });
    expect(shape(line.ctx, { x: 4, y: 4 }, { x: 12, y: 12 }), label).toBe(false);
    expect(toastMessage.value, label).toBe(FG_NONE);
  }
});

test('with both colors None, typing, Pencil lines and a Character shape still write, in the colors already there, and say so', async () => {
  const { project, workspace, ctx } = await drawing('output', { editBgNone: true, pencilDrawWith: 'single', shapeDrawWith: 'char', activeChar: '*', shapeKind: 'rect' });
  workspace.textCursor = { col: 2, row: 2 };
  typeAtCursor(project, workspace, 'A');
  project.commitPending();
  expect(project.editCellAt(2, 2)).toMatchObject({ char: 'A' });
  expect(project.editCellAt(2, 2).fg).toBe(undefined);
  expect(toastMessage.value).toBe(KEPT);
  closeToast();
  const pencil = getTool('pencil'), from = { x: 10, y: 10 }, to = { x: 14, y: 10 };
  expect(pencil.begin(ctx, from, new MouseEvent('pointerdown'))).toBe(true);
  pencil.move(ctx, from, to);
  pencil.end(ctx);
  expect(project.editCellAt(12, 5)).toMatchObject({ char: '\u2500' });
  expect(project.editCellAt(12, 5).fg).toBe(undefined);
  expect(toastMessage.value).toBe(KEPT);
  closeToast();
  expect(shape(ctx, { x: 2, y: 12 }, { x: 8, y: 18 })).toBe(true);
  expect(project.editCellAt(2, 6)).toMatchObject({ char: '*' });
  expect(toastMessage.value).toBe(KEPT);
  // With only the foreground None, typing says nothing: the background still goes in.
  workspace.editBgNone = false;
  closeToast();
  typeAtCursor(project, workspace, 'B');
  expect(project.editCellAt(3, 2)).toMatchObject({ char: 'B', bg: BLUE });
  expect(toastMessage.value).toBe(null);
});

test('the Paint Bucket\'s Cells with only None colors lit refuses and leaves the paint under it; with Char lit too it fills the characters and says so', async () => {
  const { project, workspace, ctx } = await drawing('output', { editFgNone: false, bucketFillWith: 'normal' });
  expect(press(ctx, 'bucket')).toBe(false); // a click fills, with no stroke to continue
  expect(project.hasPaint).toBe(true);
  Object.assign(workspace, { editFgNone: true, bucketFillWith: 'cells', bucketSet: { fg: true, bg: false, char: false } });
  closeToast();
  expect(press(ctx, 'bucket')).toBe(false);
  expect(toastMessage.value).toBe(FG_NONE);
  expect([project.hasPaint, project.editCells.size]).toEqual([true, 0]);
  Object.assign(workspace, { editBgNone: true, bucketSet: { fg: false, bg: true, char: false } });
  press(ctx, 'bucket');
  expect(toastMessage.value).toBe(BG_NONE);
  workspace.bucketSet = { fg: true, bg: true, char: false };
  press(ctx, 'bucket');
  expect(toastMessage.value).toBe(BOTH_NONE);
  expect(project.editCells.size).toBe(0);
  Object.assign(workspace, { activeChar: '#', bucketSet: { fg: true, bg: true, char: true } });
  closeToast();
  press(ctx, 'bucket');
  expect(project.editCellAt(4, 2)).toMatchObject({ char: '#' }); // the cell pressed
  expect(toastMessage.value).toBe(KEPT);
  // Char alone sets no colors, so it says nothing.
  Object.assign(workspace, { activeChar: '%', bucketSet: { fg: false, bg: false, char: true } });
  closeToast();
  press(ctx, 'bucket');
  expect(project.editCellAt(4, 2)).toMatchObject({ char: '%' });
  expect(toastMessage.value).toBe(null);
});
