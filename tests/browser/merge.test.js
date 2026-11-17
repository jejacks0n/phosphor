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
import { coverageOf } from '@/lib/GlyphCoverage.js';

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

const maxDiff = (a, b, only) => (only ?? a.map((_, i) => i)).reduce((m, i) => Math.max(m, ...a[i].map((v, k) => Math.abs(v - b[i][k]))), 0);
const drawnCells = (project, rect) => {
  const at = new Set([...project.editCells.keys()]);
  const rows = Math.floor(project.rows / 2);
  for (let row = 0; row < rows; row++) for (let col = 0; col < project.cols; col++) if (project.cellHasPaint(col, row)) at.add(`${col},${row}`);
  return [...at].map((k) => k.split(',').map(Number))
    .filter(([c, r]) => !rect || (c >= rect.c0 && c <= rect.c1 && r >= rect.r0 && r <= rect.r1))
    .map(([c, r]) => r * project.cols + c);
};

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
  // converter's paint, into the picture; a cell on black folds the paint over it into its ink and stays on black.
  test('R1: the report: Into the image in Color ASCII gives no cell a background it didn\'t show, and keeps the text\'s', async () => {
    const { project } = await createTestApp();
    await project.loadProject(new File([await (await fetch('/tests/fixtures/projects/text-merge-base.phosphor')).arrayBuffer()], 'x.phosphor'));
    await settle(project);
    const before = project.cells.map((c) => c.bg.hex), at = 10 * project.cols + 26;
    const typed = [...project.cellsOf('edit').values()].filter((entry) => ownEntry(entry, 'colorAscii')).length; // the text; the rest are Colors only's ▄s
    await project.mergeIntoPicture();
    await settle(project);
    const after = project.cells.map((c) => c.bg.hex);
    expect(after.filter((bg, i) => bg !== '#000000' && before[i] === '#000000')).toHaveLength(0);
    expect([project.cells[at].char, project.cells[at].bg.hex]).toEqual(['t', '#999898']);
    expect(project.baseRecords.pins.size).toBe(typed); // the text pinned, not the stroke's cells
  });

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
      expect([cell.char, cell.bg.hex]).toEqual(['A', '#000000']);
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

  test('at neutral: the same look; solid cells pinned ▄, letters kept', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    const before = halves(project);
    await project.mergeIntoPicture();
    await settle(project);
    expect(maxDiff(before, halves(project))).toBeLessThanOrEqual(1); // soft paint can round a level
    const char = (c, r) => project.cells[r * project.cols + c].char;
    expect(char(14, 8)).toBe('A');
    expect(char(20, 8)).toBe('▄');
    expect(project.imageIsWorkingCopy).toBe(true);
    expect(project.editCells.size).toBe(0);
  });

  // docs/model.md R3: a frozen cell's pin is its look; the paint under it stays out of the picture (onBase keeps it out too).
  test('R3: Into the image takes a frozen cell\'s pinned colors, not the paint under it', async () => {
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
    expect(project.baseRecords.pins.get('5,5')).toBe('A');
    expect([project.baseColorAt(5, 10), project.baseColorAt(5, 11)]).toEqual(['#0000ff', '#00ff00']);
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
    const rect = { c0: 10, r0: 5, c1: 21, r1: 12 };
    const before = halves(project);
    await project.mergeIntoPicture(rect);
    await settle(project);
    expect(maxDiff(before, halves(project))).toBeLessThanOrEqual(1);
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
