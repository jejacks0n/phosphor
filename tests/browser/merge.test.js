// Merge down: exactly (crisp, untouched by effects), or into the picture (part of the image, so the
// effects reach it), for the whole edit layer or a selection (docs/layers.md, Moving things between
// layers).
import { describe, test, expect, vi } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey, halves } from '../support/app.js';
import { drawnDocument } from '../support/scenes.js';
import { rectShape, ellipseShape, fillAs } from '@/document/shapes.js';
import { brushPixels } from '@/lib/Brushes';
import { toastMessage } from '@/composables/useToast.js';
import { createApp } from 'vue';
import EditToolbar from '@/components/EditToolbar.vue';
import { i18n } from '@/i18n';
import { blur } from '@/tools/retouch';
import { getTool } from '@/tools';
import { isFrozen, ownEntry } from '@/document/editCells.js';
import { ctx2d } from '@/lib/Canvas.js';
import { coverageOf, loadReferenceFont } from '@/lib/GlyphCoverage.js';
import { drawGlyphCell } from '@/lib/glyphPicture.js';
import { hex2rgb } from '@/lib/ColorUtils.js';

const looks = (project) => project.cells.map(({ char, fg, bg }) => ({ char, fg: { r: fg.r, g: fg.g, b: fg.b }, bg: { r: bg.r, g: bg.g, b: bg.b } }));
const apart = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
// The one color a cell shows all over (a █, a space, or a character in its background's color), or null: two such cells
// look the same whatever their characters (merging.js sameLook: By shape breaks the tie between them one way above a
// layer and another on it).
const flatColor = ({ char, fg, bg }) => (apart(fg, bg) <= 2 ? bg : coverageOf(char).every((v) => v === 0) ? bg : coverageOf(char).every((v) => v === 1) ? fg : null);
// The same look: the same characters, and colors no more than the step or two apart that the same color rounds to when
// worked out another way (merging.js ROUNDING), or two cells of one color each, those colors as near. Cells at skip
// (indexes) aren't compared.
function expectLooksAlike(now, was, skip = new Set()) {
  const off = now.map((cell, i) => {
    if (skip.has(i)) return null;
    const fa = flatColor(cell), fb = flatColor(was[i]);
    if (fa && fb) return apart(fa, fb) <= 2 ? null : `${i}: ${cell.char} vs ${was[i].char}`;
    return cell.char === was[i].char && apart(cell.fg, was[i].fg) <= 2 && apart(cell.bg, was[i].bg) <= 2 ? null : `${i}: ${cell.char} ${JSON.stringify(cell.fg)} vs ${was[i].char} ${JSON.stringify(was[i].fg)}`;
  }).filter(Boolean);
  expect(off).toEqual([]);
}

// The cells (indexes) a cells layer's paint covers only in part, a half clear or see-through: a shape's or a stroke's
// soft edge, where what's under it shows through. A merge leaves them paint, never frozen (docs/model.md R3), so they
// convert as the layer converts its paint: a step or a character off what showed, the rest as it showed.
function softCells(project, id) {
  const paint = project.paintOf(id), soft = new Set(), rows = Math.floor(project.rows / 2);
  for (let row = 0; row < rows; row++) for (let col = 0; col < project.cols; col++) {
    const a = [paint?.pixelAt(col, 2 * row)?.a ?? 0, paint?.pixelAt(col, 2 * row + 1)?.a ?? 0];
    if (a.some((v) => v > 0) && a.some((v) => v < 1)) soft.add(row * project.cols + col);
  }
  return soft;
}
// The merge kept every cell but the soft ones, which are paint.
function expectKeptButSoft(project, id, was) {
  const soft = softCells(project, id);
  expectLooksAlike(looks(project), was, soft);
  expect([...soft].filter((i) => isFrozen(project.cellsOf(id).get(`${i % project.cols},${Math.floor(i / project.cols)}`)))).toEqual([]);
  return soft;
}

// The picture's pixels in a cell's block (m by 2m), row by row, as hex.
function pictureBlock(project, col, row) {
  const { image } = project, fit = project.fitFor(project.cols, project.rows), m = image.width / fit.dw;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const picture = ctx2d(canvas);
  picture.drawImage(image, 0, 0);
  const data = picture.getImageData((col - fit.dx) * m, (2 * row - fit.dy) * m, m, 2 * m).data, pixels = [];
  for (let i = 0; i < data.length; i += 4) pixels.push(`#${[0, 1, 2].map((k) => data[i + k].toString(16).padStart(2, '0')).join('')}`);
  return pixels;
}
// Undo after a merge into the picture: the layer back with its entries, the base's pins and the picture as they were.
function expectRestored(project, id, was) {
  expect(project.layerById(id)).toBeTruthy();
  expect(project.image).toBe(was.image);
  expect(new Map(project.baseRecords.pins)).toEqual(was.pins);
  expect(new Map(project.cellsOf(id))).toEqual(was.entries);
}

const maxDiff = (a, b, only) => (only ?? a.map((_, i) => i)).reduce((m, i) => Math.max(m, ...a[i].map((v, k) => Math.abs(v - b[i][k]))), 0);
const drawnCells = (project, rect) => {
  const at = new Set([...project.editCells.keys()]);
  const rows = Math.floor(project.rows / 2);
  for (let row = 0; row < rows; row++) for (let col = 0; col < project.cols; col++) if (project.cellHasPaint(col, row)) at.add(`${col},${row}`);
  return [...at].map((k) => k.split(',').map(Number))
    .filter(([c, r]) => !rect || (c >= rect.c0 && c <= rect.c1 && r >= rect.r0 && r <= rect.r1))
    .map(([c, r]) => r * project.cols + c);
};

// First in the file: the reference font (IBM VGA) hasn't loaded yet, and Brightness never asks for it. Blend waits for it
// before drawing a laid block in (a shape's: Half-column detail, Write block glyphs), so the glyph is IBM VGA's, not a
// fallback font's baked into the picture.
test('Blend into source image draws a laid block in the reference font, waiting for it to load', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
  project.renderStyle = 'ascii';
  await settle(project);
  workspace.pickLayer('edit');
  project.writeEditCells([{ col: 5, row: 5, attrs: { char: '▚', fg: '#ffffff', bg: '#000000', laid: true } }]);
  project.commitEdit();
  await settle(project);
  await project.mergeIntoPicture();
  await settle(project);
  await loadReferenceFont();
  const m = project.image.width / project.fitFor(project.cols, project.rows).dw;
  const ctx = ctx2d(Object.assign(document.createElement('canvas'), { width: m, height: 2 * m }));
  drawGlyphCell(ctx, { char: '▚', fg: '#ffffff', bg: '#000000' }, 0, 0, m);
  const data = ctx.getImageData(0, 0, m, 2 * m).data, want = [];
  for (let i = 0; i < data.length; i += 4) want.push(`#${[0, 1, 2].map((k) => data[i + k].toString(16).padStart(2, '0')).join('')}`);
  expect(pictureBlock(project, 5, 5)).toEqual(want);
});

