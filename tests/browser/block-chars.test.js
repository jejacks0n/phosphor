// The Pencil's and Brush's Half-block (ANSI view): each cell they paint becomes a real ▄ (the
// paint colors its halves) instead of the paint showing through the cell's own character. Erasing
// that paint in the Pixel view gives the cell its generated character back.
import { test, expect } from 'vitest';
import { createTestApp, loadImage, settle } from '../support/app.js';
import { blockOver, cellIndex } from '@/lib/Cells';
import { coverageOf } from '@/lib/GlyphCoverage.js';
import { ellipseShape, rectShape } from '@/document/shapes.js';
import pencil from '@/tools/pencil';
import brush from '@/tools/brush';
import shapes from '@/tools/shapes';
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
  expect(project.editCellAt(15, 3)).toBeUndefined(); // nor a blank canvas's cell: the converter drew it too
});

test('with Colors only, a cell that shows no character (the black of an opened file\'s grown lines) takes the paint in the converter\'s character, no ▄', async () => {
  const { project, workspace } = await createTestApp();
  await project.openArtFile(new File(['ab  \nab  '], 'note.txt'), { layer: 'edit' });
  project.updateRows(40); // lines added under the art: the black base, converted
  await settle(project);
  Object.assign(workspace, { editFgColor: '#ffffff', pencilDrawWith: 'normal', brushDrawWith: 'normal', editBrushSize: 1, editBrushHardness: 100, editBrushFlow: 100 });
  // Grown cells holding a character (the seed is the document's own), each in its own background color.
  const hidden = project.cells.map((cell, i) => i).filter((i) => i >= 2 * project.cols && !['▄', ' '].includes(project.cells[i].char)).slice(0, 2);
  expect(hidden.map((i) => project.cells[i].fg.hex === project.cells[i].bg.hex)).toEqual([true, true]);
  const shows = (i) => { const { char, fg, bg } = project.cells[i]; return [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]; };
  const chars = hidden.map((i) => project.cells[i].char); // the converter's, hidden in the black: the paint brings them out (R5)
  for (const [tool, i] of [[pencil, hidden[0]], [brush, hidden[1]]]) {
    const col = i % project.cols, row = (i - col) / project.cols, ctx = { project, workspace, view: 'output' };
    tool.begin(ctx, { x: col + 0.5, y: 2 * row + 0.5 }, {}); // its top half
    tool.end(ctx);
    await settle(project);
    expect(shows(i), tool.id).toEqual([chars[hidden.indexOf(i)], '#ffffff', '#000000']);
    expect(project.editCellAt(col, row), tool.id).toBeUndefined();
  }
  project.render(); // a whole render shows them the same way
  await settle(project);
  expect(hidden.map(shows)).toEqual(chars.map((char) => [char, '#ffffff', '#000000']));
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

test('with Colors only on the base, a cell that shows no character takes the paint in the converter\'s character, unpinned', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  await settle(project);
  project.useLayer('base');
  Object.assign(workspace, { editFgColor: '#ffffff', pencilDrawWith: 'normal' });
  const ctx = { project, workspace, view: 'output' }, chars = project.cells.slice(0, 6).map(({ char }) => char);
  pencil.begin(ctx, { x: 0.5, y: 0.5 }, {});
  pencil.move(ctx, { x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }); // the top halves of row 0's first six cells
  pencil.end(ctx);
  await settle(project);
  const row = project.cells.slice(0, 6).map(({ char, fg, bg }) => [char, bg.hex.toLowerCase(), fg.hex.toLowerCase()]);
  expect(row).toEqual(chars.map((char) => [char, '#ffffff', '#000000'])); // Random's, the paint over the black
  expect([0, 1, 2, 3, 4, 5].filter((col) => project.renderer.pinAt(col, 0) !== undefined)).toEqual([]);
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
// but not in the PIXEL view. A stroke shows the same cells whichever view or style it's laid in (Colors only makes no ▄
// of a cell the converter drew now, docs/model.md R5, so they're the converter's in every style).
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
  test(`${layer}: painted with Colors only in ANSI, it shows the ASCII characters once switched to ASCII, and what it showed again back in ANSI`, async () => {
    const pixel = await stroke('input', { layer, picture: false });
    const inAnsi = await stroke('output', { paintedIn: 'ansi', shownIn: 'ansi', layer, picture: false });
    const { project, shown, chars } = await stroke('output', { paintedIn: 'ansi', layer, picture: false });
    expect(chars).not.toContain('▄');
    expect(chars).toBe(pixel.chars);
    project.renderStyle = 'ansi';
    await settle(project);
    expect(shown()).toBe(inAnsi.chars);
  });

  test(`${layer}: Colors only paints the same cells in the PIXEL view as in the ANSI view, and painted in ASCII as in ANSI`, async () => {
    const ansi = { paintedIn: 'ansi', shownIn: 'ansi', layer, picture: false };
    const inAnsiView = await stroke('output', ansi);
    expect(new Set(inAnsiView.chars.slice(20 + 2, 20 + 14)).size).toBeGreaterThan(1); // Random's, not a row of ▄
    expect((await stroke('input', ansi)).chars).toBe(inAnsiView.chars);
    expect((await stroke('output', { ...ansi, paintedIn: 'colorAscii' })).chars).toBe(inAnsiView.chars);
    expect((await stroke('input', { ...ansi, paintedIn: 'colorAscii' })).chars).toBe(inAnsiView.chars);
  });
}

// docs/model.md R5 on the base: under Best match and By shape the converter picks a base cell's character from its pixels,
// so Colors only lays its paint there and makes no ▄ of a cell the converter drew (a pinned ▄ would outlast a switch of
// how characters are chosen, as Retouch's pins did); a character someone pinned is theirs, and a pinned space still opens
// to the paint as a ▄ (R2). Under Random the same: a blank cell's hidden character is Random's, and the paint brings it out.
for (const charChoice of ['random', 'best', 'shape']) {
  test(`R5: ${charChoice}: on the base Colors only makes a ▄ of a pinned space, and of no cell the converter drew`, async () => {
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
    expect(pins.get('12,5')).toBeUndefined();
    expect(at(12).fg.hex === '#ff5555' || at(12).bg.hex === '#ff5555').toBe(true); // the paint shows in the converter's cell too
  });
}

// The report: stripes in the PIXEL view after painting an opened file in an ASCII style. A Colors only stroke on the base
// that fills a character's two pixels with one color leaves it showing nothing, so the next stroke to reach it makes it a
// ▄ (R5). That ▄ was written in the colors the art style shows the cell in, not its own: in Color ASCII and Monochrome
// ASCII a black background, so the second stroke turned the cell's top pixel black under paint that never touched it.
for (const renderStyle of ['ansi', 'colorAscii', 'ascii']) {
  test(`R5: ${renderStyle}: a second Colors only stroke on the base over a character the first filled with one color keeps its two pixels`, async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ cols: 20, rows: 20 });
    project.writeBaseCells([{ col: 6, row: 3, char: '░', fg: '#ffffff', bg: '#0000ff' }]);
    project.commitEdit();
    project.renderStyle = renderStyle;
    await settle(project);
    workspace.pickLayer('base');
    Object.assign(workspace, { editFgColor: '#ff8020', pencilDrawWith: 'normal' });
    const ctx = { project, workspace, view: 'output' };
    pencil.begin(ctx, { x: 6.5, y: 6.5 }, {});
    pencil.move(ctx, { x: 6.5, y: 6.5 }, { x: 6.5, y: 7.5 }); // both its pixels
    pencil.end(ctx);
    expect([project.baseColorAt(6, 6), project.baseColorAt(6, 7)]).toEqual(['#ff8020', '#ff8020']);
    pencil.begin(ctx, { x: 6.5, y: 7.5 }, {}); // its lower pixel again
    pencil.end(ctx);
    await settle(project);
    expect(project.baseRecords.pins.get('6,3')).toBe('▄');
    expect([project.baseColorAt(6, 6), project.baseColorAt(6, 7)]).toEqual(['#ff8020', '#ff8020']);
  });
}

