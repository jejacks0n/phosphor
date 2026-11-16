// The Pencil's and Brush's Half-block (ANSI view): each cell they paint becomes a real ▄ (the
// paint colors its halves) instead of the paint showing through the cell's own character. Erasing
// that paint in the Pixel view gives the cell its generated character back.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import { ellipseShape } from '@/document/shapes.js';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import eraser from '@/tools/eraser';

async function scene(settings = {}) {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(workspace, { editFgColor: '#ff0000', pencilDrawWith: 'half', brushDrawWith: 'half', editBrushSize: 3 }, settings);
  const use = (tool, view, points) => {
    const ctx = { project, workspace, view };
    tool.begin(ctx, points[0], {});
    for (let i = 1; i < points.length; i++) tool.move(ctx, points[i - 1], points[i]);
    tool.end(ctx);
  };
  const charAt = (col, row) => project.cells[cellIndex(col, row, project.cols)].char;
  return { project, workspace, use, charAt };
}

test('with Half-block, the Pencil and Brush make each cell they paint a ▄; without, the cell keeps its character', async () => {
  const { use, charAt } = await scene();
  const before = charAt(10, 5);
  use(pencil, 'output', [{ x: 10.5, y: 10.5 }]);
  expect(charAt(10, 5)).toBe('▄');
  use(brush, 'output', [{ x: 20.5, y: 10.5 }, { x: 24.5, y: 10.5 }]);
  for (let col = 20; col <= 24; col++) expect(charAt(col, 5)).toBe('▄');

  const off = await scene({ pencilDrawWith: 'normal', brushDrawWith: 'normal' });
  off.use(pencil, 'output', [{ x: 10.5, y: 10.5 }]);
  expect(off.charAt(10, 5)).toBe(before);
});

test('erasing that paint in the Pixel view brings the cell\'s own character back; half of it, the ▄ stays', async () => {
  const { use, charAt, workspace } = await scene();
  const before = [charAt(10, 5), charAt(12, 5)];
  use(pencil, 'output', [{ x: 10.5, y: 10.5 }, { x: 12.5, y: 10.5 }]); // pixel row 10: the top half of cell row 5
  use(pencil, 'output', [{ x: 12.5, y: 11.5 }]);                      // and the bottom half of cell (12, 5)
  workspace.editEraserSize = 1;
  use(eraser, 'input', [{ x: 10.5, y: 10.5 }]);  // all of (10, 5)'s paint
  use(eraser, 'input', [{ x: 12.5, y: 10.5 }]);  // half of (12, 5)'s
  expect(charAt(10, 5)).toBe(before[0]);
  expect(charAt(12, 5)).toBe('▄');
  use(eraser, 'input', [{ x: 12.5, y: 11.5 }]);  // the rest
  expect(charAt(12, 5)).toBe(before[1]);
});

test('a ▄ typed in Edit Mode (it has its own colors) stays when the paint over it is erased', async () => {
  const { project, use, charAt, workspace } = await scene({ pencilDrawWith: 'normal', brushDrawWith: 'normal' });
  project.typeAt(15, 5, '▄', { fg: '#ffffff' });
  project.commitEdit();
  use(pencil, 'input', [{ x: 15.5, y: 10.5 }]);
  workspace.editEraserSize = 1;
  use(eraser, 'input', [{ x: 15.5, y: 10.5 }]);
  expect(charAt(15, 5)).toBe('▄');
});

test('a Shift-click line in Half-block makes each cell along it a ▄', async () => {
  const { project, workspace, charAt } = await scene();
  const ctx = { project, workspace, view: 'output' };
  pencil.begin(ctx, { x: 5.5, y: 20.5 }, {});
  pencil.end(ctx);
  pencil.begin(ctx, { x: 25.5, y: 20.5 }, { shiftKey: true });
  pencil.end(ctx);
  for (let col = 5; col <= 25; col++) expect(charAt(col, 10), `col ${col}`).toBe('▄');
});

test('with Colors only, a cell that shows no character (the black of an opened file\'s grown lines) takes the paint as a plain ▄', async () => {
  const { project, workspace } = await createTestApp();
  await project.openArtFile(new File(['ab  \nab  '], 'note.txt'), { layer: 'edit' });
  project.updateRows(40); // lines added under the art: the black base, converted
  await settle(project);
  Object.assign(workspace, { editFgColor: '#ffffff', pencilDrawWith: 'normal', brushDrawWith: 'normal', editBrushSize: 1, editBrushHardness: 100, editBrushFlow: 100 });
  // Grown cells holding a character (the seed is the document's own), each in its own background color.
  const hidden = project.cells.map((cell, i) => i).filter((i) => i >= 2 * project.cols && !['▄', ' '].includes(project.cells[i].char)).slice(0, 2);
  expect(hidden.map((i) => project.cells[i].fg.hex === project.cells[i].bg.hex)).toEqual([true, true]);
  const shows = (i) => { const { char, fg, bg } = project.cells[i]; return [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]; };
  for (const [tool, i] of [[pencil, hidden[0]], [brush, hidden[1]]]) {
    const col = i % project.cols, row = (i - col) / project.cols, ctx = { project, workspace, view: 'output' };
    tool.begin(ctx, { x: col + 0.5, y: 2 * row + 0.5 }, {}); // its top half
    tool.end(ctx);
    await settle(project);
    expect(shows(i), tool.id).toEqual(['▄', '#ffffff', '#000000']);
  }
  project.render(); // a whole render shows them the same way
  await settle(project);
  expect(hidden.map(shows)).toEqual([['▄', '#ffffff', '#000000'], ['▄', '#ffffff', '#000000']]);
});