describe('exactly', () => {
  test('the whole edit layer: nothing on the canvas changes, and undo/redo are exact', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const before = cellsKey(project);
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect(project.layers.map((l) => l.id)).toEqual(['base']); // the merged layer leaves the stack
    expect(project.hasPaint).toBe(false);
    project.undo();
    await settle(project);
    expect(project.cellsOf('edit').size).toBe(4);
    project.redo();
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
  });

  // docs/model.md R1: a paint block outside ANSI is its paint: Keep crisp cells makes base pixels of it, nothing pinned.
  test('R1: Keep crisp cells in Color ASCII brings Colors only\'s paint down as pixels, with no pin, and nothing changes', async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    project.renderStyle = 'colorAscii';
    await settle(project);
    workspace.pickLayer('edit');
    project.writeEditCells([{ col: 5, row: 3, attrs: { char: '▄' } }]);
    project.paintEditPixels([{ x: 5, y: 6, r: 255, g: 255, b: 255, alpha: 1 }, { x: 5, y: 7, r: 255, g: 255, b: 255, alpha: 1 }]);
    project.commitEdit();
    await settle(project);
    const before = cellsKey(project);
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect(project.baseRecords.pins.get('5,3')).toBeUndefined();
    expect(project.baseColorAt(5, 6)).toBe('#ffffff');
  });

  // docs/model.md R15: the report: in Monochrome ASCII, Keep crisp cells turned the Half-column detail circle's ▄s into
  // @ and the like. A ▄ pin was its cell's two pixels outside ANSI, so the base converted it; a laid or typed ▄ goes onto
  // the base marked a character, and shows as ▄ in every style. Half-block's ▄ is still paint (R1): pixels, no pin.
  test.each(['colorAscii', 'ascii'])('R15: the report: Keep crisp cells in %s keeps a laid ▄ and a typed ▄ as ▄', async (renderStyle) => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    project.renderStyle = renderStyle;
    await settle(project);
    workspace.pickLayer('edit');
    project.writeEditCells([
      { col: 3, row: 3, attrs: { char: '▄', fg: '#ffffff', bg: '#000000', laid: true } }, // Half-column detail's
      { col: 4, row: 3, attrs: { char: '▄', fg: '#ffff55', bg: '#000000' } },             // typed
      { col: 5, row: 3, attrs: { char: '▄' } },                                            // Half-block's
    ]);
    project.paintEditPixels([{ x: 5, y: 7, r: 255, g: 255, b: 255, alpha: 1 }]);
    project.commitEdit();
    await settle(project);
    const at = (col) => project.cells[3 * project.cols + col].char, painted = at(5);
    expect([at(3), at(4)]).toEqual(['▄', '▄']);
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expect([at(3), at(4), at(5)]).toEqual(['▄', '▄', painted]);
    expect([...project.baseRecords.chars.keys()].sort()).toEqual(['3,3', '4,3']);
    expect(project.baseRecords.pins.has('5,3')).toBe(false);
    project.undo();
    await settle(project);
    expect(project.baseRecords.chars.size).toBe(0);
    project.redo();
    await settle(project);
    project.renderStyle = 'ansi';
    await settle(project);
    project.renderStyle = renderStyle;
    await settle(project);
    expect([at(3), at(4)]).toEqual(['▄', '▄']);
    // Typed on the base itself: a character too. A recolor keeps it one; another character over it takes the mark away.
    workspace.pickLayer('base');
    project.writeEditCells([{ col: 8, row: 3, attrs: { char: '▄', fg: '#55ff55', bg: '#000000' } }]);
    await settle(project);
    expect(at(8)).toBe('▄');
    project.writeEditCells([{ col: 8, row: 3, attrs: { char: '▄', fg: '#ff5555', bg: '#000000' } }]);
    project.writeEditCells([{ col: 3, row: 3, attrs: { char: 'A', fg: '#ffffff', bg: '#000000' } }]);
    await settle(project);
    expect(at(8)).toBe('▄');
    expect([...project.baseRecords.chars.keys()].sort()).toEqual(['4,3', '8,3']);
  });

  // docs/model.md R8: Color ASCII shows a typed cell's background; the base shows a pin's two pixels as background and
  // ink where they differ, so Keep crisp cells keeps the look. The report (projects/text-merge-base.phosphor): black text
  // typed over white paint, blurred, then Layer 1 merged onto the base, came back black on black.
  test('R8: the report: text with a background merged onto the base in Color ASCII keeps its background', async () => {
    const { project } = await createTestApp();
    await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/text-merge-base.phosphor')).arrayBuffer()], 'x.phosphor'));
    await settle(project);
    const before = looks(project), at = 10 * project.cols + 26; // the 't' of "this"
    expect([project.cells[at].char, project.cells[at].fg.hex, project.cells[at].bg.hex]).toEqual(['t', '#000000', '#999898']);
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expectLooksAlike(looks(project), before);
    expect(project.baseRecords.pins.get('26,10')).toBe('t');
  });

  // docs/model.md R3: the report (projects/keep-crisp-under-vectors.phosphor): a photo on CGA under Best match, Layer 1
  // with Brush paint, a typed caption and Blur strokes, and a vector layer above it with its own Ordered dither. Keep
  // crisp cells changed dozens of cells: soft paint over a cell was mixed into its stored colors before the palette's
  // snap instead of after, and paint with no cell under it was picked again from the base's snapped pixels. A cell that
  // would show otherwise as base pixels is written as it showed, pinned.
  test('R3: the report: Keep crisp cells under soft paint and a dithered vector layer changes nothing on the canvas', async () => {
    const { project } = await createTestApp();
    await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/keep-crisp-under-vectors.phosphor')).arrayBuffer()], 'x.phosphor'));
    await settle(project);
    expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', 'L2']);
    const before = looks(project);
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expectLooksAlike(looks(project), before);
    project.undo();
    await settle(project);
    expectLooksAlike(looks(project), before);
    project.redo();
    await settle(project);
    expectLooksAlike(looks(project), before);
  });

  // docs/model.md R1 and R8: Into the image in Color ASCII. The report (projects/text-merge-base.phosphor): Layer 1's
  // Colors only ▄s counted as characters, so their cells went in as pins with each half's paint over the picture's black,
  // two pixels that differ, which a pin now shows as a background: 331 cells got one. A paint block outside ANSI is the
  // converter's paint, into the picture. The text is someone's own, so it merges exactly, pinned (R3), as it showed.
  test('R1: the report: Into the image in Color ASCII gives no cell a background it didn\'t show, and keeps the text', async () => {
    const { project } = await createTestApp();
    await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/text-merge-base.phosphor')).arrayBuffer()], 'x.phosphor'));
    await settle(project);
    const before = project.cells.map((c) => c.bg.hex), pins = new Set(project.baseRecords.pins.keys());
    const text = [...project.cellsOf('edit')].filter(([, entry]) => ownEntry(entry, 'colorAscii')).map(([key, entry]) => [key, entry.char]);
    expect(text.length).toBeGreaterThan(0); // the text; the rest are Colors only's ▄s
    await project.mergeIntoPicture();
    await settle(project);
    const after = project.cells.map((c) => c.bg.hex);
    expect(after.filter((bg, i) => bg !== '#000000' && before[i] === '#000000')).toHaveLength(0);
    expect(text.map(([key]) => project.baseRecords.pins.get(key))).toEqual(text.map(([, char]) => char)); // the text pinned
    expect([...project.baseRecords.pins.keys()].filter((key) => !pins.has(key)).sort()).toEqual(text.map(([key]) => key).filter((key) => !pins.has(key)).sort()); // the strokes' cells not
  });

  // Into the image keeps the letter as Keep crisp cells does: someone's own merges exactly (R3).
  test('R8: in Color ASCII a letter tinted by paint stays ink on black through Keep crisp cells and Into the image', async () => {
    for (const into of [false, true]) {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
      project.renderStyle = 'colorAscii';
      await settle(project);
      workspace.pickLayer('edit');
      project.typeAt(4, 4, 'A', { fg: '#ff0000' });
      project.commitEdit();
      project.paintEditPixels([{ x: 4, y: 8, r: 255, g: 255, b: 255, alpha: 1 }]); // the top half tinted
      project.commitEdit();
      await settle(project);
      const shown = project.cells[4 * 20 + 4];
      expect(shown.bg.hex).toBe('#000000');
      if (into) await project.mergeIntoPicture();
      else expect(project.mergeDown('edit')).toBe(true);
      await settle(project);
      const cell = project.cells[4 * 20 + 4];
      expect(cell.bg.hex).toBe('#000000');
      expect(cell.char).toBe('A');
      expect(Math.max(...['r', 'g', 'b'].map((k) => Math.abs(cell.fg[k] - shown.fg[k])))).toBeLessThanOrEqual(1);
    }
  });

  test('R8: in Color ASCII a typed cell with a background merges onto the base as its two colors, one without as ink on black, and a pin of one color shows on black', async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    project.renderStyle = 'colorAscii';
    await settle(project);
    workspace.pickLayer('edit');
    project.typeAt(4, 4, 'A', { fg: '#000000', bg: '#ffffff' });
    project.typeAt(6, 4, 'B', { fg: '#ff0000' });
    project.commitEdit();
    await settle(project);
    const before = cellsKey(project);
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect([project.baseColorAt(4, 8), project.baseColorAt(4, 9)]).toEqual(['#ffffff', '#000000']); // its two colors
    expect([project.baseColorAt(6, 8), project.baseColorAt(6, 9)]).toEqual(['#ff0000', '#ff0000']); // ink on black: the ink twice
    project.writeBaseCells([{ col: 8, row: 4, char: 'C', fg: '#00ff00', bg: '#00ff00' }]); // as Set FG writes on the base
    project.commitEdit();
    await settle(project);
    const c = project.cells[4 * 20 + 8];
    expect([c.char, c.fg.hex, c.bg.hex]).toEqual(['C', '#00ff00', '#000000']);
  });

  test('a selection: only what is inside merges; edits and paint outside stay', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const rect = { c0: 10, r0: 5, c1: 21, r1: 20 }; // the paint at y 40 (row 20) straddles c1
    const outside = [...project.editCells.keys()].filter((k) => { const [c, r] = k.split(',').map(Number); return c > rect.c1 || r > rect.r1 || c < rect.c0 || r < rect.r0; });
    const before = cellsKey(project);
    project.mergeDown('edit', rect);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect([...project.editCells.keys()].sort()).toEqual(outside.sort());
    expect(project.cellHasPaint(30, 20)).toBe(true);
    expect(project.cellHasPaint(20, 20)).toBe(false);
  });
});