// R5 on the base: a Half-block's ▄ over a pinned character takes its background in both pixels, in every art style. It was
// written in the colors the style shows the cell in: Monochrome ASCII shows none, Color ASCII none for a pin whose two
// pixels match, so the block's top pixel was stored black under paint that only touched the lower one.
for (const renderStyle of ['ansi', 'colorAscii', 'ascii']) {
  test(`R5: ${renderStyle}: on the base a Half-block ▄ over a pinned character takes its background in both pixels`, async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ cols: 20, rows: 20 });
    project.writeBaseCells([{ col: 6, row: 3, char: '░', fg: '#ffffff', bg: '#0000ff' }, { col: 8, row: 3, char: 'A', fg: '#00ff00', bg: '#00ff00' }]);
    project.commitEdit();
    project.renderStyle = renderStyle;
    await settle(project);
    workspace.pickLayer('base');
    Object.assign(workspace, { editFgColor: '#ff8020', pencilDrawWith: 'half' });
    const ctx = { project, workspace, view: 'output' };
    for (const x of [6.5, 8.5]) {
      pencil.begin(ctx, { x, y: 7.5 }, {}); // the lower pixel alone
      pencil.end(ctx);
    }
    await settle(project);
    expect([project.baseRecords.pins.get('6,3'), project.baseRecords.pins.get('8,3')]).toEqual(['▄', '▄']);
    expect([project.baseColorAt(6, 6), project.baseColorAt(6, 7)]).toEqual(['#0000ff', '#ff8020']);
    expect([project.baseColorAt(8, 6), project.baseColorAt(8, 7)]).toEqual(['#00ff00', '#ff8020']);
  });
}