// The report (projects/paint-over-merged-shape.phosphor): Color ASCII, a shape merged down, then painted along its edge
// with Colors only, and the paint came out as half-blocks. The merge wrote some edge cells exactly, a space in the
// shape's color among them; Colors only made each a ▄ and kept its color, and a ▄ with colors of its own isn't a paint
// block, so ASCII showed it. What counts is what shows: a % in the red of the base under it shows in Color ASCII (on
// black), and was made a ▄ too, while in ANSI it shows no character.
for (const renderStyle of ['colorAscii', 'ansi']) {
  test(`${renderStyle}: with Colors only, a layer's own cell that shows no character becomes a plain ▄, its colors paint; one that shows a character keeps it`, async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ cols: 20, rows: 20 });
    project.renderStyle = renderStyle;
    await settle(project);
    workspace.pickLayer('base');
    project.paintEditPixels([{ x: 12, y: 10, r: 255, g: 0, b: 0, alpha: 1 }, { x: 12, y: 11, r: 255, g: 0, b: 0, alpha: 1 }]);
    project.commitEdit();
    workspace.pickLayer(project.addLayer('cells', 'base'));
    project.writeEditCells([
      { col: 5, row: 5, attrs: { char: ' ', fg: '#ff0000' } },       // shows nothing: the black background
      { col: 6, row: 5, attrs: { char: ' ', fg: '#000000', bg: '#0000ff' } }, // shows its blue background in ANSI
      { col: 12, row: 5, attrs: { char: '%', fg: '#ff0000' } },      // in the red of the base under it
    ]);
    project.commitEdit();
    await settle(project);
    Object.assign(workspace, { editFgColor: '#ffffff', brushDrawWith: 'normal', editBrushSize: 1, editBrushHardness: 100, editBrushFlow: 100, editBrushOpacity: 100 });
    const ctx = { project, workspace, view: 'output' };
    for (const col of [5, 6, 12]) {
      brush.begin(ctx, { x: col + 0.5, y: 10.5 }, {}); // the cell's top half
      brush.end(ctx);
    }
    await settle(project);
    expect(project.editCellAt(5, 5)).toEqual({ char: '▄' });
    expect(project.editCellAt(6, 5)).toEqual({ char: '▄' });
    expect(project.paintLayer.pixelAt(6, 11)).toMatchObject(renderStyle === 'ansi' ? { r: 0, g: 0, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 }); // its unpainted half, as it showed
    expect(project.editCellAt(12, 5)?.char).toBe(renderStyle === 'ansi' ? '▄' : '%');
    if (renderStyle !== 'ansi') expect(project.cells.slice(5 * 20, 6 * 20).map((cell) => cell.char).join('')).not.toContain('▄');
    project.undo();
    expect(project.editCellAt(12, 5)).toEqual({ char: '%', fg: '#ff0000' }); // the last stroke undone
  });
}

test('the report: in Color ASCII a shape merged down, then brushed along its edge with Colors only, shows no ▄', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 60, rows: 40 });
  Object.assign(project, { renderStyle: 'colorAscii', charChoiceAscii: 'shape' });
  await settle(project);
  const layer = project.addLayer('cells', 'base'), vector = project.addLayer('vector', layer);
  workspace.pickLayer(vector);
  project.addShape(ellipseShape(10.3, 6.4, 40.7, 36.2, { fill: '#ff2000' }));
  project.commitEdit();
  await settle(project);
  expect(project.mergeDown(vector)).toBe(true);
  await settle(project);
  expect([...project.cellsOf(layer).values()].some((entry) => entry.char === ' ' && entry.fg)).toBe(true); // its edge's exact blanks
  workspace.pickLayer(layer);
  Object.assign(workspace, { editFgColor: '#ffffff', brushDrawWith: 'normal', editBrushSize: 6, editBrushOpacity: 100 });
  const ctx = { project, workspace, view: 'output' };
  brush.begin(ctx, { x: 6, y: 8 }, {});
  brush.move(ctx, { x: 6, y: 8 }, { x: 44, y: 36 });
  brush.end(ctx);
  await settle(project);
  expect(project.cells.filter((cell) => cell.char === '▄')).toHaveLength(0);
});