describe('into the picture', () => {
  test('a picture that can\'t be encoded says so and changes nothing', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const before = halves(project), image = project.image;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const encoding = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null));
    try {
      await project.mergeIntoPicture();
      expect(alert).toHaveBeenCalledWith('Could not merge into the image.');
    } finally {
      encoding.mockRestore();
      alert.mockRestore();
      error.mockRestore();
    }
    await settle(project);
    expect(project.image).toBe(image);
    expect(halves(project)).toEqual(before);
  });

  // docs/model.md R3: a letter is someone's own, so it merges exactly, pinned, and everything looks the same. Typed
  // blocks go into the picture and are picked again, unpinned, the same look at neutral.
  test('at neutral: the same look; the typed letter and space pinned as they are, the typed blocks not', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const before = halves(project);
    await project.mergeIntoPicture();
    await settle(project);
    expect(maxDiff(before, halves(project))).toBeLessThanOrEqual(1); // soft paint can round a level
    const char = (c, r) => project.cells[r * project.cols + c].char;
    for (const [col, typed] of [[14, 'A'], [22, ' ']]) expect([project.baseRecords.pins.get(`${col},8`), char(col, 8)]).toEqual([typed, typed]);
    expect([12, 20].filter((col) => project.baseRecords.pins.has(`${col},8`))).toEqual([]); // the typed █ and ▀
    expect(project.imageIsWorkingCopy).toBe(true);
    expect(project.editCells.size).toBe(0);
  });

  // docs/model.md R3: a frozen cell is paint (R1): Into the image takes the paint under it into the picture, not its pin,
  // so Blur and the filters reach it as they reach the rest of the paint. The report: a vector layer's shapes merged into
  // Layer 1 under its own By shape, then Layer 1 blended into the picture, kept their ▐ ▂ ▅ pinned, which Blur wouldn't touch.
  test('R3: Into the image takes a frozen cell\'s paint, not its pin', async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    await settle(project);
    workspace.pickLayer('edit');
    project.paintEditPixels([{ x: 5, y: 10, r: 255, g: 0, b: 0, alpha: 1 }, { x: 5, y: 11, r: 255, g: 0, b: 0, alpha: 1 }]);
    project.commitEdit();
    project.setEditCells(new Map([...project.editCells, ['5,5', Object.freeze({ char: 'A', fg: '#00ff00', bg: '#0000ff', frozen: true })]]), ['5,5']);
    project.commitEdit();
    project.render();
    await settle(project);
    await project.mergeIntoPicture();
    await settle(project);
    expect(project.baseRecords.pins.has('5,5')).toBe(false);
    expect(new Set(pictureBlock(project, 5, 5))).toEqual(new Set(['#ff0000']));
  });

  test('with Edges on, the effects reach the merged drawing and follow the slider', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    project.edges = 3;
    await settle(project);
    const merged = drawnCells(project);
    const before = halves(project);
    await project.mergeIntoPicture();
    await settle(project);
    const atThree = halves(project);
    expect(maxDiff(before, atThree, merged)).toBeGreaterThan(0);
    project.edges = 6;
    await settle(project);
    expect(maxDiff(atThree, halves(project), merged)).toBeGreaterThan(0);
  });

  test('a selection merges only what is inside it', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const rect = { c0: 10, r0: 5, c1: 21, r1: 12 }, letter = 8 * project.cols + 14; // the letter is picked again (R3)
    const before = halves(project);
    await project.mergeIntoPicture(rect);
    await settle(project);
    expect(maxDiff(before, halves(project), before.map((_, i) => i).filter((i) => i !== letter))).toBeLessThanOrEqual(1);
    expect(project.editCellAt(14, 8)).toBeUndefined();
    expect(project.hasPaint).toBe(true); // the paint below the selection stays
  });

  test('drawing in the letterbox merges exactly into the base layer', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/tall.png', { cols: 40, rows: 40 }); // pillarboxed
    project.paintStroke([{ x: 1, y: 10, alpha: 1 }, { x: 1, y: 11, alpha: 1 }], '#00ffff');
    project.commitEdit();
    await settle(project);
    const before = halves(project);
    await project.mergeIntoPicture();
    await settle(project);
    expect(maxDiff(before, halves(project))).toBe(0);
    expect(project.baseLayer.pixelAt(1, 10)).toBeTruthy();
  });

  test('twice in a row keeps the working size; undo and redo are exact', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    await project.mergeIntoPicture();
    await settle(project);
    const size = `${project.image.width}x${project.image.height}`;
    expect(project.layers.map((l) => l.id)).toEqual(['base']); // the merged layer left the stack: draw on a new one
    const next = project.addLayer('cells', 'base');
    workspace.pickLayer(next);
    project.typeAt(30, 20, '█', { fg: '#00ffff', bg: '#000000' });
    project.commitEdit();
    await settle(project);
    const beforeSecond = cellsKey(project);
    await project.mergeIntoPicture();
    await settle(project);
    const afterSecond = cellsKey(project);
    expect(`${project.image.width}x${project.image.height}`).toBe(size);
    project.undo();
    await settle(project);
    expect(project.cellsOf(next).get('30,20')).toBeTruthy();
    expect(cellsKey(project)).toEqual(beforeSecond);
    project.redo();
    await settle(project);
    expect(cellsKey(project)).toEqual(afterSecond);
  });

  test('paint past a shrunk grid edge survives', async () => {
    const { project } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 60, rows: 60 });
    project.paintStroke(Array.from({ length: 10 }, (_, k) => ({ x: 48 + k, y: 30, alpha: 1 })), '#00ff00');
    project.commitEdit();
    project.cols = 52;
    await settle(project);
    await project.mergeIntoPicture();
    await settle(project);
    project.cols = 60;
    await settle(project);
    expect(project.cellHasPaint(55, 15)).toBe(true);
  });

  // docs/model.md R3: Blend into source image keeps a character of someone's own pinned, so a letter stays a letter (the
  // converter would pick the base's characters there), and a wide one too; a typed space under soft paint shows the
  // paint (R2), so it goes in as paint: its glyph, a space's background, with the paint over it. Undo brings back the
  // layer, the pins and the picture.
  test('R3: Blend into source image keeps a typed letter pinned, puts a space under paint in as paint, and undo brings it back', async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    project.renderStyle = 'ascii';
    project.charChoiceAscii = 'shape'; // Brightness reads a cell's average, which a light Blur keeps: By shape sees it
    await settle(project);
    workspace.pickLayer('edit');
    project.typeAt(5, 5, 'A', { fg: '#ffffff', bg: '#000000' });
    project.typeAt(12, 5, '漢', { fg: '#ffffff', bg: '#000000' }); // a wide character merges exactly
    project.typeAt(8, 5, ' ', { fg: '#ffffff', bg: '#000000' }); // a space with soft paint over its lower half
    project.commitEdit();
    project.paintEditPixels([{ x: 8, y: 11, r: 0x33, g: 0xff, b: 0x66, alpha: 0.4 }]);
    project.commitEdit();
    await settle(project);
    const was = { image: project.image, pins: new Map(project.baseRecords.pins), entries: new Map(project.cellsOf('edit')), look: cellsKey(project) };
    await project.mergeIntoPicture();
    await settle(project);
    expect([project.baseRecords.pins.get('5,5'), project.cells[5 * 20 + 5].char]).toEqual(['A', 'A']);
    expect([project.baseRecords.pins.get('12,5'), project.cells[5 * 20 + 12].char]).toEqual(['漢', '漢']);
    expect(project.baseRecords.pins.has('8,5')).toBe(false);
    // the paint over each pixel of its half, the other half its glyph's (a space's: its background)
    const space = pictureBlock(project, 8, 5).map((hex) => { const { r, g, b } = hex2rgb(hex); return [r, g, b]; }), half = space.length / 2;
    expect(maxDiff(space, space.map((_, i) => (i < half ? [0, 0, 0] : [0x33 * 0.4, 0xff * 0.4, 0x66 * 0.4])))).toBeLessThanOrEqual(2);
    project.undo();
    await settle(project);
    expectRestored(project, 'edit', was);
    expect(cellsKey(project)).toEqual(was.look);
    project.redo();
    await settle(project);
    expect(project.baseRecords.pins.get('5,5')).toBe('A');
  });

  // docs/model.md R3 and R4. The report (the review matrix's setup, ANSI, VGA, Best match, Blocks & shades): Vector 1, with
  // By shape of its own, merged into Layer 1, then Layer 1 blended into the picture. The ▐ ▂ ▅ the merge froze stayed
  // pinned and Blur wouldn't touch them, while the poem's letters were drawn in and picked again as the base's blocks.
  // A letter is someone's own: it stays pinned, and Blur recolors it. A frozen cell is paint, and a laid block and a
  // hand-drawn one are drawing in blocks: they go into the picture, unpinned, where Blur reaches them.
  test('R3: the report: Blend into source image keeps letters and lets the shapes\' blocks blur', async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20, quantize: 'vga' });
    project.setLayerChars('base', { charChoice: 'best', chars: '▄░▒▓█', solids: 10 });
    project.commitLayerChars();
    await settle(project);
    workspace.pickLayer('edit');
    project.paintEditPixels([10, 11].flatMap((y) => [5, 6, 7, 8, 9].map((x) => ({ x, y, r: 255, g: 0, b: 0, alpha: 1 }))));
    project.commitEdit();
    project.typeAt(5, 5, 'A', { fg: '#ffffff', bg: '#0000aa' });
    project.typeAt(11, 5, '▐', { fg: '#ffff55', bg: '#0000aa' }); // a hand-drawn block
    project.writeEditCells([{ col: 9, row: 5, attrs: { char: '▐', fg: '#ffff55', bg: '#000000', laid: true } }]); // Half-column detail's
    project.commitEdit();
    project.setEditCells(new Map([...project.editCells, ['7,5', Object.freeze({ char: '▐', fg: '#ffff55', bg: '#ff0000', frozen: true })]]), ['7,5']); // as Merge down froze it
    project.commitEdit();
    await settle(project);
    await project.mergeIntoPicture();
    await settle(project);
    const { pins } = project.baseRecords, cell = (col) => project.cells[5 * 20 + col];
    expect([pins.get('5,5'), cell(5).char]).toEqual(['A', 'A']);
    expect([pins.has('7,5'), pins.has('9,5'), pins.has('11,5')]).toEqual([false, false, false]);
    const was = { fg: cell(5).fg.hex, bg: cell(5).bg.hex };
    workspace.pickLayer('base');
    Object.assign(workspace, { retouchSize: 6, retouchStrength: 100, retouchHardness: 100, editorTab: 'output' });
    const ctx = { project, workspace, view: 'output', unit: { x: 1, y: 1 } };
    blur.begin(ctx, { x: 5.5, y: 11 }, { shiftKey: false });
    blur.move(ctx, { x: 5.5, y: 11 }, { x: 9.5, y: 11 });
    blur.end(ctx);
    await settle(project);
    expect(cell(5).char).toBe('A');
    expect([cell(5).fg.hex, cell(5).bg.hex]).not.toEqual([was.fg, was.bg]); // Blur reaches it: recolored
  });

  // docs/model.md R3. The report (the review matrix's item 18, the purple circles): after Blend, the circle Write block
  // glyphs laid (its █) and the Half-block circle (its paint blocks, ▄) stayed pinned as ▄ and Blur only recolored them
  // a cell at a time, while the vector circle beside them blurred. A shape's solid block and a paint block go into the
  // picture as their two halves, unpinned, where Blur reaches them as it does the paint.
  test('R3: the report: Blend into source image puts a shape\'s solid blocks and Half-block\'s in unpinned', async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20, quantize: 'vga' });
    workspace.pickLayer('edit');
    const purple = { r: 170, g: 0, b: 170, alpha: 1 };
    project.paintEditPixels([10, 11].flatMap((y) => [8, 9].map((x) => ({ x, y, ...purple })))); // under Half-block's ▄s
    project.writeEditCells([
      { col: 5, row: 5, attrs: { char: '█', fg: '#aa00aa', bg: '#000000', laid: true } }, // Write block glyphs'
      { col: 8, row: 5, attrs: { char: '▄' } }, { col: 9, row: 5, attrs: { char: '▄' } }, // Half-block's
    ]);
    project.commitEdit();
    await settle(project);
    await project.mergeIntoPicture();
    await settle(project);
    const { pins } = project.baseRecords;
    expect(['5,5', '8,5', '9,5'].filter((key) => pins.has(key))).toEqual([]);
  });

  // The report (projects/vector-strokes-ascii.phosphor, in ASCII): Layer 1 moved under Vector 1, Vector 1 merged into it,
  // then Blend. Its strokes lie over the opened file's pinned spaces, which merged exactly, so no filter reached them.
  // Drawn in as glyphs (the spaces with the paint over them), Blur reaches them. docs/model.md R3.
  test('R3: the report: Blend into source image in ASCII puts the strokes over pinned spaces where Blur reaches them', async () => {
    const { project, workspace } = await createTestApp();
    await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/vector-strokes-ascii.phosphor')).arrayBuffer()], 'x.phosphor'));
    await settle(project);
    expect(project.moveLayer('edit', 1)).toBe(true);
    workspace.pickLayer('vector');
    expect(project.mergeDown('vector')).toBe(true);
    await settle(project);
    const strokes = [];
    for (let row = 0; row < project.rows / 2; row++) for (let col = 0; col < project.cols; col++) if (project.cellHasPaint(col, row)) strokes.push(row * project.cols + col);
    expect(strokes.length).toBeGreaterThan(100);
    const was = { image: project.image, pins: new Map(project.baseRecords.pins), entries: new Map(project.cellsOf('edit')), paint: project.paintOf('edit').snapshot(), look: cellsKey(project) };
    await project.mergeIntoPicture(null, 'edit');
    await settle(project);
    expect(strokes.filter((i) => project.baseRecords.pins.has(`${i % project.cols},${Math.floor(i / project.cols)}`))).toEqual([]);
    project.undo();
    await settle(project);
    expectRestored(project, 'edit', was);
    expect(project.paintOf('edit').snapshot()).toEqual(was.paint);
    expect(cellsKey(project)).toEqual(was.look);
    project.redo();
    await settle(project);
    const sharp = strokes.map((i) => JSON.stringify(project.cells[i]));
    project.blur = 3;
    await settle(project);
    expect(strokes.filter((i, k) => JSON.stringify(project.cells[i]) !== sharp[k]).length).toBeGreaterThan(0);
  });

  test('another image loaded while merging is left alone', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const merging = project.mergeIntoPicture();
    const blob = await (await fetch('/tests/fixtures/images/rgba.png')).blob();
    await project.setImageFromFile(new File([blob], 'rgba.png', { type: 'image/png' }), { withLayer: true });
    const loaded = project.image;
    await merging;
    await settle(project);
    expect(project.image).toBe(loaded);
    expect(project.canUndo).toBe(false);
  });
});

