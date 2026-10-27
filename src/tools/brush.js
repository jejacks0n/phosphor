import { brushStamps, brushPixels, passWeight } from '@/lib/Brushes';

// Flow is how much paint a dab lays, and a stroke in one pass, at any size: the slider squared, so its
// low end builds up gently (10% lays 1%, 50% a quarter, 100% covers).
const strength = (workspace) => (workspace.editBrushFlow / 100) ** 2;
const shape = (workspace) => ({ size: workspace.editBrushSize, hardness: workspace.editBrushHardness / 100 });
// A pass's stamps add up to about 1% short of passWeight (it's measured between them): aim 3% over,
// so 100% covers solid.
const PASS_FIT = 0.97;
let carried = 0; // how far the stroke has gone since its last stamp (brushStamps)
let laid = null;  // the stroke's paint so far at each pixel (x + y * 65536), unrounded
let dab = null;   // where the stroke began, until it moves

// Paint the stamps' pixels as the stroke's paint reaches each whole step of the layer's alpha byte: a
// big brush's stamps each lay a sliver (a size-20 brush at 10% about a two-thousandth), which the layer
// would round to nothing one at a time.
function lay(project, pixels) {
  const steps = [];
  for (const { x, y, alpha } of pixels) {
    const key = x + y * 65536, before = laid.get(key) ?? 0, after = before + alpha;
    laid.set(key, after);
    const bytes = Math.round(Math.min(1, after) * 255) - Math.round(Math.min(1, before) * 255);
    if (bytes > 0) steps.push({ x, y, alpha: bytes / 255 });
  }
  project.paintStroke(steps);
}

const brush = {
  id: 'brush',
  title: 'Brush (soft)',
  keys: ['B'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M512.5 74.3L291.1 222C262 241.4 243.5 272.9 240.5 307.3C302.8 320.1 351.9 369.2 364.8 431.6C399.3 428.6 430.7 410.1 450.1 381L597.7 159.5C604.4 149.4 608 137.6 608 125.4C608 91.5 580.5 64 546.6 64C534.5 64 522.6 67.6 512.5 74.3zM320 464C320 402.1 269.9 352 208 352C146.1 352 96 402.1 96 464C96 467.9 96.2 471.8 96.6 475.6C98.4 493.1 86.4 512 68.8 512L64 512C46.3 512 32 526.3 32 544C32 561.7 46.3 576 64 576L208 576C269.9 576 320 525.9 320 464z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  preview: { shape: 'circle', size: (workspace) => workspace.editBrushSize },
  options: [
    { key: 'editBrushSize', label: 'Size', title: 'Brush size', min: 1, max: 20, step: 0.1, decimals: 1 },
    { key: 'editBrushOpacity', label: 'Opacity', title: 'Brush opacity', min: 1, max: 100, unit: '%' },
    { key: 'editBrushFlow', label: 'Flow', title: 'Brush flow', min: 1, max: 100, unit: '%' },
    { key: 'editBrushHardness', label: 'Hardness', title: 'Brush hardness', min: 0, max: 100, unit: '%' },
  ],
  begin({ project, workspace }, pos) {
    // Half a dab where it starts: a stroke's own stamps lay about half at its end, so it starts as
    // strong as it goes on; a click (no move) gets the other half when it ends.
    carried = 0;
    laid = new Map();
    dab = pos;
    lay(project, brushPixels([pos], { ...shape(workspace), flow: strength(workspace) / 2 }, project.cols, project.rows));
    return true;
  },
  move({ project, workspace }, from, to) {
    dab = null;
    const stamps = brushStamps(from, to, carried), { size, hardness } = shape(workspace);
    carried = stamps.carried;
    const flow = strength(workspace) / (passWeight(size, hardness) * PASS_FIT); // the pass's stamps lay `strength` together
    lay(project, brushPixels(stamps.points, { size, hardness, flow }, project.cols, project.rows));
  },
  end({ project, workspace }) {
    if (dab) lay(project, brushPixels([dab], { ...shape(workspace), flow: strength(workspace) / 2 }, project.cols, project.rows));
    dab = null;
    project.commitEdit();
  },
};

export default brush;
