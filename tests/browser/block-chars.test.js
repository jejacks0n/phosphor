// The Pencil's and Brush's Half-block (ANSI view): each cell they paint becomes a real ▄ (the
// paint colors its halves) instead of the paint showing through the cell's own character. Erasing
// that paint in the Pixel view gives the cell its generated character back.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { cellIndex } from '@/lib/Cells';
import { ellipseShape, rectShape } from '@/document/shapes.js';
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

test('R5: Colors only over a flat shape on a vector layer under the layer makes no ▄: the paint converts with the layer\'s characters, as over the picture', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  const vector = project.addLayer('vector', 'edit');
  project.addShape(rectShape(2, 2, 8, 8, { fill: '#ff0000' })); // cells 2..9 x 1..4, both halves of each one color
  project.commitEdit();
  project.useLayer(project.addLayer('cells', vector));
  project.paintStroke([{ x: 5, y: 6, alpha: 1 }, { x: 15, y: 6, alpha: 1 }], '#0000ff', { blockChars: 'plain' }); // over the shape, and over blank canvas
  project.commitEdit();
  expect(project.editCellAt(5, 3)).toBeUndefined();
  expect(project.editCellAt(15, 3)).toEqual({ char: '▄' }); // a blank canvas's cell, as ever
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
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
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
  await project.setBlankCanvas({ withLayer: true, cols: 60, rows: 40 });
  Object.assign(project, { renderStyle: 'colorAscii', charChoiceAscii: 'shape' });
  await settle(project);
  const layer = project.addLayer('cells', 'base'), vector = project.addLayer('vector', layer);
  workspace.pickLayer(vector);
  project.addShape(ellipseShape(10.3, 6.4, 40.7, 36.2, { fill: '#ff2000' }));
  project.commitEdit();
  await settle(project);
  expect(project.mergeDown(vector)).toBe(true);
  await settle(project);
  // (The merge once wrote exact blanks along the edge; with the shape sampled as paint the same way, it may write none.)
  workspace.pickLayer(layer);
  Object.assign(workspace, { editFgColor: '#ffffff', brushDrawWith: 'normal', editBrushSize: 6, editBrushOpacity: 100 });
  const ctx = { project, workspace, view: 'output' };
  brush.begin(ctx, { x: 6, y: 8 }, {});
  brush.move(ctx, { x: 6, y: 8 }, { x: 44, y: 36 });
  brush.end(ctx);
  await settle(project);
  expect(project.cells.filter((cell) => cell.char === '▄')).toHaveLength(0);
});

// docs/model.md R5: a frozen cell (Merge down's, paint written as a character so the look stayed) is paint to Colors
// only too: its halves become paint and the cell a bare ▄, as a blank cell's do, whatever its character.
for (const renderStyle of ['ansi', 'colorAscii']) {
  test(`R5: ${renderStyle}: Colors only over a frozen cell makes it a plain ▄, its colors paint, and keeps a typed letter`, async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    project.renderStyle = renderStyle;
    await settle(project);
    workspace.pickLayer('edit');
    project.writeEditCells([{ col: 10, row: 5, attrs: { char: 'A', fg: '#ff0000', bg: '#000000' } }]);
    project.paintEditPixels([{ x: 4, y: 10, r: 255, g: 255, b: 255, alpha: 1 }, { x: 4, y: 11, r: 255, g: 0, b: 0, alpha: 1 }]); // a frozen cell keeps its paint under it
    project.commitEdit();
    project.paintEditPixels([{ x: 6, y: 10, r: 255, g: 255, b: 255, alpha: 1 }, { x: 6, y: 11, r: 255, g: 0, b: 0, alpha: 1 }]);
    project.setEditCells(new Map([...project.editCells, ['4,5', Object.freeze({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true })], ['6,5', Object.freeze({ char: '▄', fg: '#ff0000', bg: '#ffffff', frozen: true })]]), ['4,5', '6,5']);
    project.commitEdit();
    await settle(project);
    Object.assign(workspace, { editFgColor: '#00ff00', brushDrawWith: 'normal', editBrushSize: 1, editBrushHardness: 100, editBrushFlow: 100, editBrushOpacity: 100 });
    const ctx = { project, workspace, view: 'output' };
    for (const col of [4, 6, 10]) {
      brush.begin(ctx, { x: col + 0.5, y: 10.5 }, {});
      brush.end(ctx);
    }
    await settle(project);
    expect(project.editCellAt(4, 5)).toEqual({ char: '▄' }); // a paint block over its paint, the green over the top half
    expect(project.editCellAt(6, 5)).toEqual({ char: '▄' }); // a frozen ▄ too: a frozen cell, not a block already
    expect(project.paintLayer.pixelAt(4, 10)).toMatchObject({ r: 0, g: 255, b: 0, a: 1 });
    expect(project.paintLayer.pixelAt(4, 11)).toMatchObject({ r: 255, g: 0, b: 0, a: 1 });
    expect(project.editCellAt(10, 5)?.char).toBe('A'); // a letter: tinted, kept
    project.undo(); // the letter's stroke
    project.undo(); // the frozen ▄'s
    project.undo(); // the frozen cell's: as it was
    await settle(project);
    expect(project.editCellAt(4, 5)).toEqual({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true });
  });
}