// docs/model.md R5 on a layer: Colors only makes no ▄ of a cell the converter drew. The report (projects/random-layer-blocks.phosphor: a white canvas under Best match
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

// docs/model.md R5 on the base: the report, a fresh blank canvas under the base's Random and the default characters,
// where the Brush (Colors only) wrote a pinned ▄ into every cell it reached, so a stroke showed half-blocks and never
// Random's characters. A cell the converter drew is paint to Colors only wherever it's drawn: the paint goes into the
// base's pixels and Random chooses over them, as it does over a picture.
test('R5: the report: the Brush on a blank canvas under the base\'s Random paints Random\'s characters, no ▄', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 40, rows: 40 });
  await settle(project);
  expect([project.charChoice, project.editId, project.layers.length]).toEqual(['random', 'base', 1]);
  Object.assign(workspace, { editFgColor: '#ff0000', brushDrawWith: 'normal', editBrushSize: 1, editBrushOpacity: 100, editBrushFlow: 100, editBrushHardness: 100 });
  const ctx = { project, workspace, view: 'output' }, cols = [...Array(16).keys()].map((i) => i + 2), row = 4;
  brush.begin(ctx, { x: 2.5, y: 2 * row + 0.5 }, {}); // the top halves of cols 2 to 17
  brush.move(ctx, { x: 2.5, y: 2 * row + 0.5 }, { x: 17.5, y: 2 * row + 0.5 });
  brush.end(ctx);
  await settle(project);
  const shown = cols.map((col) => project.cells[cellIndex(col, row, project.cols)]);
  expect(cols.filter((col) => project.renderer.pinAt(col, row) !== undefined)).toEqual([]); // no ▄ pinned
  expect(shown.every((cell) => cell.fg.hex !== cell.bg.hex)).toBe(true); // the red over the black
  expect(new Set(shown.map((cell) => cell.char)).size).toBeGreaterThan(4); // Random's, not a row of ▄
  workspace.brushDrawWith = 'half'; // Half-block still makes blocks
  brush.begin(ctx, { x: 2.5, y: 2 * (row + 2) + 0.5 }, {});
  brush.move(ctx, { x: 2.5, y: 2 * (row + 2) + 0.5 }, { x: 17.5, y: 2 * (row + 2) + 0.5 });
  brush.end(ctx);
  await settle(project);
  expect(cols.every((col) => project.cells[cellIndex(col, row + 2, project.cols)].char === '▄')).toBe(true);
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

