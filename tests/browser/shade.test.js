// Draw with: Shade (docs/model.md R16): each pass of the Pencil or the Brush steps the cells it reaches one shade on,
// ░ ▒ ▓ █ in the foreground color, or back to a space, once a stroke, as characters of someone's own.
import { test, expect, afterEach } from 'vitest';
import { createTestApp, settle } from '../support/app.js';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import { getTool } from '@/tools';
import { cellKey } from '@/document/editCells.js';
import { PALETTES } from '@/lib/ColorUtils';
import { toastMessage, closeToast } from '@/composables/useToast.js';
import { fontWith, cp437Font } from '../support/blockFonts.js';

afterEach(() => closeToast());

const RED = '#ff0000', BLUE = '#0000ff';

async function drawing({ layer = true, ...settings } = {}) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: layer, cols: 12, rows: 12 });
  await settle(project);
  workspace.editorTab = 'output';
  Object.assign(workspace, { pencilDrawWith: 'shade', brushDrawWith: 'shade', editFgColor: RED, editFgNone: false, editBgNone: true, shadeLighter: false, editBrushSize: 1 }, settings);
  const ctx = { project, workspace, view: 'output' };
  // A stroke along cells ([col, row] each), its press with event (Cmd, Shift), through getTool's begin (refusals and all).
  const stroke = (cells, { tool = 'pencil', event = {} } = {}) => {
    const t = getTool(tool), at = ([col, row]) => ({ x: col + 0.5, y: 2 * row + 0.5 });
    if (t.begin(ctx, at(cells[0]), event) === false) return false;
    for (let i = 1; i < cells.length; i++) t.move(ctx, at(cells[i - 1]), at(cells[i]));
    t.end(ctx);
    return true;
  };
  const cell = (col, row) => project.cells[row * project.cols + col];
  return { project, workspace, ctx, stroke, cell, char: (col, row) => cell(col, row).char };
}

test('R16: each stroke steps a cell one shade on, ░ ▒ ▓ █, and a █ stays; going back over it within a stroke adds nothing', async () => {
  const { project, stroke, char, cell } = await drawing();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    stroke([[2, 1], [3, 1], [2, 1], [3, 1]]); // back and forth over two cells, within the one stroke
    await settle(project);
    seen.push(char(2, 1) + char(3, 1));
  }
  expect(seen).toEqual(['░░', '▒▒', '▓▓', '██', '██']);
  expect([cell(2, 1).fg.hex, cell(2, 1).bg.hex]).toEqual([RED, '#000000']);
  const entry = project.editCellAt(2, 1);
  expect([entry.char, entry.fg, entry.bg]).toEqual(['█', RED, '#000000']); // a character of someone's own, on the layer
  // One undo step a stroke, and the stroke over a cell that's all red already leaves none.
  project.undo();
  await settle(project);
  expect(char(2, 1)).toBe('▓');
  project.undo();
  await settle(project);
  expect(char(2, 1)).toBe('▒');
});

test('R16: Lighter, or Darker with Cmd or Ctrl held at the press, steps back to a space in the background color', async () => {
  const { project, workspace, stroke, char, cell } = await drawing();
  for (let i = 0; i < 4; i++) stroke([[1, 1]]);
  await settle(project);
  expect(char(1, 1)).toBe('█');
  const way = [];
  for (const event of [{ metaKey: true }, { ctrlKey: true }]) {
    stroke([[1, 1]], { event });
    await settle(project);
    way.push(char(1, 1));
  }
  workspace.shadeLighter = true;
  stroke([[1, 1]]);
  stroke([[1, 1]]);
  await settle(project);
  way.push(char(1, 1));
  expect(way).toEqual(['▓', '▒', ' ']);
  expect(cell(1, 1).bg.hex).toBe('#000000');
  stroke([[1, 1]], { event: { metaKey: true } }); // Lighter with Cmd held: on again
  await settle(project);
  expect([char(1, 1), cell(1, 1).fg.hex]).toEqual(['░', RED]);
});