// docs/model.md R1: Insert and Delete (shiftCells) move characters of someone's own along the row; paint stays where it
// is, and so do a paint block and a frozen cell, which are paint; a character moved onto one takes its place.
test('R1: shiftCells moves a typed character and leaves the paint blocks and frozen cells with their paint', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.pickLayer('edit');
  project.paintEditPixels([4, 6].flatMap((x) => [{ x, y: 10, r: 255, g: 255, b: 255, alpha: 1 }, { x, y: 11, r: 255, g: 0, b: 0, alpha: 1 }]));
  project.writeEditCells([{ col: 6, row: 5, attrs: { char: '▄' } }, { col: 8, row: 5, attrs: { char: 'A', fg: '#ffffff', bg: '#000000' } }]);
  project.commitEdit();
  project.setEditCells(new Map([...project.editCells, ['4,5', Object.freeze({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true })]]), ['4,5']);
  project.commitEdit();
  project.render();
  await settle(project);
  project.shiftCells(5, 2, 1);
  project.commitEdit();
  await settle(project);
  expect(project.editCellAt(9, 5)?.char).toBe('A'); // moved right
  expect(project.editCellAt(4, 5)).toEqual({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true }); // not moved: with its paint
  expect(project.editCellAt(6, 5)).toEqual({ char: '▄' });
  expect([5, 7].map((col) => project.editCellAt(col, 5))).toEqual([undefined, undefined]);
  expect(project.paintLayer.pixelAt(4, 10)).toMatchObject({ r: 255, g: 255, b: 255, a: 1 }); // the paint, where it was
  expect(project.paintLayer.pixelAt(6, 11)).toMatchObject({ r: 255, g: 0, b: 0, a: 1 });
  for (let k = 0; k < 3; k++) project.shiftCells(5, 2, -1); // back to 6: a character moved onto a block takes its place
  project.commitEdit();
  await settle(project);
  expect(project.editCellAt(6, 5)?.char).toBe('A');
});

// docs/model.md R3: a frozen cell is Merge down's pinned conversion of the paint under it; paint written or erased in
// it is paint again, so the mark goes, and the Paint Bucket, a shape's fill or the Eraser never leave a stale character.
test('R3: the Eraser in the PIXEL view, or paint laid, in a frozen cell drops the mark; the paint left shows converted', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  workspace.pickLayer('edit');
  project.paintEditPixels([4, 6].flatMap((x) => [{ x, y: 10, r: 255, g: 255, b: 255, alpha: 1 }, { x, y: 11, r: 255, g: 0, b: 0, alpha: 1 }]));
  project.commitEdit();
  project.setEditCells(new Map([...project.editCells, ['4,5', Object.freeze({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true })], ['6,5', Object.freeze({ char: '%', fg: '#ff0000', bg: '#ffffff', frozen: true })]]), ['4,5', '6,5']);
  project.commitEdit();
  await settle(project);
  expect(project.cells[5 * 20 + 4].char).toBe('%');
  workspace.editEraserSize = 1;
  const ctx = { project, workspace, view: 'input' };
  eraser.begin(ctx, { x: 4.5, y: 10.5 }, {});
  eraser.end(ctx);
  project.paintEditPixels([{ x: 6, y: 10, r: 0, g: 0, b: 255, alpha: 1 }]);
  project.commitEdit();
  await settle(project);
  expect(project.editCellAt(4, 5)).toBeUndefined();
  expect(project.paintLayer.pixelAt(4, 10)).toBeNull();
  expect(project.paintLayer.pixelAt(4, 11)).toMatchObject({ r: 255, g: 0, b: 0, a: 1 }); // the other half stays, converted
  expect([project.cells[5 * 20 + 4].bg.hex, project.cells[5 * 20 + 4].fg.hex]).toEqual(['#000000', '#ff0000']); // the converter's cell of what's left, not the frozen white and red
  expect(project.editCellAt(6, 5)).toBeUndefined();
  expect(project.paintLayer.pixelAt(6, 10)).toMatchObject({ r: 0, g: 0, b: 255, a: 1 });
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

// docs/model.md R5 on the base: under Best match and By shape the converter picks a base cell's character from its pixels,
// so Colors only lays its paint there and makes no ▄ of a cell the converter drew (a pinned ▄ would outlast a switch of
// how characters are chosen, as Retouch's pins did); a character someone pinned is theirs, and a pinned space still opens
// to the paint as a ▄ (R2). Under Random, whose blank cell hides a character the paint would bring out, the ▄ stays.
for (const charChoice of ['random', 'best', 'shape']) {
  test(`R5: ${charChoice}: on the base Colors only makes a ▄ of a pinned space${charChoice === 'random' ? ' and of a blank cell' : ', and of no cell the converter drew'}`, async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ cols: 20, rows: 20 });
    Object.assign(project, { quantize: 'cga', charChoice });
    await settle(project);
    workspace.pickLayer('base');
    project.writeEditCells([{ col: 5, row: 5, attrs: { char: ' ', fg: '#000000', bg: '#000000' } }]); // a pinned space, as the Eraser leaves
    project.commitEdit();
    project.paintStroke([{ x: 5, y: 11, alpha: 1 }, { x: 12, y: 11, alpha: 1 }], '#ff5555', { blockChars: 'plain' }); // the bottom halves of a pinned space and a blank cell
    project.commitEdit();
    await settle(project);
    const { pins } = project.baseRecords, at = (col) => project.cells[cellIndex(col, 5, 20)];
    expect([pins.get('5,5'), at(5).char, at(5).fg.hex]).toEqual(['▄', '▄', '#ff5555']); // the paint shows in the pinned space's lower half
    expect(pins.get('12,5')).toBe(charChoice === 'random' ? '▄' : undefined);
    expect(at(12).fg.hex === '#ff5555' || at(12).bg.hex === '#ff5555').toBe(true); // the paint shows in the converter's cell too
  });
}

