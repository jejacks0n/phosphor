import { floodFill, colorDistance } from '@/lib/FloodFill';
import { selectMatching, unitsOf } from '@/lib/MagicWand';
import { ctx2d } from '@/lib/Canvas';
import { parseKey } from '@/document/editCells';
import { cellIndex, charRowsOf, isSolidGlyph, showsChar } from '@/lib/Cells';
import { selectionClip } from '@/lib/selectionClip';
import { gradientAt, blendColor, blendChar } from '@/lib/Gradient';
import { hex2rgb } from '@/lib/ColorUtils';
import { toast } from '@/composables/useToast';
import { snappedEnd } from './shapes';
import { watch } from 'vue';
import { t } from '@/i18n/index.js';

// Grid pixels the fill stops at: the picked layer's edit cells showing a character with something to see through (text,
// box lines), so a fill stays inside a drawn box and never covers typed text. A line hidden under
// paint (showsChar) isn't one: the fill covers what you see. With a selection (clip), every pixel
// outside it is a wall too.
function wallsOf(project, clip, picked) {
  const walls = new Uint8Array(project.cols * project.rows);
  if (clip) for (let i = 0; i < walls.length; i++) walls[i] = clip.pixel(i % project.cols, Math.floor(i / project.cols)) ? 0 : 1;
  for (const key of project.cellsOf(picked).keys()) {
    const { col, row } = parseKey(key);
    const cell = project.cells[cellIndex(col, row, project.cols)];
    if (!cell || isSolidGlyph(cell.char) || !showsChar(cell)) continue;
    for (const c of cell.wide === 'lead' ? [col, col + 1] : [col]) {
      if (c < project.cols) walls[2 * row * project.cols + c] = walls[(2 * row + 1) * project.cols + c] = 1;
    }
  }
  return walls;
}

// Fill → Cells (ANSI view): the cells matching the one clicked (what bucketMatch lights: colors within
// the Tolerance, the character exactly), connected to it or anywhere, inside the selection, as
// { x, y } cells (none off the grid).
function cellArea(project, workspace, pos) {
  const width = project.cols, height = charRowsOf(project.rows);
  const start = { x: Math.floor(pos.x), y: Math.floor(pos.y / 2) };
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return [];
  const cells = project.cells, seed = cells[start.y * width + start.x], { fg, bg, char } = workspace.bucketMatch;
  const near = (a, b) => colorDistance(a.r, a.g, a.b, b.r, b.g, b.b) <= workspace.editFillTolerance;
  const same = (i) => (!fg || near(seed.fg, cells[i].fg)) && (!bg || near(seed.bg, cells[i].bg)) && (!char || seed.char === cells[i].char);
  const clip = selectionClip(workspace);
  const allowed = clip && ((i) => clip.cell(i % width, Math.floor(i / width)));
  return unitsOf(selectMatching({ width, height, start, same, contiguous: workspace.editFillContiguous, allowed }), width);
}

// Fill → Normal and the PIXEL view: the grid pixels the fill covers ({ x, y, alpha }, alpha below 1
// where it feathers), by Tolerance and Contiguous, stopping at walls.
function pixelArea(project, workspace, pos) {
  const imageData = ctx2d(project.renderer.shownCanvas()).getImageData(0, 0, project.cols, project.rows); // with the upper layers' pixels, as the view shows
  return floodFill(imageData, Math.floor(pos.x), Math.floor(pos.y), workspace.editFillTolerance, workspace.editFillContiguous, workspace.editFillFeather, wallsOf(project, selectionClip(workspace), workspace.pickedLayer));
}

const fillsCells = (workspace, view) => view === 'output' && workspace.bucketFillWith === 'cells';

