import { gradientAt, blendColor, blendChar } from '@/lib/Gradient';
import { hex2rgb } from '@/lib/ColorUtils';
import { toast } from '@/composables/useToast';
import { snappedEnd } from './shapes';
import { cellArea, pixelArea, fillsCells, outsideSelection, FILL_OPTIONS, FILL_WITH } from './bucket';
import { watch } from 'vue';
import { t } from '@/i18n/index.js';

// Linear or Spherical, from the drag's line, over the area the Paint Bucket would fill from its start: Cells gives each
// cell of the area its blend character in your two colors; Normal paints each pixel its blended color, at the brush
// opacity, as a fill paints.
function fillGradient({ project, workspace, view }, from, to) {
  const shape = workspace.gradientShape, fg = workspace.editFgColor, bg = workspace.editBgColor;
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

// The line while it's dragged: where it started, and where the pointer is before Shift has its say.
let start = null, last = null, stopShift = null;
const lineEnd = (workspace) => (workspace.isShiftPressed ? snappedEnd(start, last) : last);

function stopDrag({ workspace }) {
  stopShift?.();
  stopShift = null;
  workspace.shapeDrag = null;
  start = null;
}

export default {
  id: 'gradient',
  get title() { return t('tools.gradient.title'); },
  keys: ['Shift+G'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill-rule="evenodd" d="M176 96H464C508.2 96 544 131.8 544 176V464C544 508.2 508.2 544 464 544H176C131.8 544 96 508.2 96 464V176C96 131.8 131.8 96 176 96ZM176 144C158.3 144 144 158.3 144 176V464C144 481.7 158.3 496 176 496H464C481.7 496 496 481.7 496 464V176C496 158.3 481.7 144 464 144Z"/><path d="M144 144H232V496H144Z"/><path fill-opacity=".65" d="M232 144H320V496H232Z"/><path fill-opacity=".4" d="M320 144H408V496H320Z"/><path fill-opacity=".18" d="M408 144H496V496H408Z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  options: [
    ...FILL_OPTIONS,
    FILL_WITH,
    {
      key: 'gradientShape', get label() { return t('tools.gradient.shape'); }, type: 'segmented',
      choices: [
        { value: 'linear', get label() { return t('tools.gradient.linear'); } },
        { value: 'spherical', get label() { return t('tools.gradient.spherical'); } },
      ],
    },
  ],
  // What Shift does, for the status bar.
  shiftHint: () => t('tools.shapes.shiftSnap45'),
  // A drag draws the line (shown as Shapes shows a line) and the release fills; a press outside the selection does
  // nothing.
  begin(ctx, pos, event) {
    const { project, workspace } = ctx;
    if (!project.renderer.outputCanvas) return false;
    event.stopPropagation();
    if (outsideSelection(ctx, pos)) return false;
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
  // Released on the spot it was pressed: a click, with no line to fill along, so nothing. It needs both colors.
  end(ctx) {
    const drag = ctx.workspace.shapeDrag, from = start;
    stopDrag(ctx);
    if (!from || !drag) return;
    const to = drag.to;
    if (Math.floor(to.x) === Math.floor(from.x) && Math.floor(to.y) === Math.floor(from.y)) return;
    if (ctx.workspace.editFgNone || ctx.workspace.editBgNone) toast(t('tools.gradient.needsColors'));
    else fillGradient(ctx, from, to);
  },
  // A pinch took over the drag: nothing is filled.
  cancel: stopDrag,
};
