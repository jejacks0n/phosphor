import { floodFill, colorDistance } from '@/lib/FloodFill';
import { selectMatching, unitsOf } from '@/lib/MagicWand';
import { cellKey, parseKey, ownEntry } from '@/document/editCells';
import { cellIndex, charRowsOf, isSolidGlyph, showsChar } from '@/lib/Cells';
import { selectionClip } from '@/lib/selectionClip';
import { placedShapes } from '@/document/followers';
import { isArt } from '@/document/artLayers';
import { hex2rgb } from '@/lib/ColorUtils';
import { onBottom } from '@/store/project/shared.js';
import { busyMessage, busyWhile } from '@/composables/useBusy';
import { t } from '@/i18n/index.js';

// Grid pixels the fill stops at: the picked layer's edit cells showing a character with something to see through (text,
// box lines), so a fill stays inside a drawn box and never covers typed text. A line hidden under
// paint (showsChar) isn't one: the fill covers what you see. With a selection (clip), every pixel
// outside it is a wall too.
// The store's fields are read once, not at each of a million pixels.
function wallsOf(project, clip, picked) {
  const { cols, rows, cells, renderStyle } = project, walls = new Uint8Array(cols * rows);
  if (clip) for (let i = 0; i < walls.length; i++) walls[i] = clip.pixel(i % cols, Math.floor(i / cols)) ? 0 : 1;
  for (const [key, entry] of project.cellsOf(picked)) {
    if (!ownEntry(entry, renderStyle)) continue; // a paint block or a frozen cell is paint (docs/model.md R1)
    const { col, row } = parseKey(key);
    const cell = cells[cellIndex(col, row, cols)];
    if (!cell || isSolidGlyph(cell.char) || !showsChar(cell)) continue;
    for (const c of cell.wide === 'lead' ? [col, col + 1] : [col]) {
      if (c < cols) walls[2 * row * cols + c] = walls[(2 * row + 1) * cols + c] = 1;
    }
  }
  return walls;
}

// Inside an art layer, the grid pixels its own drawing covers (a byte each, from its record where it shows: a ▄ cell's
// halves with a color, any other cell whole); null outside one. A fill started on them stays in them: the dimmed rest
// of the drawing is no part of the layer, however near its colors are (docs/vector.md, Editing an Art Layer).
function artPixels(project) {
  const shape = project.artInside && placedShapes(project).get(project.artInside);
  if (!isArt(shape)) return null;
  const own = new Uint8Array(project.cols * project.rows), { cols, cells } = shape.art, [, , , , c0, y0] = shape.m;
  for (const [i, char, top, bottom] of cells) {
    const x = c0 + i % cols, y = y0 + 2 * Math.floor(i / cols);
    if (x < 0 || x >= project.cols) continue;
    [top, bottom].forEach((half, k) => {
      if ((char !== '▄' || half) && y + k >= 0 && y + k < project.rows) own[(y + k) * project.cols + x] = 1;
    });
  }
  return own;
}

// All layers off (workspace.editFillAllLayers), a fill reads the layer in use alone, not what every shown layer shows
// together; it fills the layer in use either way. The Gradient's too: it fills the Paint Bucket's area.
//
// The layer's own pixels, a grid pixel each: a drawing layer's paint, clear where it has none (null with no paint at all:
// all clear), or the base's picture with its own pixels over it, as it shows with nothing above: its characters as they
// look (docs/model.md R11).
function ownPixels(project) {
  if (onBottom(project)) return project.pixelsAsSeen({ baseOnly: true }); // its pins as they look (docs/model.md R11)
  return project.paintLayer?.hasPaint ? project.paintLayer.gridPixels() : new ImageData(project.cols, project.rows);
}