// docs/model.md R5 on a layer: a ▄ is only for where paint would bring out a character the converter hid, the base's
// Random and a layer that shares it. The report (projects/random-layer-blocks.phosphor: a white canvas under Best match
// with paint on the base and Layer 1, and Layer 2 above with Random and a seed of its own): Layer 2's strokes came out
// as half-blocks wherever the canvas under them was flat, and as Random's characters only along the edges of what was
// under them. Colors only made a ▄ of every cell that showed no character, and a ▄ isn't converted, whatever the layer's
// settings are; Layer 1's, under Best match, then held Layer 2's paint over them to half-blocks too (R1).
test('R5: the report: Colors only on a layer with its own Random makes no ▄ of a flat canvas, and its paint shows Random\'s characters', async () => {
  const { project, workspace } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/random-layer-blocks.phosphor')).arrayBuffer()], 'x.phosphor'));
  await settle(project);
  expect([project.charChoice, project.charsOf('edit').charChoice, project.charsOf('L1').charChoice]).toEqual(['best', 'best', 'random']);
  Object.assign(workspace, { editFgColor: '#ff0000', brushDrawWith: 'normal', editBrushSize: 1, editBrushOpacity: 100, editBrushFlow: 100, editBrushHardness: 100 });
  const ctx = { project, workspace, view: 'output' }, cols = [...Array(16).keys()].map((i) => i + 2);
  const line = (row) => { // the top halves of cols 2 to 17, in a part of the canvas nothing is drawn on
    brush.begin(ctx, { x: 2.5, y: 2 * row + 0.5 }, {});
    brush.move(ctx, { x: 2.5, y: 2 * row + 0.5 }, { x: 17.5, y: 2 * row + 0.5 });
    brush.end(ctx);
  };
  const shown = (row) => cols.map((col) => project.cells[cellIndex(col, row, project.cols)]);
  workspace.pickLayer('L1'); // Layer 2: Random, its own seed
  line(44);
  await settle(project);
  expect(cols.filter((col) => project.editCellAt(col, 44))).toEqual([]);
  expect(shown(44).every((cell) => cell.fg.hex !== cell.bg.hex)).toBe(true); // the paint over the white
  expect(new Set(shown(44).map((cell) => cell.char)).size).toBeGreaterThan(4); // Random's, not a row of ▄
  workspace.pickLayer('edit'); // Layer 1: Best match, as the base
  line(46);
  await settle(project);
  expect(cols.filter((col) => project.editCellAt(col, 46))).toEqual([]);
  expect(shown(46).every((cell) => cell.fg.hex !== cell.bg.hex)).toBe(true);
});