// Merge down between two layers above the bottom (docs/layers.md, Moving things between layers). The bottom, Layer 1 with
// A and B typed and red paint under them, and Layer 2 over it: C typed over B with no background of its own, D over the
// red paint, and see-through green paint across A and C.
async function twoLayers() {
  const app = await createTestApp(), { project, workspace } = app;
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  project.typeAt(4, 4, 'A', { fg: '#ffee00', bg: '#0044aa' });
  project.typeAt(5, 4, 'B', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 8 }, (_, k) => ({ x: 2 + k, y: 9, alpha: 1 })), '#ff3300');
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(5, 4, 'C', { fg: '#00ffff' });
  project.typeAt(3, 4, 'D', { fg: '#00ffff', bg: '#440044' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 6 }, (_, k) => ({ x: 4 + k, y: 8, alpha: 0.5 })), '#33ff66');
  project.commitEdit();
  await settle(project);
  return { ...app, top };
}
const ids = (project) => project.layers.map((l) => l.id);

describe('down between layers', () => {
  test('Merge down of cells into cells keeps what shows and removes the layer', async () => {
    const { project, workspace, top } = await twoLayers();
    const before = cellsKey(project);
    expect(project.mergeDown(top)).toBe(true);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect(ids(project)).toEqual(['base', 'edit']);
    expect(workspace.pickedLayer).toBe('edit'); // the pick moves to the layer it went into
    expect(project.cellsOf('edit').get('5,4')).toMatchObject({ char: 'C', fg: '#00ffff', bg: '#0044aa' });
    project.render();
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    project.undo();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', top]);
    expect(project.cellsOf('edit').get('5,4').char).toBe('B');
    expect(project.cellsOf(top).get('5,4').char).toBe('C');
    expect(cellsKey(project)).toEqual(before);
    project.redo();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit']);
    expect(cellsKey(project)).toEqual(before);
  });

  // With a palette and Levels on, what a cell shows can be a palette color its stored colors don't show as: the frozen
  // cells are written in stored colors that do (M12: soft paint over paint recolored #aa5500 cells #aa0000).
  const filtered = async () => {
    const app = await createTestApp(), { project } = app;
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
    Object.assign(project, { quantize: 'cga', levelsBlack: 73, levelsWhite: 183, levelsMid: 0.61 });
    const soft = (x0, x1, y0, dy) => brushPixels({ x: x0, y: y0 }, { x: x1, y: y0 + dy }, { size: 3, flow: 1, hardness: 0.5 }, project.cols, project.rows);
    for (let y = 6; y < 30; y += 3) project.paintStroke(soft(4, 24, y, 2), '#a87000'); // the swatch that shows as #aa5500
    project.commitEdit();
    return { ...app, soft };
  };

  test('Merge down of soft paint over paint keeps every cell with a palette and Levels on, the soft edges paint', async () => {
    const { project, workspace, soft } = await filtered();
    const top = project.addLayer('cells', 'edit');
    workspace.pickLayer(top);
    for (let y = 9; y < 34; y += 4) project.paintStroke(soft(12, 34, y, -2), '#6068ff');
    project.commitEdit();
    await settle(project);
    const before = looks(project);
    expect(project.mergeDown(top)).toBe(true);
    await settle(project);
    expectKeptButSoft(project, 'edit', before);
  });

  test('Merge down of a vector layer over paint keeps every cell with a palette and Levels on, the soft edges paint', async () => {
    const { project, workspace } = await filtered();
    const vector = project.addLayer('vector', 'edit');
    workspace.pickLayer(vector);
    project.addShape(rectShape(6, 3, 30, 22, { fill: '#5555ff', stroke: '#00aa00', width: 1.5 }));
    project.commitEdit();
    project.render();
    await settle(project);
    const before = looks(project);
    expect(project.mergeDown(vector)).toBe(true);
    await settle(project);
    expectKeptButSoft(project, 'edit', before);
  });

  test('Merge down of a vector layer into the vector layer under it moves its shapes there, above that layer\'s, and nothing on the canvas changes', async () => {
    const { project, workspace } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    await settle(project);
    const lower = project.addLayer('vector', 'edit'), upper = project.addLayer('vector', lower);
    workspace.pickLayer(upper);
    const over = project.addShape(rectShape(4, 4, 8, 8, { fill: '#00ff00' })); // drawn first: the lower z
    workspace.pickLayer(lower);
    const under = project.addShape(rectShape(2, 2, 8, 8, { fill: '#ff0000' })); // drawn after, on the layer below
    await settle(project);
    const shown = cellsKey(project), version = project.history.version;
    expect(project.mergeDown(upper)).toBe(true);
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', lower]);
    expect([under, over].map((key) => project.shapes.get(key).layer ?? 'vector')).toEqual([lower, lower]);
    expect(project.shapes.get(over).z).toBeGreaterThan(project.shapes.get(under).z); // still over it
    expect(cellsKey(project)).toEqual(shown);
    expect(project.history.version).toBe(version + 1);
    project.undo();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', lower, upper]);
    expect(project.shapes.get(over).layer).toBe(upper);
    expect(cellsKey(project)).toEqual(shown);
    // Only the selected shapes: the layer stays with the rest.
    workspace.pickLayer(upper);
    const stays = project.addShape(rectShape(12, 12, 4, 4, { fill: '#0000ff' }));
    expect(project.mergeDown(upper, null, [over])).toBe(true);
    expect(ids(project)).toEqual(['base', 'edit', lower, upper]);
    expect([over, stays].map((key) => project.shapes.get(key).layer ?? 'vector')).toEqual([lower, upper]);
  });

  test('Merge down of a vector layer with its own character settings into a vector layer is refused', async () => {
    const { project } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    await settle(project);
    const lower = project.addLayer('vector', 'edit'), upper = project.addLayer('vector', lower);
    project.setLayerChars(upper, { chars: 'xyz' });
    toastMessage.value = null;
    expect(project.mergeDown(upper)).toBe(false);
    expect(toastMessage.value).toBe('Vector 2 uses custom character settings and cannot merge into the layer below.');
    expect(ids(project)).toEqual(['base', 'edit', lower, upper]);
  });

  // Into a layer whose character settings aren't the merged layer's, its paint takes the ones under it: a cell it covers
  // whole keeps its look, frozen, but a soft edge, and whatever's painted there later, converts as the lower layer does.
  // So Merge down says so and asks first; with the same settings, or nothing of its own but typed cells, it merges at once.
  test('Merge down into a layer with other character settings says the characters can change, and asks first', async () => {
    const { project, workspace, pinia } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    await settle(project);
    const paint = (id) => {
      workspace.pickLayer(id);
      project.paintStroke([{ x: 3, y: 6, alpha: 1 }, { x: 6, y: 6, alpha: 1 }], '#ff3300');
      project.commitEdit();
    };
    const same = project.addLayer('cells', 'edit');
    paint(same);
    const own = project.addLayer('cells', same);
    project.setLayerChars(own, { chars: 'xyz' });
    project.commitLayerChars();
    paint(own);
    await settle(project);
    const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(pinia).use(i18n);
    document.body.append(host);
    toolbar.mount(host);
    const press = async () => { [...host.querySelectorAll('button')].find((b) => b.title.startsWith('Merge Layer')).click(); await settle(project); };
    const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
    try {
      await press(); // Layer 3, its own characters, onto Layer 2
      expect(document.body.textContent).toContain('Layer 2 uses different character settings, so some characters in Layer 3 may change.');
      button('Cancel').click();
      await settle(project);
      expect(ids(project)).toEqual(['base', 'edit', same, own]);
      await press();
      button('Merge into Layer 2').click();
      await vi.waitFor(() => expect(ids(project)).toEqual(['base', 'edit', same]));
      project.undo();
      await settle(project);
      project.setLayerChars(own, { chars: project.baseChars.chars });
      project.commitLayerChars();
      await settle(project);
      await press(); // the same settings: at once
      await vi.waitFor(() => expect(ids(project)).toEqual(['base', 'edit', same]));
      expect(document.body.textContent).not.toContain('may change');
    } finally {
      toolbar.unmount();
      host.remove();
    }
  });

  test('Merge down is off onto a vector layer', async () => {
    const { project } = await createTestApp();
    await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
    await settle(project);
    project.addLayer('vector', 'base');
    project.typeAt(2, 2, 'A', { fg: '#ffffff' });
    project.commitEdit();
    const version = project.history.version;
    toastMessage.value = null;
    expect(project.mergeDown('edit')).toBe(false);
    expect(toastMessage.value).toBe('Character cells cannot merge into a vector layer. Use Make art layer instead.');
    expect(ids(project)).toEqual(['base', 'vector', 'edit']);
    expect(project.history.version).toBe(version);
    const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
    document.body.append(host);
    toolbar.mount(host);
    try {
      const button = host.querySelector('button[aria-label="Merge down"]');
      expect(button.disabled).toBe(true);
      expect(button.title).toBe('Character cells cannot merge into a vector layer. Use Make art layer instead.');
    } finally {
      toolbar.unmount();
      host.remove();
    }
  });

  // A vector layer's shapes go into a cells layer as paint where that shows the same. With its own character settings
  // they're converted with its characters, which the cells layer's paint wouldn't be: where they cover a cell whole they
  // freeze, exactly as they showed, and a later palette doesn't convert them again; along a soft edge they stay paint.
  test('Merge down of a vector layer into a cells layer puts its shapes in as paint, and freezes what paint would show otherwise', async () => {
    const { project, workspace } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
    project.charChoice = 'best'; // its characters follow the colors: a palette change picks others
    project.typeAt(4, 4, 'A', { fg: '#ffee00', bg: '#0044aa' });
    project.commitEdit();
    const vector = project.addLayer('vector', 'edit');
    workspace.pickLayer(vector);
    project.addShape(rectShape(2, 5, 13, 16, { fill: '#ff0000' }));
    project.commitEdit();
    project.addShape(rectShape(6, 3, 20, 12, { fill: '#33ff66', stroke: '#0000ff', width: 1.5 }));
    project.commitEdit();
    project.render();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', vector]);
    let before = looks(project);
    expect(project.mergeDown(vector)).toBe(true);
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit']);
    expect(project.shapes.size).toBe(0);
    expectKeptButSoft(project, 'edit', before);
    expect(project.paintOf('edit').pixelAt(4, 10)).toEqual({ r: 255, g: 0, b: 0, a: 1 }); // the red rectangle, as paint
    project.undo();
    await settle(project);
    expect(project.shapes.size).toBe(2);
    expectLooksAlike(looks(project), before);

    project.setLayerChars(vector, { chars: '#' });
    project.commitLayerChars();
    project.render();
    await settle(project);
    before = looks(project);
    expect(project.mergeDown(vector)).toBe(true);
    await settle(project);
    expectKeptButSoft(project, 'edit', before);
    const reached = [...project.cellsOf('edit').keys()].map((key) => key.split(',').map(Number)).map(([c, r]) => r * project.cols + c);
    expect(reached.length).toBeGreaterThan(20);
    expect(project.paintOf('edit').pixelAt(4, 10)).toEqual({ r: 255, g: 0, b: 0, a: 1 }); // the red rectangle, still paint
    const frozen = [...project.cellsOf('edit')].filter(([, entry]) => isFrozen(entry)).map(([key]) => key.split(',').map(Number));
    expect(frozen.length).toBeGreaterThan(0); // the blue outline's cells, which the layer's '#' showed otherwise than the lower set does
    expect(frozen.every(([c, r]) => project.paintOf('edit').pixelAt(c, 2 * r) || project.paintOf('edit').pixelAt(c, 2 * r + 1))).toBe(true); // frozen, over their paint (docs/model.md R3)
    const chars = reached.map((i) => project.cells[i].char);
    project.quantize = 'cga';
    project.render();
    await settle(project);
    expect(reached.map((i) => project.cells[i].char)).toEqual(chars);
    project.quantize = 'none';
    project.undo();
    await settle(project);
    expect(ids(project)).toEqual(['base', 'edit', vector]);
    expect(project.shapes.size).toBe(2);
    expectLooksAlike(looks(project), before);
  });

  test('in a room, Merge down goes to the room as the whole document, the emptied layer gone as alone', async () => {
    const { project, workspace, top } = await twoLayers();
    project.shareWholeDocument = vi.fn(); // the host's step goes to the room as the whole document
    project._sharing = { role: 'host', heardCells: new Map(), heardRuns: [] };
    try {
      const before = cellsKey(project);
      expect(project.mergeDown(top)).toBe(true); // into a layer above the bottom too
      await settle(project);
      expect(ids(project)).toEqual(['base', 'edit']);
      expect(cellsKey(project)).toEqual(before);
      workspace.pickLayer('edit');
      expect(project.mergeDown('edit')).toBe(true);
      await settle(project);
      expect(ids(project)).toEqual(['base']);
      expect(cellsKey(project)).toEqual(before);
      expect(project.shareWholeDocument).toHaveBeenCalled();
    } finally {
      project._sharing = null;
    }
  });

  test('Merge down refuses a hidden layer or a hidden one under it', async () => {
    const { project, top } = await twoLayers();
    const version = project.history.version;
    for (const id of [top, 'edit']) {
      project.setLayerHidden(id, true);
      toastMessage.value = null;
      expect(project.mergeDown(top)).toBe(false);
      expect(toastMessage.value).toBe('Make the layer visible to merge it');
      expect(ids(project)).toEqual(['base', 'edit', top]);
      project.setLayerHidden(id, false);
    }
    expect(project.history.version).toBe(version);
  });

  test('Merge down is off with the base picked: nothing is under it', async () => {
    const { project } = await twoLayers();
    expect(project.mergeDown('base')).toBe(false);
    expect(ids(project).length).toBe(3);
  });
  // The report: a shape merged down into a drawing layer couldn't be blurred. It went in as frozen cells, and Blur on a
  // drawing layer changes its paint (in the ANSI view its cells too, but only with its other cells, so a one-color shape
  // stayed one color). It goes in as paint now, where that shows the same, and so does a drawing layer's paint.
  const blurredEdge = async (project, workspace, view) => {
    workspace.editorTab = view;
    workspace.pickLayer('edit');
    Object.assign(workspace, { retouchSize: 6, retouchStrength: 100, retouchHardness: 100 });
    const ctx = { project, workspace, view }, at = { x: 10, y: 10.5 };
    getTool('blur').begin(ctx, at, {});
    blur.move(ctx, at, at);
    blur.end(ctx);
    await settle(project);
    return project.paintLayer.pixelAt(9, 10)?.a ?? 0;
  };
  for (const view of ['input', 'output']) {
    test(`a shape merged down into a drawing layer goes in as paint, nothing on the canvas changing, and Blur fades its edge (${view === 'input' ? 'PIXEL' : 'ANSI'} view)`, async () => {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
      await settle(project);
      const vector = project.addLayer('vector', 'edit');
      workspace.pickLayer(vector);
      project.addShape(rectShape(0, 0, 10, 20, { fill: '#ff0000' }));
      project.commitEdit();
      await settle(project);
      const before = cellsKey(project);
      expect(project.mergeDown(vector)).toBe(true);
      await settle(project);
      expect(ids(project)).toEqual(['base', 'edit']);
      expect(cellsKey(project)).toEqual(before);
      expect(project.cellsOf('edit').size).toBe(0);
      expect(project.paintOf('edit').pixelAt(5, 5)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      const alpha = await blurredEdge(project, workspace, view);
      expect(alpha).toBeGreaterThan(0.5);
      expect(alpha).toBeLessThan(1);
    });

    test(`a drawing layer's paint merged down into another stays paint, and Blur fades its edge (${view === 'input' ? 'PIXEL' : 'ANSI'} view)`, async () => {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 20 });
      await settle(project);
      const top = project.addLayer('cells', 'edit');
      workspace.pickLayer(top);
      const red = [];
      for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) red.push({ x, y, alpha: 1 });
      project.paintStroke(red, '#ff0000');
      project.commitEdit();
      await settle(project);
      const before = cellsKey(project);
      expect(project.mergeDown(top)).toBe(true);
      await settle(project);
      expect(cellsKey(project)).toEqual(before);
      expect(project.cellsOf('edit').size).toBe(0);
      expect(project.paintOf('edit').pixelAt(5, 5)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      const alpha = await blurredEdge(project, workspace, view);
      expect(alpha).toBeGreaterThan(0.5);
      expect(alpha).toBeLessThan(1);
    });
  }

  // Over a picture a shape's soft edge doesn't show the same as paint, so its cells there are written exactly: Blur keeps
  // their characters, as it keeps every cell's, and spreads their colors into the clear beside them.
  // docs/model.md R3: the fixture of the report (projects/layer-blending-ascii.phosphor). Vector 1's red shape lies over
  // Layer 1's white paint, and Layer 2's white paint over its edge. Merging the shape into Layer 1 wrote cells along its
  // edge as characters; those counted as someone's own for Layer 2's paint above, which tinted them instead of covering
  // them, so white cells turned into dark '.' and blanks. A frozen cell is paint to the layers above.
  test('R3: the report: Vector 1 merged into Layer 1 under Layer 2\'s paint keeps what shows, and so does Layer 2 merged after it', async () => {
    const { project } = await createTestApp();
    await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/layer-blending-ascii.phosphor')).arrayBuffer()], 'x.phosphor'));
    await settle(project);
    expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', 'vector', 'L1']);
    const before = looks(project);
    expect(project.mergeDown('vector')).toBe(true);
    await settle(project);
    expectLooksAlike(looks(project), before);
    expect(project.mergeDown('L1')).toBe(true);
    await settle(project);
    expectLooksAlike(looks(project), before);
  });

  // docs/model.md R3: the report (projects/vector-into-layer-edge.phosphor): Vector 1's pentagon merged into Layer 1 over
  // the photo froze the cells along its soft edge with the photo's gray in them, so hiding the base afterward showed a
  // gray border round it (and merged with the base hidden, a black one once the base showed again). A cell the merged
  // paint covers only in part stays paint, over whatever is under it.
  test('R3: the report: a shape merged into Layer 1 leaves no border of what was under its edge, the base shown or hidden', async () => {
    const merged = async (hidden) => {
      const { project } = await createTestApp();
      await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/vector-into-layer-edge.phosphor')).arrayBuffer()], 'x.phosphor'));
      project.setLayerHidden('base', hidden);
      await settle(project);
      expect(project.layers.map((l) => l.id)).toEqual(['base', 'edit', 'vector', 'L1']);
      const before = looks(project);
      expect(project.mergeDown('vector')).toBe(true);
      await settle(project);
      expect(expectKeptButSoft(project, 'edit', before).size).toBeGreaterThan(50);
      const shown = cellsKey(project);
      project.setLayerHidden('base', !hidden);
      await settle(project);
      return { shown, toggled: cellsKey(project) };
    };
    const visible = await merged(false), hidden = await merged(true);
    expect(visible.toggled).toEqual(hidden.shown); // merged with the base shown, then hidden: no gray border
    expect(hidden.toggled).toEqual(visible.shown); // merged with it hidden, then shown: no black one
  });

  // docs/model.md R3: the report (projects/merge-dark-edge.phosphor): the PIXEL view showed dark lines along a merged
  // shape's edge, where the frozen cells had lost their paint and the Overlay drew their characters' ink instead. A
  // frozen cell keeps its paint under it, so the PIXEL view shows it as before the merge. As saved, the shape goes into
  // L2 (an upper layer under By shape) at its own detail and L2 samples its paint as finely (R7), so nothing is frozen;
  // with the vector layer's own characters its edge converts otherwise on L2, and the frozen cells are the report's.
  for (const [kind, own] of [['as saved', null], ['with the shape\'s own characters', { charsAscii: '#' }]]) {
    test(`R3: the report (${kind}): a shape merged into the layer under it looks the same in the PIXEL view, any frozen cells over their paint`, async () => {
      const { project } = await createTestApp();
      await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/merge-dark-edge.phosphor')).arrayBuffer()], 'x.phosphor'));
      if (own) project.setLayerChars('vector', own);
      await settle(project);
      const { cols, rows } = project, shown = () => [...ctx2d(project.renderer.shownCanvas()).getImageData(0, 0, cols, rows).data];
      const before = shown(), cells = looks(project);
      expect(project.mergeDown('vector')).toBe(true);
      await settle(project);
      expectKeptButSoft(project, 'L2', cells);
      const after = shown();
      expect(Math.max(...before.map((v, i) => Math.abs(v - after[i])))).toBeLessThanOrEqual(2);
      const frozen = [...project.cellsOf('L2')].filter(([, entry]) => isFrozen(entry));
      if (!own) expect(frozen.length).toBe(0); // R7
      else expect(frozen.length).toBeGreaterThan(20);
      expect(frozen.every(([key]) => { const [col, row] = key.split(',').map(Number); return project.paintOf('L2').pixelAt(col, 2 * row) || project.paintOf('L2').pixelAt(col, 2 * row + 1); })).toBe(true);
    });
  }

  // docs/model.md R7: under By shape the lower group matches each cell against finer samples of the picture, so a photo's
  // detail shows through soft paint; a layer above now matches the same samples, and a merged vector layer's shapes go
  // into the paint at their own detail, so soft paint and shapes above convert as they will once merged down and the
  // merge freezes nothing. On the report's photo (projects/merge-base-banding.phosphor) soft strokes froze 407 cells and a
  // shape 160 before, in Color ASCII; the file's own merge had frozen 51 at a shape's edge.
  for (const [renderStyle, kind] of [['colorAscii', 'paint'], ['colorAscii', 'shape'], ['ansi', 'paint'], ['ansi', 'shape']]) {
    test(`R7: under By shape (${renderStyle}), soft ${kind} on a layer above a photo merges down with nothing frozen`, async () => {
      const { project, workspace } = await createTestApp();
      await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/merge-base-banding.phosphor')).arrayBuffer()], 'x.phosphor'));
      Object.assign(project, { renderStyle, charChoice: 'shape' });
      workspace.pickLayer('edit');
      project.clearEditCells([...project.cellsOf('edit')].filter(([, entry]) => isFrozen(entry)).map(([key]) => { const [col, row] = key.split(',').map(Number); return { col, row }; })); // the file's own, from an earlier merge: paint under them would be re-frozen
      project.commitEdit();
      project.render();
      await settle(project);
      const top = project.addLayer(kind === 'paint' ? 'cells' : 'vector', 'edit');
      workspace.pickLayer(top);
      if (kind === 'paint') {
        const soft = (x0, x1, y0, dy) => brushPixels({ x: x0, y: y0 }, { x: x1, y: y0 + dy }, { size: 6, flow: 1, hardness: 0.3 }, project.cols, project.rows);
        for (let y = 20; y < 140; y += 12) project.paintStroke(soft(4, 76, y, 4), '#ff4000');
      } else project.addShape(ellipseShape(10.3, 30.4, 70.7, 120.2, { fill: '#ff4000' }));
      project.commitEdit();
      await settle(project);
      const before = looks(project);
      expect(project.mergeDown(top)).toBe(true);
      await settle(project);
      expectKeptButSoft(project, 'edit', before);
      // ANSI picks two colors a cell, so at a shape's soft edge the paint's 8-bit rounding can tip By shape's pick in a
      // handful of cells, which the merge freezes where the shape covers them whole (at its soft edge they stay paint,
      // R3); the rest convert alike.
      expect([...project.cellsOf('edit').values()].filter(isFrozen).length).toBeLessThanOrEqual(renderStyle === 'ansi' && kind === 'shape' ? 20 : 0);
    });
  }

  // docs/model.md R4: a frozen cell is paint to Retouch too: Blur turns it back into paint where it changes it, so a
  // merged shape fades like a painted one; a typed character beside it stays (retouch.test.js).
  test('R4: shapes merged down over a picture: Blur turns the frozen cells along their top back into paint and fades them', async () => {
    const { project, workspace } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
    const vector = project.addLayer('vector', 'edit');
    project.setLayerChars(vector, { chars: '▀' }); // its own characters: a cell of two colors converts otherwise on the layer under (a ▀, not the lower set's characters), so the merge freezes it (R7 freezes nothing otherwise)
    workspace.pickLayer(vector);
    project.addShape(rectShape(5, 4, 31, 30.2, { fill: '#ff0000' }));
    project.commitEdit();
    project.addShape(rectShape(5, 4, 31, 5, { fill: '#0000ff' })); // row 2: blue over red, both halves covered whole
    project.commitEdit();
    await settle(project);
    expect(project.mergeDown(vector)).toBe(true);
    await settle(project);
    const edge = [...project.cellsOf('edit').keys()].find((key) => key.endsWith(',2'));
    expect(edge).toBeDefined(); // the top, written frozen
    const col = Number(edge.split(',')[0]);
    expect(isFrozen(project.cellsOf('edit').get(edge))).toBe(true);
    workspace.editorTab = 'input';
    Object.assign(workspace, { retouchSize: 4, retouchStrength: 100, retouchHardness: 100 });
    const ctx = { project, workspace, view: 'input' }, at = { x: col + 0.5, y: 4.5 };
    getTool('blur').begin(ctx, at, {});
    blur.end(ctx);
    await settle(project);
    expect(project.cellsOf('edit').get(edge)).toBeUndefined(); // paint now
    expect(project.paintOf('edit').pixelAt(col, 4)?.a).toBeGreaterThan(0); // its two halves
    expect(project.paintOf('edit').pixelAt(col, 5)?.a).toBeGreaterThan(0);
    expect(project.paintOf('edit').pixelAt(col, 3)?.a).toBeGreaterThan(0); // the clear above it
    expect(project.paintOf('edit').pixelAt(col, 3)?.a).toBeLessThan(1);
  });

  // The report (projects/blur-ascii-test.phosphor): a gradient shape merged down under By shape came in as exact cells
  // nearly all over, not paint, so Blur kept their characters and Keep crisp cells into the base pinned them all. By
  // shape works a cell's colors out from the shape's finer samples, and paint from its grid pixels: the same gradient
  // rounds a step or two apart, which no one can see, but the merge compared colors exactly.
  for (const style of [{ renderStyle: 'colorAscii', charChoiceAscii: 'shape' }, { renderStyle: 'ansi', charChoice: 'shape' }]) {
    test(`a gradient shape merged down under By shape (${style.renderStyle}) is paint, exact only where it shows differently`, async () => {
      const { project, workspace } = await createTestApp();
      await project.setBlankCanvas({ withLayer: true, cols: 60, rows: 30 });
      Object.assign(project, style);
      await settle(project);
      const layer = project.addLayer('cells', 'base'), vector = project.addLayer('vector', layer);
      workspace.pickLayer(vector);
      const shape = ellipseShape(20.3, 6.4, 50.7, 50.2, { fill: '#ff2000' });
      project.addShape({ ...shape, fill: fillAs(shape, 'linear', { to: '#ffffff' }) });
      project.commitEdit();
      await settle(project);
      const before = project.cells.map((cell) => cell.char);
      expect(project.mergeDown(vector)).toBe(true);
      await settle(project);
      expect(project.cells.map((cell) => cell.char)).toEqual(before); // nothing that shows changed
      expect(project.cellsOf(layer).size).toBeLessThan(70); // its edge (258 and 144 cells before, nearly all of it)
      expect(project.paintOf(layer).pixelAt(35, 20)).toMatchObject({ a: 1 }); // the middle: paint
    });
  }

  // The report (projects/layer-blending-ascii.phosphor): Colors only leaves each blank cell it paints a ▄ with no colors
  // (a paint block), which only ANSI shows. Merge down completed it against the look under it, so it came down a ▄ with
  // colors of its own, which Color ASCII showed as a half-block over the paint. A block is paint: it comes down as one.
  // Where its paint is soft over the picture, an upper layer and the lower group can't blend it the same in the ASCII
  // styles (the one mixes with the shown character's ink on black, the other with the picture), so those cells are
  // written as they showed, as any paint that would show otherwise is; an opaque one stays a block over its paint.
  test.each(['colorAscii', 'ansi'])('Merge down of Colors only paint keeps what shows in %s, its blank cells still paint blocks', async (renderStyle) => {
    const { project, workspace } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
    project.renderStyle = renderStyle;
    const under = project.addLayer('cells', 'base'), top = project.addLayer('cells', under);
    workspace.pickLayer(top);
    project.writeEditCells([4, 5, 6].map((col) => ({ col, row: 3, attrs: { char: '▄' } }))); // as Colors only leaves them
    project.paintEditPixels([4, 5, 6].flatMap((x) => [{ x, y: 6, r: 255, g: 255, b: 255, alpha: x === 4 ? 1 : 0.4 }, { x, y: 7, r: 255, g: 255, b: 255, alpha: 1 }]));
    project.commitEdit();
    await settle(project);
    const before = cellsKey(project);
    expect(project.mergeDown(top)).toBe(true);
    await settle(project);
    expect(cellsKey(project)).toEqual(before);
    expect(project.cellsOf(under).get('4,3')).toEqual({ char: '▄' }); // the opaque one: a block over its paint
    expect(project.cellHasPaint(4, 3)).toBe(true); // still paint, for Blur and the rest
    expect([...project.cellsOf(under).values()].some((entry) => entry.char === '▄' && (entry.fg || entry.bg))).toBe(false); // no ▄ with colors of its own
  });

  test('Merge down of paint over cells keeps what shows under Color ASCII with the sliders off their defaults', async () => {
    const { project, workspace } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
    Object.assign(project, { renderStyle: 'colorAscii', brightness: 140, hue: 40 });
    project.render();
    await settle(project);
    const top = project.addLayer('cells', 'edit');
    workspace.pickLayer(top);
    project.paintStroke([{ x: 4, y: 6, alpha: 1 }], '#ffff00');
    project.paintStroke([{ x: 4, y: 7, alpha: 1 }], '#0000ff');
    project.commitEdit();
    await settle(project);
    const before = cellsKey(project), at = 3 * project.cols + 4, shown = project.cells[at];
    expect(project.mergeDown(top)).toBe(true);
    await settle(project);
    const after = cellsKey(project), cell = project.cells[at];
    expect(after.filter((_, i) => i !== at)).toEqual(before.filter((_, i) => i !== at));
    // The halves' average as shown (#b38080 here) is one no stored color shows as under these sliders: the nearest one is.
    expect([cell.char, cell.bg.hex]).toEqual([shown.char, shown.bg.hex]);
    expect(Math.max(...['r', 'g', 'b'].map((k) => Math.abs(cell.fg[k] - shown.fg[k])))).toBeLessThanOrEqual(1);
  });
});