// The layer's own cell at index i, as { char, fg, bg } (colors as { r, g, b }), each null where the layer has none: a
// character of its own with its colors (ownEntry: docs/model.md R1), a painted cell as the ▄ its halves show (top the
// background), and nothing in a cell it holds nothing in. The base's is its cell as it shows with nothing above. Each
// cell is worked out once: a fill asks about a cell from every side.
function ownCells(project) {
  const { cols } = project, rgb = (hex) => (hex ? hex2rgb(hex) : null), kept = [];
  const once = (cellAt) => (i) => (kept[i] ??= cellAt(i));
  if (onBottom(project)) {
    return once((i) => {
      const look = project.lookUnder(i % cols, Math.floor(i / cols), 'base');
      return { char: look.char, fg: rgb(look.fg), bg: rgb(look.bg) };
    });
  }
  const entries = project.editCells, paint = project.paintLayer?.hasPaint ? project.paintLayer.gridPixels().data : null;
  const half = (x, y) => {
    const o = (y * cols + x) * 4;
    return paint?.[o + 3] ? { r: paint[o], g: paint[o + 1], b: paint[o + 2] } : null;
  };
  return once((i) => {
    const col = i % cols, row = Math.floor(i / cols), entry = entries.get(cellKey(col, row));
    const mine = entry && ownEntry(entry, project.renderStyle) ? entry : null, top = half(col, 2 * row), bottom = half(col, 2 * row + 1);
    return { char: mine?.char ?? (top || bottom ? '▄' : null), fg: rgb(mine?.fg) ?? bottom, bg: rgb(mine?.bg) ?? top };
  });
}

// Fill → Cells (ANSI view): the cells matching the one clicked (what bucketMatch lights: colors within
// the Tolerance, the character exactly), connected to it or anywhere, inside the selection, as
// { x, y } cells (none off the grid). All layers off: matched as the layer in use's own cells (ownCells), where a color
// or character it doesn't have matches only another it doesn't have.
export function cellArea(project, workspace, pos) {
  const width = project.cols, height = charRowsOf(project.rows);
  const start = { x: Math.floor(pos.x), y: Math.floor(pos.y / 2) };
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return [];
  const cells = project.cells, cellAt = workspace.editFillAllLayers ? (i) => cells[i] : ownCells(project);
  const seed = cellAt(start.y * width + start.x), { fg, bg, char } = workspace.bucketMatch;
  const near = (a, b) => (a && b ? colorDistance(a.r, a.g, a.b, b.r, b.g, b.b) <= workspace.editFillTolerance : !a && !b);
  const same = (i) => {
    const cell = cellAt(i);
    return (!fg || near(seed.fg, cell.fg)) && (!bg || near(seed.bg, cell.bg)) && (!char || seed.char === cell.char);
  };
  const clip = selectionClip(workspace), own = artPixels(project);
  const ownCell = (x, y) => own[2 * y * width + x] || own[(2 * y + 1) * width + x];
  const inArt = own && ownCell(start.x, start.y);
  const allowed = (clip || inArt) && ((i) => {
    const x = i % width, y = Math.floor(i / width);
    return (!clip || clip.cell(x, y)) && (!inArt || ownCell(x, y));
  });
  return unitsOf(selectMatching({ width, height, start, same, contiguous: workspace.editFillContiguous, allowed }), width);
}

// Fill → Normal and the PIXEL view: the grid pixels the fill covers ({ x, y, alpha }, alpha below 1
// where it feathers), by Tolerance and Contiguous, stopping at walls, and inside an art layer's own drawing when it starts
// there. All layers off: by the layer in use's own pixels (ownPixels), where clear is a color of its own.
export function pixelArea(project, workspace, pos) {
  const alone = !workspace.editFillAllLayers && ownPixels(project);
  const imageData = alone || project.pixelsAsSeen(); // with the upper layers, as the view shows (docs/model.md R11)
  if (!imageData) return [];
  const x = Math.floor(pos.x), y = Math.floor(pos.y), walls = wallsOf(project, selectionClip(workspace), workspace.pickedLayer), own = artPixels(project);
  if (own && x >= 0 && x < project.cols && own[y * project.cols + x]) own.forEach((mine, i) => { if (!mine) walls[i] = 1; });
  return floodFill(imageData, x, y, workspace.editFillTolerance, workspace.editFillContiguous, workspace.editFillFeather, walls, !!alone);
}