// The report (022.xb, and any opened file: every cell a pinned space): Layer 1 left on Random, the base's own setting,
// painted ▄ over the file where a blank canvas shows Random's characters. A layer's paint over a character with no ink
// to tint converts with the layer's characters, whatever they share with the base's (docs/model.md R2).
test('R2: paint on a layer that shares the base\'s Random over an opened file\'s spaces shows Random\'s characters in ANSI', async () => {
  const { project, workspace } = await createTestApp();
  await project.openArtFile(new File([await (await fetch('/tests/fixtures/ansi/past-the-edge.ans')).arrayBuffer()], 'p.ans'));
  await settle(project);
  const layer = project.addLayer('cells', 'base');
  workspace.pickLayer(layer);
  expect([project.renderStyle, project.charChoice, project.lowerGroup.cells]).toEqual(['ansi', 'random', layer]); // the base's settings
  Object.assign(workspace, { editFgColor: '#ff0000', editBrushSize: 1, editBrushOpacity: 100, editBrushFlow: 100, editBrushHardness: 100, brushDrawWith: 'normal' });
  const ctx = { project, workspace, view: 'output' }, row = 2, cols = [...Array(10).keys()].map((i) => i + 2);
  expect(cols.every((col) => project.renderer.pinAt(col, row) === ' ')).toBe(true); // the file's spaces
  brush.begin(ctx, { x: 2.5, y: 2 * row + 0.5 }, {});
  brush.move(ctx, { x: 2.5, y: 2 * row + 0.5 }, { x: 11.5, y: 2 * row + 0.5 });
  brush.end(ctx);
  await settle(project);
  const shown = cols.map((col) => project.cells[cellIndex(col, row, project.cols)].char);
  expect(new Set(shown).size, shown.join('')).toBeGreaterThan(1); // Random's, not one ▄ after another
});

// On a layer, with the base's settings or its own, Colors only makes no ▄ of a cell the converter drew: its paint
// converts over the pixels under it (R7), under Random (its blank cell's hidden character brought out), Best match and By
// shape alike.
for (const charChoice of ['random', 'best', 'shape']) {
  test(`R5: ${charChoice}: on a layer Colors only makes no ▄ of a cell the converter drew${charChoice === 'random' ? ', with the base\'s seed or its own' : ''}`, async () => {
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
    expect(project.editCellAt(12, 5)).toBeUndefined();
    expect(at(12).fg.hex === '#ff5555' || at(12).bg.hex === '#ff5555').toBe(true); // the paint shows either way
    paint(5); // over the pinned space the paint converts with the layer's characters (R2), with an entry or without
    await settle(project);
    if (charChoice === 'random') expect(at(5).fg.hex === '#ff5555' || at(5).bg.hex === '#ff5555').toBe(true); // Random's pick
    else expect([at(5).char, at(5).fg.hex, at(5).bg.hex]).toEqual(['▄', '#ff5555', '#000000']);
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

// The report (projects/boxes.phosphor: a double-line box typed in blue on Layer 1): a Half-block box drawn over it with
// Write block glyphs on came out as full cells where it crossed the lines. Each crossed cell became a ▄ that kept the
// line's blue foreground, a character of the layer's own and no paint block, so its bottom half showed the blue under the
// paint's top half. The Brush's and Pencil's Half-block did the same. A block written over a cell takes its character
// and its foreground: a bare ▄, as over any other cell (docs/model.md R5).
test('R5: the report: a Half-block box with Write block glyphs over a line box makes bare ▄ blocks where it crosses the lines', async () => {
  const { project, workspace } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/boxes.phosphor')).arrayBuffer()], 'x.phosphor'));
  await settle(project);
  workspace.pickLayer('edit');
  project.setLayerHidden('base', true); // black under every cell, so a crossed cell can be held to one that isn't
  Object.assign(workspace, { editFgColor: '#ffffff', editBgNone: true, shapeKind: 'rect', shapeDrawWith: 'half', shapeBlockChars: true, brushDrawWith: 'half', editBrushSize: 1, editBrushOpacity: 100, editBrushFlow: 100, editBrushHardness: 100 });
  expect(project.editCellAt(35, 5)).toMatchObject({ char: '═', fg: '#0061ff' });
  const ctx = { project, workspace, view: 'output' }, shown = (col, row) => project.cells[cellIndex(col, row, project.cols)];
  // Its top edge on pixel row 11, the bottom halves of row 5: cols 30 to 40 cross the line box's top, 41 to 50 don't.
  shapes.begin(ctx, { x: 30.5, y: 11.5 });
  shapes.move(ctx, { x: 30.5, y: 11.5 }, { x: 50.5, y: 19.5 });
  shapes.end(ctx);
  // The Brush along pixel row 14, the top halves of row 7, across the box's left side (col 14) and a letter typed on a
  // background of its own (col 16), which stays in the half the Brush leaves.
  project.typeAt(16, 7, 'A', { fg: '#ff0000', bg: '#00ff00' });
  project.commitEdit();
  brush.begin(ctx, { x: 8.5, y: 14.5 }, {});
  brush.move(ctx, { x: 8.5, y: 14.5 }, { x: 18.5, y: 14.5 });
  brush.end(ctx);
  await settle(project);
  const look = ({ char, fg, bg }) => ({ char, fg, bg });
  for (const col of [30, 35, 40]) {
    expect(project.editCellAt(col, 5)).toEqual({ char: '▄' });
    expect(look(shown(col, 5))).toEqual(look(shown(45, 5)));
  }
  expect(project.editCellAt(14, 7)).toEqual({ char: '▄' });
  expect(look(shown(14, 7))).toEqual(look(shown(10, 7)));
  expect(project.editCellAt(16, 7)).toEqual({ char: '▄' });
  expect([shown(16, 7).char, shown(16, 7).bg.hex, shown(16, 7).fg.hex]).toEqual(['▄', shown(10, 7).bg.hex, '#00ff00']);
});

// The same on the base, where a pinned character's colors are its two pixels, its foreground the lower one: a block
// written there kept the line's blue in that pixel.
test('R5: on the base, a Half-block box with Write block glyphs over a typed line makes ▄s in the line\'s background, as elsewhere', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ cols: 40, rows: 20 });
  await settle(project);
  workspace.pickLayer('base');
  for (let col = 5; col < 15; col++) project.typeAt(col, 5, '═', { fg: '#0061ff' });
  project.commitEdit();
  Object.assign(workspace, { editFgColor: '#ffffff', editBgNone: true, shapeKind: 'rect', shapeDrawWith: 'half', shapeBlockChars: true });
  const ctx = { project, workspace, view: 'output' };
  shapes.begin(ctx, { x: 8.5, y: 10.5 }); // its top edge on the top halves of row 5: cols 8 to 14 cross the line
  shapes.move(ctx, { x: 8.5, y: 10.5 }, { x: 20.5, y: 16.5 });
  shapes.end(ctx);
  await settle(project);
  const look = (col, row) => { const { char, fg, bg } = project.cells[cellIndex(col, row, project.cols)]; return [char, fg.hex, bg.hex]; };
  expect(look(10, 5)).toEqual(['▄', '#000000', '#ffffff']);
  expect(look(10, 5)).toEqual(look(18, 5));
});