// Solid: Cells gives the area what bucketSet lights (your FG and BG, None keeps the cell's, and
// character) as edit cells over the paint; Normal paints it in the foreground color.
function fillSolid({ project, workspace, view }, pos) {
  if (fillsCells(workspace, view)) {
    const set = workspace.bucketSet, colors = workspace.typingAttrs();
    const attrs = { ...(set.fg ? { fg: colors.fg, fgIndex: colors.fgIndex } : {}), ...(set.bg ? { bg: colors.bg, bgIndex: colors.bgIndex } : {}), ...(set.char ? { char: workspace.activeChar } : {}) };
    project.writeEditCells(cellArea(project, workspace, pos).map(({ x, y }) => ({ col: x, row: y, attrs })), { clearPaint: true });
  } else {
    project.paintStroke(pixelArea(project, workspace, pos));
  }
  project.commitEdit();
}

// Linear or Spherical, from the drag's line: Cells gives each cell of the area its blend character
// in your two colors (Set doesn't apply); Normal paints each pixel its blended color, at the brush
// opacity, as a solid fill paints.
function fillGradient({ project, workspace, view }, from, to) {
  const shape = workspace.bucketGradient, fg = workspace.editFgColor, bg = workspace.editBgColor;
  if (fillsCells(workspace, view)) {
    const { editFgIndex: fgIndex, editBgIndex: bgIndex } = workspace;
    const cells = cellArea(project, workspace, from).map(({ x, y }) => ({ col: x, row: y, attrs: { char: blendChar(shape, from, to, x, y), fg, bg, fgIndex, bgIndex } }));
    project.writeEditCells(cells, { clearPaint: true });
  } else {
    const f = hex2rgb(fg), b = hex2rgb(bg);
    const pixels = pixelArea(project, workspace, from).map((p) => ({ ...p, ...blendColor(f, b, gradientAt(shape, from, to, p.x + 0.5, p.y + 0.5)) }));
    project.paintEditPixels(pixels, workspace.editBrushOpacity, workspace.editBrushStack);
  }
  project.commitEdit();
}

// The gradient's line while it's dragged: where it started, and where the pointer is before Shift
// has its say.
let start = null, last = null, stopShift = null;
const lineEnd = (workspace) => (workspace.isShiftPressed ? snappedEnd(start, last) : last);