export const fillsCells = (workspace, view) => view === 'output' && workspace.bucketFillWith === 'cells';

// Cells gives the area what bucketSet lights (your FG and BG, None keeps the cell's, and
// character) as edit cells over the paint; Normal paints it in the foreground color. Under the busy note ("Filling…"),
// which a fill over most of a large drawing is long enough to show; it starts on the next frame, with the note drawn.
export async function fillSolid({ project, workspace, view }, pos) {
  return busyWhile(t('busy.filling'), () => {
    if (fillsCells(workspace, view)) {
      const set = workspace.bucketSet, colors = workspace.typingAttrs();
      const attrs = { ...(set.fg ? { fg: colors.fg, fgIndex: colors.fgIndex } : {}), ...(set.bg ? { bg: colors.bg, bgIndex: colors.bgIndex } : {}), ...(set.char ? { char: workspace.activeChar } : {}) };
      project.writeEditCells(cellArea(project, workspace, pos).map(({ x, y }) => ({ col: x, row: y, attrs })), { clearPaint: true });
    } else {
      project.paintStroke(pixelArea(project, workspace, pos));
    }
    project.commitEdit();
  });
}

// A press outside the selection, where a fill has nothing to fill.
export function outsideSelection({ workspace, view }, pos) {
  const clip = selectionClip(workspace), x = Math.floor(pos.x), y = Math.floor(pos.y);
  return !!clip && !(fillsCells(workspace, view) ? clip.cell(x, Math.floor(y / 2)) : clip.pixel(x, y));
}

const cellOptions = { views: ['output'], when: (ws) => ws.bucketFillWith === 'cells' };
const MATCH_OPTIONS = [
  { key: 'fg', get label() { return t('tools.matchToggles.fg'); }, get title() { return t('tools.matchToggles.fgTitle'); } },
  { key: 'bg', get label() { return t('tools.matchToggles.bg'); }, get title() { return t('tools.matchToggles.bgTitle'); } },
  { key: 'char', get label() { return t('tools.matchToggles.char'); }, get title() { return t('tools.matchToggles.charTitle'); } },
];
const SET_OPTIONS = [
  { key: 'fg', get label() { return t('tools.matchToggles.fg'); }, get title() { return t('tools.bucket.setFgTitle'); } },
  { key: 'bg', get label() { return t('tools.matchToggles.bg'); }, get title() { return t('tools.bucket.setBgTitle'); } },
  { key: 'char', get label() { return t('tools.matchToggles.char'); }, get title() { return t('tools.bucket.setCharTitle'); } },
];

// The Paint Bucket's and the Gradient's own rows: how far a fill reaches, and (ANSI view) what it fills with.
export const FILL_OPTIONS = [
  { key: 'editFillTolerance', get label() { return t('tools.bucket.tolerance'); }, get title() { return t('tools.bucket.toleranceTitle'); }, min: 0, max: 100 },
  { key: 'editFillContiguous', get label() { return t('tools.bucket.contiguous'); }, get title() { return t('tools.bucket.contiguousTitle'); }, type: 'checkbox' },
  { key: 'editFillAllLayers', get label() { return t('tools.bucket.allLayers'); }, get title() { return t('tools.bucket.allLayersTitle'); }, type: 'checkbox' },
  { key: 'editFillFeather', get label() { return t('tools.bucket.feather'); }, get title() { return t('tools.bucket.featherTitle'); }, min: 0, max: 100, when: (ws) => ws.editorTab === 'input' || ws.bucketFillWith !== 'cells' },
  { key: 'bucketMatch', get label() { return t('tools.bucket.match'); }, type: 'toggles', options: MATCH_OPTIONS, ...cellOptions },
];
export const FILL_WITH = {
  key: 'bucketFillWith', get label() { return t('tools.bucket.fill'); }, type: 'dropdown', views: ['output'],
  choices: [
    { value: 'normal', get label() { return t('tools.drawWith.normal'); }, glyph: '' }, // the color you see, at grid resolution
    { value: 'cells', get label() { return t('tools.drawWith.cells'); }, glyph: '▒▓' },      // whole cells: their colors and characters
  ],
};