// The same box on a layer above the line: a line on the base under Layer 1, or on Layer 1 under Layer 2. The ▄ there was
// shown with the line's foreground in its bottom half, the colors of the cell under it, so it showed whole cells too; it
// takes the character's place (blockOver), Merge down puts it there, and the stored look (the Eyedropper's, a freeze's)
// says what shows.
for (const linesOn of ['base', 'layer'])
  for (const merge of [false, true]) {
    test(`R5: a Half-block box with Write block glyphs on the layer above a line ${linesOn === 'base' ? 'on the base' : 'on a layer'} shows ▄s in the line's background${merge ? ', and Merge down keeps them' : ''}`, async () => {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ cols: 40, rows: 20 });
      await settle(project);
      let lines = 'base';
      if (linesOn === 'layer') lines = project.addLayer('cells', 'base');
      workspace.pickLayer(lines);
      for (let col = 5; col < 15; col++) project.typeAt(col, 5, '═', { fg: '#0061ff' });
      project.typeAt(15, 5, 'A', { fg: '#ff0000', bg: '#00ff00' }); // a background of its own, which the block keeps
      project.commitEdit();
      const box = project.addLayer('cells', lines);
      workspace.pickLayer(box);
      Object.assign(workspace, { editFgColor: '#ffffff', editBgNone: true, shapeKind: 'rect', shapeDrawWith: 'half', shapeBlockChars: true });
      const ctx = { project, workspace, view: 'output' };
      shapes.begin(ctx, { x: 8.5, y: 10.5 }); // its top edge on the top halves of row 5: cols 8 to 15 cross the line
      shapes.move(ctx, { x: 8.5, y: 10.5 }, { x: 20.5, y: 16.5 });
      shapes.end(ctx);
      await settle(project);
      if (merge) {
        project.mergeDown(box);
        await settle(project);
      }
      const look = (col, row) => { const { char, fg, bg } = project.cells[cellIndex(col, row, project.cols)]; return [char, fg.hex, bg.hex]; };
      expect(look(10, 5)).toEqual(['▄', '#000000', '#ffffff']);
      expect(look(10, 5)).toEqual(look(18, 5));
      expect(look(15, 5)).toEqual(['▄', '#00ff00', '#ffffff']);
      for (const col of [10, 15]) {
        const stored = project.storedLookAt(col, 5);
        expect([stored.char, stored.fg.toLowerCase(), stored.bg.toLowerCase()]).toEqual(look(col, 5));
      }
    });
  }