test('with Colors only on the base, a cell that shows no character is pinned a ▄ the paint colors', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  project.useLayer('base');
  Object.assign(workspace, { editFgColor: '#ffffff', pencilDrawWith: 'normal' });
  const ctx = { project, workspace, view: 'output' };
  pencil.begin(ctx, { x: 0.5, y: 0.5 }, {});
  pencil.move(ctx, { x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }); // the top halves of row 0's first six cells
  pencil.end(ctx);
  await settle(project);
  const row = project.cells.slice(0, 6).map(({ char, fg, bg }) => [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]);
  expect(row).toEqual(Array(6).fill(['▄', '#ffffff', '#000000']));
});

test('with Colors only, a character the stroke itself paints into one color isn\'t made a ▄ by the rest of the stroke', async () => {
  const { project, workspace, charAt } = await scene({ pencilDrawWith: 'normal' });
  const i = project.cells.findIndex((cell) => cell.fg.hex !== cell.bg.hex && !['▄', '▀', '█', ' '].includes(cell.char));
  const col = i % project.cols, row = (i - col) / project.cols, { char, fg } = project.cells[i];
  workspace.editFgColor = fg.hex; // its top half painted in its own foreground: the cell is one color for a moment
  const ctx = { project, workspace, view: 'output' };
  pencil.begin(ctx, { x: col + 0.5, y: 2 * row + 0.5 }, {});
  pencil.move(ctx, { x: col + 0.5, y: 2 * row + 0.5 }, { x: col + 0.5, y: 2 * row + 1.5 }); // then its bottom half
  pencil.end(ctx);
  expect(charAt(col, row)).toBe(char);
});

// The report: painting in ASCII used only half-blocks, in stripes, never the characters chosen, and a picture on a layer
// above showed ▄ where it had been painted (the paint showed through them as through any character drawn below it). And
// a drawing painted in ANSI showed those stripes once it was switched to ASCII, and Colors only made ▄ in the ANSI view
// but not in the PIXEL view. Colors only's ▄ shows in ANSI alone, and the same cells take it in either view or style.
async function stroke(view, { paintedIn = 'colorAscii', shownIn = 'colorAscii', layer = 'edit', picture = true } = {}) {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 10 });
  project.renderStyle = paintedIn;
  await settle(project);
  workspace.pickLayer(layer);
  Object.assign(workspace, { editFgColor: '#ff0000', brushDrawWith: 'normal', editBrushSize: 6, editBrushOpacity: 100, editBrushFlow: 100, editBrushHardness: 100 });
  const ctx = { project, workspace, view };
  brush.begin(ctx, { x: 4, y: 5 }, {});
  brush.move(ctx, { x: 4, y: 5 }, { x: 12, y: 5 });
  brush.end(ctx);
  if (picture) {
    workspace.pickLayer(project.addLayer('cells', layer));
    await project.addPictureToLayer(new File([await (await fetch('/tests/fixtures/images/gradient.png')).blob()], 'gradient.png', { type: 'image/png' }));
  }
  project.renderStyle = shownIn;
  await settle(project);
  const shown = () => project.cells.map((cell) => cell?.char).join('');
  return { project, shown, chars: shown() };
}

test('in ASCII, Colors only paints with the ASCII characters, in the ANSI view as in the Pixel view', async () => {
  const pixel = await stroke('input'), ansi = await stroke('output');
  expect(ansi.chars).not.toContain('▄');
  expect(ansi.chars).toBe(pixel.chars);
});

for (const layer of ['edit', 'base']) {
  test(`${layer}: painted with Colors only in ANSI, it shows the ASCII characters once switched to ASCII, and its ▄ again back in ANSI`, async () => {
    const pixel = await stroke('input', { layer, picture: false });
    const { project, shown, chars } = await stroke('output', { paintedIn: 'ansi', layer, picture: false });
    expect(chars).not.toContain('▄');
    expect(chars).toBe(pixel.chars);
    project.renderStyle = 'ansi';
    await settle(project);
    expect(shown().slice(20 + 2, 20 + 14)).toBe('▄'.repeat(12));
  });

  test(`${layer}: Colors only makes the same cells ▄ in the PIXEL view as in the ANSI view, and painted in ASCII as in ANSI`, async () => {
    const ansi = { paintedIn: 'ansi', shownIn: 'ansi', layer, picture: false };
    const inAnsiView = await stroke('output', ansi);
    expect(inAnsiView.chars.slice(20 + 2, 20 + 14)).toBe('▄'.repeat(12));
    expect((await stroke('input', ansi)).chars).toBe(inAnsiView.chars);
    expect((await stroke('output', { ...ansi, paintedIn: 'colorAscii' })).chars).toBe(inAnsiView.chars);
    expect((await stroke('input', { ...ansi, paintedIn: 'colorAscii' })).chars).toBe(inAnsiView.chars);
  });
}