test('R16: a shade in another color starts again at ░ over what it shows: a █ its color, a ▒ its background', async () => {
  const { project, workspace, stroke, cell } = await drawing();
  project.writeEditCells([{ col: 1, row: 1, attrs: { char: '█', fg: BLUE, bg: '#000000' } }, { col: 2, row: 1, attrs: { char: '▒', fg: BLUE, bg: '#00ff00' } }, { col: 3, row: 1, attrs: { char: 'A', fg: '#ffffff', bg: '#808080' } }]);
  project.commitEdit();
  workspace.editFgColor = RED;
  stroke([[1, 1], [2, 1], [3, 1]]);
  await settle(project);
  expect([1, 2, 3].map((col) => [cell(col, 1).char, cell(col, 1).fg.hex, cell(col, 1).bg.hex])).toEqual([
    ['░', RED, BLUE], ['░', RED, '#00ff00'], ['░', RED, '#808080'],
  ]);
});

test('R16: a shade the layer\'s own paint tints steps on in the color it shows, the paint gone', async () => {
  const { project, workspace, stroke, cell } = await drawing();
  project.writeEditCells([{ col: 1, row: 1, attrs: { char: '░', fg: BLUE, bg: '#000000' } }]);
  project.commitEdit();
  project.paintStroke([{ x: 1, y: 2, alpha: 1 }, { x: 1, y: 3, alpha: 1 }], RED); // red over both halves: the ░ shows red
  project.commitEdit();
  await settle(project);
  expect([cell(1, 1).char, cell(1, 1).fg.hex]).toEqual(['░', RED]);
  workspace.editFgColor = RED;
  stroke([[1, 1]]);
  await settle(project);
  expect([cell(1, 1).char, cell(1, 1).fg.hex]).toEqual(['▒', RED]);
  expect(project.cellHasPaint(1, 1)).toBe(false);
});

test('R16: on the base the shades are pins, and a second pass reads the first under a palette and a slider, in a color off the palette', async () => {
  const { project, workspace, stroke, char } = await drawing({ layer: false });
  project.quantize = 'vga';
  project.setSlider('brightness', 120);
  await settle(project);
  workspace.pickLayer('base');
  workspace.editFgColor = '#f01010'; // not one of VGA's
  const seen = [];
  for (let i = 0; i < 3; i++) {
    stroke([[4, 2]]);
    await settle(project);
    seen.push(char(4, 2));
  }
  expect(seen).toEqual(['░', '▒', '▓']);
  expect(project.baseRecords.pins.get(cellKey(4, 2))).toBe('▓');
  stroke([[6, 2]]); // a quick double click: the second press reads the first, with no render between
  stroke([[6, 2]]);
  await settle(project);
  expect(char(6, 2)).toBe('▒');
});

test('R16: on a layer, a pass reads the shade a pin under it shows', async () => {
  const { project, workspace, stroke, char } = await drawing();
  workspace.pickLayer('base');
  stroke([[5, 3]]);
  workspace.pickLayer(project.layers[1].id);
  stroke([[5, 3]]);
  await settle(project);
  expect(char(5, 3)).toBe('▒');
  expect(project.editCellAt(5, 3)?.char).toBe('▒');
});

test('R16: the Brush reaches the cells its Size covers, hard, whatever its Hardness, and paints no paint', async () => {
  const { project, workspace, stroke } = await drawing({ editBrushSize: 1, editBrushHardness: 0, editBrushFlow: 1, editBrushOpacity: 10 });
  stroke([[5, 3]], { tool: 'brush' });
  await settle(project);
  const own = (col, row) => project.editCellAt(col, row)?.char ?? null; // the canvas's own cells show Random's characters, in their background's color
  expect([own(4, 3), own(5, 3), own(6, 3), own(5, 2), own(5, 4)]).toEqual([null, '░', null, null, null]);
  expect(project.paintLayer?.hasPaint ?? false).toBe(false);
  workspace.editBrushSize = 3;
  stroke([[8, 1]], { tool: 'brush' });
  await settle(project);
  expect([own(7, 1), own(8, 1), own(9, 1), own(6, 1), own(10, 1)]).toEqual(['░', '░', '░', null, null]);
});