test('blockOver: a textured character\'s block is its background in both halves; a solid or empty glyph keeps its halves', () => {
  expect(blockOver({ char: '═', fg: 'F', bg: 'B', fgIndex: 1, bgIndex: 2 })).toEqual({ char: '▄', fg: 'B', bg: 'B', fgIndex: 2, bgIndex: 2 });
  expect(blockOver({ char: '█', fg: 'F', bg: 'B' })).toMatchObject({ char: '▄', fg: 'F', bg: 'F' });
  expect(blockOver({ char: '▀', fg: 'F', bg: 'B' })).toMatchObject({ char: '▄', fg: 'B', bg: 'F' });
  expect(blockOver({ char: ' ', fg: 'F', bg: 'B' })).toMatchObject({ char: '▄', fg: 'B', bg: 'B' });
});

// The report (projects/boxes2.phosphor: a double-line box pinned on the base): Half-block boxes placed over it a half
// cell apart came out otherwise, whole cells at some offsets. With the Shape tool's Write block glyphs and the Pencil's
// Half-block, on the base or on a layer above, each cell a box touches shows its paint in the half it paints and, in the
// other, what was there with the character gone (a pin's background, else the pixel); a corner the Pencil passes twice
// keeps its halves (a ▄ pinned already isn't given its top color twice); Merge down onto the base changes nothing, and
// undo puts every cell back.
for (const on of ['base', 'layer'])
  for (const tool of ['shape', 'pencil']) {
    test(`R5: the report: Half-block boxes over a line box, ${tool === 'shape' ? 'the Shape tool with Write block glyphs' : 'the Pencil'}, on ${on === 'base' ? 'the base' : 'a layer'}, a half cell apart`, async () => {
      const halves = (cell) => { const cov = coverageOf(cell.char); return cov.every((c) => c === 0 || c === 1) ? cov.map((c) => (c ? cell.fg.hex : cell.bg.hex)) : cell.char; };
      for (const [x0, y0, x1, y1] of [[20, 10, 30, 20], [20, 11, 30, 21], [12, 9, 16, 12], [46, 24, 50, 27]]) { // the line box: cols 15 to 48, rows 5 to 12
        const { project, workspace } = await createTestApp();
        await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/boxes2.phosphor')).arrayBuffer()], 'x.phosphor'));
        await settle(project);
        workspace.pickLayer(on === 'base' ? 'base' : project.addLayer('cells', 'base'));
        Object.assign(workspace, { editFgColor: '#ffffff', editBgNone: true, shapeKind: 'rect', shapeDrawWith: 'half', shapeBlockChars: true, pencilDrawWith: 'half' });
        const ctx = { project, workspace, view: 'output' }, { cols } = project, at = (x, y) => ({ x: x + 0.5, y: y + 0.5 });
        const before = project.cells.map(halves);
        const left = project.cells.map((c, i) => { // what a half the box leaves shows
          const col = i % cols, row = (i - col) / cols, top = project.baseColorAt(col, 2 * row).toLowerCase();
          return project.baseRecords.pins.has(`${col},${row}`) ? [top, top] : [top, project.baseColorAt(col, 2 * row + 1).toLowerCase()];
        });
        if (tool === 'shape') {
          shapes.begin(ctx, at(x0, y0));
          shapes.move(ctx, at(x0, y0), at(x1, y1));
          shapes.end(ctx);
        } else {
          const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
          pencil.begin(ctx, at(...corners[0]), {});
          for (let i = 1; i < corners.length; i++) pencil.move(ctx, at(...corners[i - 1]), at(...corners[i]));
          pencil.end(ctx);
        }
        await settle(project);
        const painted = (x, y) => (x === x0 || x === x1 ? y >= y0 && y <= y1 : (y === y0 || y === y1) && x >= x0 && x <= x1);
        const wrong = project.cells.map((cell, i) => {
          const col = i % cols, row = (i - col) / cols, paint = [painted(col, 2 * row), painted(col, 2 * row + 1)];
          const want = paint.some(Boolean) ? paint.map((p, k) => (p ? '#ffffff' : left[i][k])) : before[i];
          return JSON.stringify(halves(cell)) === JSON.stringify(want) ? null : `(${col},${row}) ${cell.char} ${cell.fg.hex}/${cell.bg.hex}, not ${want}`;
        }).filter(Boolean);
        expect(wrong).toEqual([]);
        if (on === 'layer') {
          const shown = project.cells.map(halves);
          project.mergeDown(project.editId);
          await settle(project);
          expect(project.cells.map(halves)).toEqual(shown);
          project.undo();
        }
        project.undo();
        await settle(project);
        expect(project.cells.map(halves)).toEqual(before);
      }
    });
  }