test('Into the image from a row that isn\'t the layer in use merges that row\'s layer, as the dialog names it', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.paintStroke([{ x: 3, y: 6, alpha: 1 }, { x: 6, y: 6, alpha: 1 }], '#ff3300');
  project.commitEdit();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(9, 9, 'Q', { fg: '#00ffff' });
  project.commitEdit();
  await settle(project);
  const { asking } = await import('@/composables/useMergeDown.js');
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  try {
    asking.value = { id: 'edit', rect: null }; // as LAYERS' ⋯ Merge down on Layer 1 asks
    await settle(project);
    const blend = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Blend into source image'));
    expect(document.body.textContent).toContain('Choose how to merge Layer 1 into Base:');
    blend.click();
    await vi.waitFor(() => expect(project.layerById('edit')).toBe(undefined), { timeout: 10_000 }); // the picture's encoded first
    expect(project.layers.map((l) => l.id)).toEqual(['base', top]);
    expect(project.cellsOf(top).get('9,9')?.char).toBe('Q');
  } finally {
    toolbar.unmount();
    host.remove();
  }
});

// What Blend into source image gives up: a layer's own characters (its paint is redrawn in the base's), its shapes' laid
// blocks as they are (each is drawn in as its glyph and picked again, docs/model.md R3; typed characters and the base's
// pins stay), and only a real picture's original resolution (a blank canvas's is one color, the same at any size).
test.each([
  ['a picture', true],
  ['a blank canvas', false],
])('Blend into source image over %s lists what it gives up, and still merges', async (_, picture) => {
  const { project, workspace } = await createTestApp();
  if (picture) await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  else await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  const top = project.addLayer('cells', 'base');
  workspace.pickLayer(top);
  project.paintStroke([{ x: 3, y: 6, alpha: 1 }, { x: 6, y: 6, alpha: 1 }], '#ff3300');
  project.commitEdit();
  await settle(project);
  const { asking } = await import('@/composables/useMergeDown.js');
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  const blend = () => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Blend into source image'));
  const ask = async () => {
    asking.value = null;
    await settle(project);
    asking.value = { id: top, rect: null };
    await settle(project);
    return blend().textContent;
  };
  const chars = /Layer \d+'s custom characters: its paint is redrawn in Base's\./, resolution = "The source image's original resolution";
  const repicked = /Layer \d+'s blocks \(typed, from shapes or from Half-block\) are drawn into the image and picked again, so some can change\./;
  try {
    const before = await ask(); // the base's characters
    expect(before).not.toMatch(chars);
    expect(before).not.toMatch(repicked); // paint only
    expect(before.includes('You give up:')).toBe(picture);
    expect(before.includes(resolution)).toBe(picture);
    project.setLayerChars(top, { chars: '▖▗▘▝▚▞' });
    project.commitLayerChars();
    const after = await ask();
    expect(after).toMatch(new RegExp(`You give up:.*${chars.source}`, 's'));
    expect(after.includes(resolution)).toBe(picture);
    // the base's pins, under the paint or not, and a typed letter stay as they are: nothing given up
    project.writeBaseCells([{ col: 15, row: 8, char: 'A', fg: '#ffffff', bg: '#000000' }, { col: 6, row: 3, char: 'A', fg: '#ffffff', bg: '#000000' }]);
    project.typeAt(9, 9, 'Q', { fg: '#00ffff' });
    project.commitEdit();
    expect(await ask()).not.toMatch(repicked);
    project.writeEditCells([{ col: 12, row: 9, attrs: { char: '█', fg: '#00ffff', laid: true } }]); // a shape's solid block
    project.commitEdit();
    expect(await ask()).toMatch(new RegExp(`You give up:.*${repicked.source}`, 's')); // into the picture as its halves
    blend().click(); // a warning, not a refusal
    await vi.waitFor(() => expect(project.layerById(top)).toBe(undefined), { timeout: 10_000 });
  } finally {
    toolbar.unmount();
    host.remove();
  }
});