export default {
  id: 'bucket',
  get title() { return t('tools.bucket.title'); },
  keys: ['G'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M341.7 135.6L277.3 200L310.7 233.4C323.2 245.9 323.2 266.2 310.7 278.7C298.2 291.2 277.9 291.2 265.4 278.7L232 245.3L135.6 341.7C132.7 344.6 130.5 348.2 129.3 352L450.8 352L504.5 298.3C509.4 293.4 512.1 286.8 512.1 280C512.1 273.2 509.4 266.5 504.5 261.7L378.3 135.6C373.5 130.7 366.9 128 360 128C353.1 128 346.5 130.7 341.7 135.6zM90.3 296.4L186.7 200L137.3 150.6C124.8 138.1 124.8 117.8 137.3 105.3C149.8 92.8 170.1 92.8 182.6 105.3L232 154.7L296.4 90.3C313.3 73.5 336.1 64 360 64C383.9 64 406.7 73.5 423.6 90.3L549.7 216.4C566.5 233.3 576 256.1 576 280C576 303.9 566.5 326.7 549.7 343.6L343.6 549.7C326.7 566.5 303.9 576 280 576C256.1 576 233.3 566.5 216.4 549.7L90.3 423.6C73.5 406.7 64 383.9 64 360C64 336.1 73.5 313.3 90.3 296.4zM544 608C508.7 608 480 579.3 480 544C480 518.8 512.6 464.4 531.2 435.3C537.2 425.9 550.7 425.9 556.7 435.3C575.4 464.4 607.9 518.8 607.9 544C607.9 579.3 579.2 608 543.9 608z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  options: [
    ...FILL_OPTIONS,
    { key: 'bucketSet', get label() { return t('tools.bucket.set'); }, type: 'toggles', options: SET_OPTIONS, ...cellOptions },
    { key: 'activeChar', get label() { return t('tools.matchToggles.char'); }, type: 'char', views: ['output'], when: (ws) => ws.bucketFillWith === 'cells' && ws.bucketSet.char },
    FILL_WITH,
  ],
  // Normal paints the foreground; Cells writes what Set lights, a None color keeping the cell's, so with only None
  // colors lit it would write nothing (and clear the paint under the area).
  nothingToLay({ workspace, view }) {
    if (!fillsCells(workspace, view)) return workspace.editFgNone ? 'tools.fgNone' : null;
    const { fg, bg, char } = workspace.bucketSet;
    if (char || (fg && !workspace.editFgNone) || (bg && !workspace.editBgNone)) return null;
    return fg && bg ? 'tools.colorsNone' : fg ? 'tools.fgNone' : bg ? 'tools.bgNone' : null;
  },
  // With Char alone lit it sets no colors anyway, so None has nothing to say there.
  writesChars: ({ workspace, view }) => fillsCells(workspace, view) && workspace.bucketSet.char && (workspace.bucketSet.fg || workspace.bucketSet.bg),
  // One click fills, with no stroke to continue; a click outside the selection does nothing, and so does one while the
  // busy note's up: the fill before it, still to run or running, goes first and alone.
  begin(ctx, pos, event) {
    if (!ctx.project.renderer.outputCanvas || busyMessage.value) return false;
    event.stopPropagation();
    if (outsideSelection(ctx, pos)) return false;
    fillSolid(ctx, pos).catch((error) => console.error('The fill failed', error));
    return false;
  },
};