test('R16: the Brush shows Darker and Lighter in place of Opacity, Flow, Hardness and Build up while it shades', async () => {
  const { workspace } = await drawing();
  const shown = () => brush.options.filter((o) => (!o.views || o.views.includes(workspace.editorTab)) && (!o.when || o.when(workspace))).map((o) => o.key);
  expect(shown()).toEqual(['editBrushSize', 'brushDrawWith', 'shadeLighter']);
  workspace.brushDrawWith = 'half';
  expect(shown()).toEqual(['editBrushSize', 'editBrushOpacity', 'editBrushFlow', 'editBrushHardness', 'editBrushStack', 'brushDrawWith']);
  workspace.brushDrawWith = 'shade';
  workspace.editorTab = 'input'; // the PIXEL view has no Draw with: the Brush paints
  expect(shown()).toEqual(['editBrushSize', 'editBrushOpacity', 'editBrushFlow', 'editBrushHardness', 'editBrushStack']);
});

test('R16: Color ASCII and Monochrome ASCII offer Shade too, the ramp the same: on black, or a █\'s color in Color ASCII', async () => {
  for (const style of ['colorAscii', 'ascii']) {
    const { project, workspace, stroke, char, cell } = await drawing();
    project.renderStyle = style;
    await settle(project);
    const option = pencil.options.find((o) => o.key === 'pencilDrawWith');
    expect(option.choices.filter((c) => !c.when || c.when(workspace)).map((c) => c.value)).toContain('shade');
    expect(option.drawn(workspace)).toBe('shade');
    const seen = [];
    for (let i = 0; i < 5; i++) {
      stroke([[2, 2]]);
      await settle(project);
      seen.push(char(2, 2));
    }
    expect(seen, style).toEqual(['░', '▒', '▓', '█', '█']);
    expect(project.paintLayer?.hasPaint ?? false).toBe(false);
    stroke([[2, 2]], { event: { metaKey: true } });
    await settle(project);
    expect(char(2, 2), style).toBe('▓');
    if (style === 'colorAscii') { // a converted cell shows on black, so the ░ has no background of its own
      expect(project.editCellAt(2, 2).bg ?? null).toBeNull();
      project.writeEditCells([{ col: 4, row: 2, attrs: { char: '█', fg: BLUE } }]);
      project.commitEdit();
      stroke([[4, 2]]);
      await settle(project);
      expect([char(4, 2), cell(4, 2).fg.hex, cell(4, 2).bg.hex]).toEqual(['░', RED, BLUE]);
    }
  }
});

test('R16: a bitmap font with no shade is refused, naming the blocks it lacks', async () => {
  const { project, stroke } = await drawing();
  project.setDrawingFont({ ...fontWith({ 219: cp437Font.bytes.slice(219 * 16, 220 * 16), 220: cp437Font.bytes.slice(220 * 16, 221 * 16) }), name: 'Plain' });
  await settle(project);
  expect(stroke([[1, 1]])).toBe(false);
  expect(project.editCellAt(1, 1)).toBeUndefined();
  expect(toastMessage.value).toContain('Plain');
  expect(toastMessage.value).toContain('Light, Medium, or Dark');
});

test('R16: without iCE colors, a shade on a bright background says it blinks, once a drawing', async () => {
  const { project, stroke } = await drawing();
  project.quantize = 'cga';
  project.sauceIceColors = false;
  await settle(project);
  const cga = PALETTES.cga;
  project.writeEditCells([{ col: 1, row: 1, attrs: { char: ' ', bg: cga[12].hex } }, { col: 2, row: 1, attrs: { char: ' ', bg: cga[12].hex } }]); // bright blue
  project.commitEdit();
  stroke([[3, 1]]);
  expect(toastMessage.value).toBeNull(); // on black
  stroke([[1, 1], [2, 1]]);
  expect(toastMessage.value).toContain('blinks');
  closeToast();
  stroke([[1, 1]]); // the next pass of the ramp says nothing more
  expect(toastMessage.value).toBeNull();
  project.setIceColors(true);
  stroke([[1, 1]]);
  expect(toastMessage.value).toBeNull();
});
