import { brushPixels } from '@/lib/Brushes';

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
    { key: 'editBrushStack', label: 'Stack opacity', title: 'Each stroke lays up to the opacity on top of what\'s there: two strokes at 50% make it solid', type: 'checkbox' },
  ],
  begin(ctx, pos) {
    brush.move(ctx, pos, pos);
    return true;
  },
  move({ project, workspace }, from, to) {
    const options = { size: workspace.editBrushSize, flow: workspace.editBrushFlow / 100, hardness: workspace.editBrushHardness / 100 };
    project.paintStroke(brushPixels(from, to, options, project.cols, project.rows));
  },
  end({ project }) {
    project.commitEdit();
  },
};

export default brush;