// The same report with Write block glyphs off, how the Shape tool starts (and is again after a reload): its Half-block
// laid paint alone, which tints a character of someone's own, an edge on a line's top half its background, the whole
// cell, and one on its bottom half the line itself, so a box half a cell up or down crossed the line otherwise. The
// cells that show someone's character (ownCharAt) become ▄s, the paint in the half it covers; the rest stay paint, which
// brings Random's characters out of the blank canvas as paint there does (R5), no ▄ written.
for (const on of ['base', 'layer']) {
  test(`R5: the report: with Write block glyphs off, a Half-block box on ${on === 'base' ? 'the base' : 'a layer'} crosses a line in ▄s, and over the canvas its paint is Random's characters`, async () => {
    const halves = (cell) => { const cov = coverageOf(cell.char); return cov.every((c) => c === 0 || c === 1) ? cov.map((c) => (c ? cell.fg.hex : cell.bg.hex)) : cell.char; };
    for (const [x0, y0, x1, y1] of [[20, 10, 30, 20], [20, 11, 30, 21]]) { // the top edge on the ═ row's top halves, then its bottom halves
      const { project, workspace } = await createTestApp();
      await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/boxes2.phosphor')).arrayBuffer()], 'x.phosphor'));
      await settle(project);
      workspace.pickLayer(on === 'base' ? 'base' : project.addLayer('cells', 'base'));
      Object.assign(workspace, { editFgColor: '#ffffff', editBgNone: true, shapeKind: 'rect', shapeDrawWith: 'half', shapeBlockChars: false });
      const ctx = { project, workspace, view: 'output' }, { cols } = project, before = project.cells.map(halves);
      const pinned = (col, row) => project.baseRecords.pins.has(`${col},${row}`), lines = new Set([...project.baseRecords.pins.keys()]);
      const top = (col, row) => project.baseColorAt(col, 2 * row).toLowerCase(), bg = new Map([...lines].map((key) => [key, top(...key.split(',').map(Number))]));
      shapes.begin(ctx, { x: x0 + 0.5, y: y0 + 0.5 });
      shapes.move(ctx, { x: x0 + 0.5, y: y0 + 0.5 }, { x: x1 + 0.5, y: y1 + 0.5 });
      shapes.end(ctx);
      await settle(project);
      const painted = (x, y) => (x === x0 || x === x1 ? y >= y0 && y <= y1 : (y === y0 || y === y1) && x >= x0 && x <= x1);
      const crossed = [], canvas = [];
      project.cells.forEach((cell, i) => {
        const col = i % cols, row = (i - col) / cols, paint = [painted(col, 2 * row), painted(col, 2 * row + 1)];
        if (!paint.some(Boolean)) return expect(halves(cell)).toEqual(before[i]);
        (lines.has(`${col},${row}`) ? crossed : canvas).push({ col, row, cell, paint });
      });
      expect(crossed.length).toBeGreaterThan(10);
      for (const { col, row, cell, paint } of crossed) expect([col, row, halves(cell)]).toEqual([col, row, paint.map((p) => (p ? '#ffffff' : bg.get(`${col},${row}`)))]);
      // No ▄ written over the canvas, on the base or the layer, and what shows there is Random's set, not ▄ alone.
      expect(canvas.filter(({ col, row }) => (on === 'base' ? pinned(col, row) : project.editCellAt(col, row)))).toEqual([]);
      expect(new Set(canvas.map(({ cell }) => cell.char)).size).toBeGreaterThan(1);
      project.undo();
      await settle(project);
      expect(project.cells.map(halves)).toEqual(before);
    }
  });
}