// A laid block in the letterbox merges exactly (mergeKind), so the question doesn't say it's picked again; one inside the
// picture is.
test('Blend into source image lists a shape\'s block as picked again only inside the picture, not in the letterbox', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/tall.png', { cols: 40, rows: 40 }); // pillarboxed
  const top = project.addLayer('cells', 'base');
  workspace.pickLayer(top);
  const fit = project.fitFor(project.cols, project.rows); // one column wide, in the middle
  expect(fit.dx).toBeGreaterThan(1);
  const laid = (col, row) => project.writeEditCells([{ col, row, attrs: { char: '▚', fg: '#00ffff', laid: true } }]);
  laid(1, 5);
  project.commitEdit();
  await settle(project);
  const { asking } = await import('@/composables/useMergeDown.js');
  const host = document.createElement('div'), toolbar = createApp(EditToolbar).use(i18n);
  document.body.append(host);
  toolbar.mount(host);
  const ask = async () => {
    asking.value = null;
    await settle(project);
    asking.value = { id: top, rect: null };
    await settle(project);
    return [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Blend into source image')).textContent;
  };
  const repicked = /Layer \d+'s blocks \(typed, from shapes or from Half-block\) are drawn into the image and picked again/;
  try {
    expect(await ask()).not.toMatch(repicked);
    laid(fit.dx, 10);
    project.commitEdit();
    expect(await ask()).toMatch(repicked);
  } finally {
    asking.value = null;
    toolbar.unmount();
    host.remove();
  }
});