// docs/model.md R2 on a layer with characters of its own. The report (projects/random-over-pins.phosphor: a flattened
// drawing, every base cell pinned, under Layer 1 with Random, ░▒▓█ and a seed of its own): Layer 1's strokes came out as
// half-blocks in ANSI. Paint over an open character (one with no ink to tint: in its own background color, or a solid
// glyph) became a ▄, where Color ASCII converted it with the layer's characters; the layer's paint is its characters.
test('R2: the report: paint on a layer with its own Random over open pinned characters shows its characters in ANSI', async () => {
  const { project, workspace } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/random-over-pins.phosphor')).arrayBuffer()], 'x.phosphor'));
  await settle(project);
  expect([project.renderStyle, project.charsOf('edit').chars, project.charsOf('edit').charChoice]).toEqual(['ansi', '░▒▓█', 'random']);
  Object.assign(workspace, { editFgColor: '#ff0000', editBrushSize: 1, editBrushOpacity: 100, editBrushFlow: 100, editBrushHardness: 100 });
  const ctx = { project, workspace, view: 'output' }, cols = [...Array(16).keys()].map((i) => i + 2);
  const shown = (row) => cols.map((col) => project.cells[cellIndex(col, row, project.cols)]);
  workspace.pickLayer('edit');
  for (const [row, brushDrawWith] of [[40, 'normal'], [42, 'plain']]) { // the top halves of cols 2 to 17, open pins under each
    expect(cols.every((col) => project.renderer.pinAt(col, row) !== undefined)).toBe(true);
    workspace.brushDrawWith = brushDrawWith;
    brush.begin(ctx, { x: 2.5, y: 2 * row + 0.5 }, {});
    brush.move(ctx, { x: 2.5, y: 2 * row + 0.5 }, { x: 17.5, y: 2 * row + 0.5 });
    brush.end(ctx);
    await settle(project);
    expect(cols.filter((col) => project.editCellAt(col, row))).toEqual([]); // no ▄ written
    expect(shown(row).every((cell) => '░▒▓█'.includes(cell.char))).toBe(true); // the layer's characters, not ▄
    expect(new Set(shown(row).map((cell) => cell.char)).size).toBeGreaterThan(1); // Random's, not one
  }
  project.renderStyle = 'colorAscii'; // as it always was there: converted with the layer's characters
  await settle(project);
  expect(shown(40).every((cell) => cell.char !== '▄')).toBe(true);
});

// On a layer with the base's settings the base's rule holds: under Random a blank cell hides a character the paint would
// bring out, so the ▄ stays; under Best match and By shape the cell is matched again from the painted pixels. A layer
// with settings of its own converts its paint by them over the pixels under it (R7), Random's among them.
for (const charChoice of ['random', 'best', 'shape']) {
  test(`R5: ${charChoice}: on a layer Colors only makes ${charChoice === 'random' ? 'a ▄ of a blank cell with the base\'s seed, and none with a seed of its own' : 'no ▄ of a cell the converter drew'}`, async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ cols: 20, rows: 20 });
    Object.assign(project, { quantize: 'cga', charChoice });
    await settle(project);
    workspace.pickLayer('base');
    project.writeEditCells([{ col: 5, row: 5, attrs: { char: ' ', fg: '#000000', bg: '#000000' } }]); // a pinned space, as the Eraser leaves
    project.commitEdit();
    const layer = project.addLayer('cells', 'base');
    workspace.pickLayer(layer);
    expect(project.lowerGroup.cells).toBe(layer); // the base's settings
    const paint = (col) => {
      project.paintStroke([{ x: col, y: 11, alpha: 1 }], '#ff5555', { blockChars: 'plain' }); // a blank cell's bottom half
      project.commitEdit();
    };
    const at = (col) => project.cells[cellIndex(col, 5, 20)];
    paint(12);
    await settle(project);
    expect(project.editCellAt(12, 5)).toEqual(charChoice === 'random' ? { char: '▄' } : undefined);
    expect(at(12).fg.hex === '#ff5555' || at(12).bg.hex === '#ff5555').toBe(true); // the paint shows either way
    paint(5); // over the pinned space the paint shows as a ▄ (R2), with an entry or without
    await settle(project);
    expect([at(5).char, at(5).fg.hex, at(5).bg.hex]).toEqual(['▄', '#ff5555', '#000000']);
    if (charChoice !== 'random') return;
    project.setLayerChars(layer, { seed: 'a-seed-of-its-own', chars: '░▒▓' }); // no ▄ Random could pick by chance
    await settle(project);
    expect(project.lowerGroup.cells).toBe(null);
    paint(14);
    await settle(project);
    expect(project.editCellAt(14, 5)).toBeUndefined();
    expect(at(14).fg.hex === '#ff5555' || at(14).bg.hex === '#ff5555').toBe(true);
    project.paintStroke([{ x: 5, y: 10, alpha: 1 }], '#55ff55', { blockChars: 'plain' }); // the pinned space's other half, from a layer of its own settings
    project.commitEdit();
    await settle(project);
    // Its paint over the open space is its characters now (R2), the halves as the ▄ had them.
    expect('░▒▓'.includes(at(5).char)).toBe(true);
    expect([at(5).fg.hex, at(5).bg.hex]).toEqual(['#ff5555', '#55ff55']);
  });
}