function stopDrag({ workspace }) {
  stopShift?.();
  stopShift = null;
  workspace.shapeDrag = null;
  start = null;
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

export default {
  id: 'bucket',
  get title() { return t('tools.bucket.title'); },
  keys: ['G'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M341.7 135.6L277.3 200L310.7 233.4C323.2 245.9 323.2 266.2 310.7 278.7C298.2 291.2 277.9 291.2 265.4 278.7L232 245.3L135.6 341.7C132.7 344.6 130.5 348.2 129.3 352L450.8 352L504.5 298.3C509.4 293.4 512.1 286.8 512.1 280C512.1 273.2 509.4 266.5 504.5 261.7L378.3 135.6C373.5 130.7 366.9 128 360 128C353.1 128 346.5 130.7 341.7 135.6zM90.3 296.4L186.7 200L137.3 150.6C124.8 138.1 124.8 117.8 137.3 105.3C149.8 92.8 170.1 92.8 182.6 105.3L232 154.7L296.4 90.3C313.3 73.5 336.1 64 360 64C383.9 64 406.7 73.5 423.6 90.3L549.7 216.4C566.5 233.3 576 256.1 576 280C576 303.9 566.5 326.7 549.7 343.6L343.6 549.7C326.7 566.5 303.9 576 280 576C256.1 576 233.3 566.5 216.4 549.7L90.3 423.6C73.5 406.7 64 383.9 64 360C64 336.1 73.5 313.3 90.3 296.4zM544 608C508.7 608 480 579.3 480 544C480 518.8 512.6 464.4 531.2 435.3C537.2 425.9 550.7 425.9 556.7 435.3C575.4 464.4 607.9 518.8 607.9 544C607.9 579.3 579.2 608 543.9 608z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  options: [
    { key: 'editFillTolerance', get label() { return t('tools.bucket.tolerance'); }, get title() { return t('tools.bucket.toleranceTitle'); }, min: 0, max: 100 },
    { key: 'editFillContiguous', get label() { return t('tools.bucket.contiguous'); }, get title() { return t('tools.bucket.contiguousTitle'); }, type: 'checkbox' },
    { key: 'editFillFeather', get label() { return t('tools.bucket.feather'); }, get title() { return t('tools.bucket.featherTitle'); }, min: 0, max: 100, when: (ws) => ws.editorTab === 'input' || ws.bucketFillWith !== 'cells' },
    { key: 'bucketMatch', get label() { return t('tools.bucket.match'); }, type: 'toggles', options: MATCH_OPTIONS, ...cellOptions },
    { key: 'bucketSet', get label() { return t('tools.bucket.set'); }, type: 'toggles', options: SET_OPTIONS, views: ['output'], when: (ws) => ws.bucketFillWith === 'cells' && ws.bucketGradient === 'solid' },
    {
      key: 'bucketFillWith', get label() { return t('tools.bucket.fill'); }, type: 'dropdown', views: ['output'],
      choices: [
        { value: 'normal', get label() { return t('tools.drawWith.normal'); }, glyph: '' }, // the color you see, at grid resolution
        { value: 'cells', get label() { return t('tools.drawWith.cells'); }, glyph: '▒▓' },      // whole cells: their colors and characters
      ],
    },
    {
      key: 'bucketGradient', get label() { return t('tools.bucket.gradient'); }, type: 'segmented',
      choices: [
        { value: 'solid', get label() { return t('tools.bucket.gradientSolid'); } },
        { value: 'linear', get label() { return t('tools.bucket.gradientLinear'); } },
        { value: 'spherical', get label() { return t('tools.bucket.gradientSpherical'); } },
      ],
    },
  ],
  // What Shift does, for the status bar.
  shiftHint: (ws) => (ws.bucketGradient === 'solid' ? null : t('tools.shapes.shiftSnap45')),
  // Solid: one click fills, with no stroke to continue. Linear and Spherical: a drag draws the line
  // (shown as Shapes shows a line) and the release fills; a press outside the selection does nothing.
  begin(ctx, pos, event) {
    const { project, workspace } = ctx;
    if (!project.renderer.outputCanvas) return false;
    event.stopPropagation();
    const clip = selectionClip(workspace), x = Math.floor(pos.x), y = Math.floor(pos.y);
    if (clip && !(fillsCells(workspace, ctx.view) ? clip.cell(x, Math.floor(y / 2)) : clip.pixel(x, y))) return false; // outside the selection: nothing to fill
    if (workspace.bucketGradient === 'solid') {
      fillSolid(ctx, pos);
      return false;
    }
    start = last = pos;
    workspace.shapeDrag = { from: pos, to: pos, line: true };
    stopShift?.();
    // Shift going down or up snaps the line at once, with the pointer still.
    stopShift = watch(() => workspace.isShiftPressed, () => {
      workspace.shapeDrag = { from: start, to: lineEnd(workspace), line: true };
    }, { flush: 'sync' });
    return true;
  },
  move({ workspace }, from, to) {
    if (!start) return;
    last = to;
    workspace.shapeDrag = { from: start, to: lineEnd(workspace), line: true };
  },
  // Released on the spot it was pressed: a click, which fills solid. A gradient needs both colors.
  end(ctx) {
    const drag = ctx.workspace.shapeDrag, from = start;
    stopDrag(ctx);
    if (!from || !drag) return;
    const to = drag.to;
    if (Math.floor(to.x) === Math.floor(from.x) && Math.floor(to.y) === Math.floor(from.y)) fillSolid(ctx, from);
    else if (ctx.workspace.editFgNone || ctx.workspace.editBgNone) toast(t('tools.bucket.gradientNeedsColors'));
    else fillGradient(ctx, from, to);
  },
  // A pinch took over the drag: nothing is filled.
  cancel: stopDrag,
};