// With a palette and Levels on, what a cell shows can be a palette color its stored colors don't show as: the frozen
// cells are written in stored colors that do (M12: soft paint over paint recolored #aa5500 cells #aa0000).
const filtered = async () => {
  const app = await createTestApp(), { project } = app;
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  Object.assign(project, { quantize: 'cga', levelsBlack: 73, levelsWhite: 183, levelsMid: 0.61 });
  const soft = (x0, x1, y0, dy) => brushPixels({ x: x0, y: y0 }, { x: x1, y: y0 + dy }, { size: 3, flow: 1, hardness: 0.5 }, project.cols, project.rows);
  for (let y = 6; y < 30; y += 3) project.paintStroke(soft(4, 24, y, 2), '#a87000'); // the swatch that shows as #aa5500
  project.commitEdit();
  return { ...app, soft };
};

test('Merge down of soft paint over paint keeps every cell with a palette and Levels on, the soft edges paint', async () => {
  const { project, workspace, soft } = await filtered();
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  for (let y = 9; y < 34; y += 4) project.paintStroke(soft(12, 34, y, -2), '#6068ff');
  project.commitEdit();
  await settle(project);
  const before = looks(project);
  expect(project.mergeDown(top)).toBe(true);
  await settle(project);
  expectKeptButSoft(project, 'edit', before);
});

test('Merge down of a vector layer over paint keeps every cell with a palette and Levels on, the soft edges paint', async () => {
  const { project, workspace } = await filtered();
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  project.addShape(rectShape(6, 3, 30, 22, { fill: '#5555ff', stroke: '#00aa00', width: 1.5 }));
  project.commitEdit();
  project.render();
  await settle(project);
  const before = looks(project);
  expect(project.mergeDown(vector)).toBe(true);
  await settle(project);
  expectKeptButSoft(project, 'edit', before);
});

test('Merge down of a cells layer into another with the base hidden keeps what shows', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  const top = project.addLayer('cells', 'edit');
  workspace.pickLayer(top);
  project.typeAt(3, 3, 'A', { fg: '#ff0000' }); // BG none: it's completed against what shows under it
  project.commitEdit();
  project.setLayerHidden('base', true);
  await settle(project);
  const shown = cellsKey(project);
  expect(project.mergeDown(top)).toBe(true);
  await settle(project);
  expect(cellsKey(project)).toEqual(shown);
});

// Blend read the paint at grid resolution with a nearest-pixel drawImage, so a grid pixel's paint was whichever one pixel
// of its block sat at the sample point: on a soft edge (a thin stroke) that dropped pixels or read them at the wrong
// strength. It reads each grid pixel's block average, as the layer's pixelAt does.
test('Blend into source image reads a merged shape\'s soft edge as each grid pixel\'s average', async () => {
  const { project, workspace } = await createTestApp();
  await project.setBlankCanvas({ withLayer: true, cols: 60, rows: 48 });
  project.renderStyle = 'ascii';
  await settle(project);
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  project.addShape(ellipseShape(10, 6, 50, 40, { fill: null, stroke: '#ffffff', width: 1.5 }));
  project.commitEdit();
  await settle(project);
  expect(project.mergeDown(vector)).toBe(true);
  await settle(project);
  const paint = [];
  for (let y = 0; y < project.rows; y++) for (let x = 0; x < project.cols; x++) {
    const p = project.paintLayer.pixelAt(x, y);
    // A cell with a character of its own (an entry or a pin) goes in as its glyph, or exactly when frozen (R3); the
    // rest go in as picture pixels, which is what this reads.
    const col = x, row = Math.floor(y / 2);
    if (p?.a && !project.editCellAt(col, row) && !project.baseRecords.pins.has(`${col},${row}`)) paint.push({ x, y, ...p });
  }
  expect(paint.length).toBeGreaterThan(50);
  await project.mergeIntoPicture(null, 'edit');
  await settle(project);
  const { image } = project, fit = project.fitFor(project.cols, project.rows), m = image.width / fit.dw;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const picture = ctx2d(canvas);
  picture.drawImage(image, 0, 0);
  const data = picture.getImageData(0, 0, canvas.width, canvas.height).data;
  const blockAt = (x, y) => {
    const sum = [0, 0, 0];
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const o = (((y - fit.dy) * m + j) * canvas.width + (x - fit.dx) * m + i) * 4;
      for (let c = 0; c < 3; c++) sum[c] += data[o + c];
    }
    return sum.map((v) => v / (m * m));
  };
  const dropped = [], off = [];
  for (const { x, y, r, g, b, a } of paint) {
    const got = blockAt(x, y), want = [r * a, g * a, b * a]; // the paint laid over black
    if (got.every((v) => v < 1)) { if (want.some((v) => v > 2)) dropped.push(`${x},${y} ${a}`); } // under a step: nothing to see
    else if (got.some((v, c) => Math.abs(v - want[c]) > 2)) off.push(`${x},${y}: ${got.map(Math.round)} vs ${want.map(Math.round)}`);
  }
  expect(dropped).toEqual([]);
  expect(off).toEqual([]);
});

// Text with no background typed over a photo, merged onto the base under a palette and a slider moved: the issue's table
// (#201). The cell's background is the base's own, and stays its pixels: written as a stored color instead (baseCellAt's),
// the base snapped it on the graphics card, which broke a tie between two palette colors the other way (VGA's d7 and ff
// under Midtones 2), or never made the color at all (the picture's cell showed a mix of its pixels' snaps, as under
// Posterize 5). Keep crisp cells writes the letters as base pixels (mergeCellOf), and so does Blend into source image:
// someone's own characters merge exactly there too (R3).
describe('R3: Merge down of text with no background onto the base with a palette and a slider moved: Keep crisp cells and Blend keep the canvas', () => {
  const cases = [
    ['VGA, Midtones 2', 'vga', { levelsMid: 2 }], ['VGA, Midtones 1.4', 'vga', { levelsMid: 1.4 }], ['VGA, Midtones 0.5', 'vga', { levelsMid: 0.5 }],
    ['VGA, White point 200', 'vga', { levelsWhite: 200 }], ['VGA, Posterize 5', 'vga', { posterize: 5 }], ['VGA, Contrast 140', 'vga', { contrast: 140 }],
    ['VGA, Saturation 60', 'vga', { saturation: 60 }], ['VGA, Brightness 140', 'vga', { brightness: 140 }], ['VGA, Hue 30', 'vga', { hue: 30 }],
    ['CGA, Invert 100', 'cga', { invert: 100 }], ['no palette, Midtones 2', 'none', { levelsMid: 2 }],
  ];
  const typed = async (quantize, sliders, { blended = false } = {}) => {
    const { project, workspace } = await createTestApp();
    await loadImage(project, '/tests/fixtures/images/photo.jpg', { cols: 30, rows: 30 });
    Object.assign(project, { quantize, ...sliders });
    project.render();
    await settle(project);
    if (blended) { // the first Blend makes the picture its working-size copy, which can round a level here and there
      project.typeAt(0, 0, 'P', { fg: '#ffffff' });
      project.commitEdit();
      await project.mergeIntoPicture();
      workspace.pickLayer(project.addLayer('cells', 'base'));
      await settle(project);
    }
    const letters = 'Phosphor';
    for (let row = 0; row < 15; row++) for (let col = 0; col < 30; col++) project.typeAt(col, row, letters[(row + col) % letters.length], { fg: '#ffffff' });
    project.commitEdit();
    project.render();
    await settle(project);
    return project;
  };
  const changed = (now, was) => now.map((c, i) => (c === was[i] ? null : `${i}: ${was[i]} -> ${c}`)).filter(Boolean);

  test.each(cases)('Keep crisp cells, %s: the canvas unchanged', async (_, quantize, sliders) => {
    const project = await typed(quantize, sliders), was = cellsKey(project);
    expect(project.mergeDown('edit')).toBe(true);
    await settle(project);
    expect(changed(cellsKey(project), was)).toEqual([]);
  });

  test.each(cases)('Blend into source image, %s: the canvas unchanged, the letters pinned', async (_, quantize, sliders) => {
    const project = await typed(quantize, sliders, { blended: true }), was = cellsKey(project), letters = [...project.editCells.keys()];
    await project.mergeIntoPicture();
    await settle(project);
    expect(project.layers).toHaveLength(1); // the layer went into the base
    expect(changed(cellsKey(project), was)).toEqual([]);
    expect(letters.filter((key) => !project.baseRecords.pins.has(key))).toEqual([]);
  });
});

// The report (euphio.pho): Layer 1 holds a logo painted at ten pixels a grid pixel over a black picture, and Blend into
// source image changed it dramatically. Each covered cell went in as two flat blocks, the base cell's colors with the
// paint's average over them, so By shape picked $, q and p from two halves where it had picked j, Q, f and L from the
// strokes. The paint goes in at its own detail over the picture's own pixels now: the picture is the paint laid over
// black, pixel for pixel at its size. What's left is By shape picking a look-alike now and then, the base's reading of
// the same pixels against the layer's (49 cells of 1,920 that can be seen, against 209 before).
test('R3: the report: Blend into source image lays a finely painted layer into the picture at its own detail', async () => {
  const { project } = await createTestApp();
  await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/euphio.pho')).arrayBuffer()], 'euphio.pho'));
  await settle(project);
  const pixelsOf = (source, width, height) => {
    const canvas = Object.assign(document.createElement('canvas'), { width, height }), ctx = ctx2d(canvas);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };
  expect(pixelsOf(project.image, project.image.width, project.image.height).every((v, i) => i % 4 === 3 || v === 0)).toBe(true); // a black picture
  const paint = Object.assign(document.createElement('canvas'), { width: project.paintLayer.canvas.width, height: project.paintLayer.canvas.height });
  ctx2d(paint).drawImage(project.paintLayer.canvas, 0, 0);
  const seen = () => project.cells.map((c) => (c.char === ' ' || (c.fg.r + c.fg.g + c.fg.b) / 3 < 48 ? ' ' : c.char));
  const before = seen();

  await project.mergeIntoPicture(null, project.layers[1].id);
  await settle(project);
  const { width, height } = project.image, got = pixelsOf(project.image, width, height), want = pixelsOf(paint, width, height);
  let off = 0;
  for (let i = 0; i < got.length; i += 4) if ([0, 1, 2].some((c) => Math.abs(got[i + c] - want[i + c]) > 2)) off++;
  expect(off).toBe(0);
  expect(project.layers).toHaveLength(1);
  const after = seen();
  expect(after.filter((ch, i) => ch !== before[i]).length).toBeLessThanOrEqual(60);
});
