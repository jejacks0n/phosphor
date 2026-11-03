import { brushPixels } from '@/lib/Brushes';
import { selectionClip } from '@/lib/selectionClip';
import { t } from '@/i18n/index.js';

// A stamp's flow from the Flow slider (1-100): squared, so the low end builds up gently (a stroke's
// stamps overlap and add up: 10% used to lay 70% in one pass at size 5), and never under the
// paint layer's smallest step (1/255), which would round to nothing.
const stampFlow = (percent) => Math.max(1 / 255, (percent / 100) ** 2);

const brush = {
  id: 'brush',
  get title() { return t('tools.brush.title'); },
  keys: ['B'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M512.5 74.3L291.1 222C262 241.4 243.5 272.9 240.5 307.3C302.8 320.1 351.9 369.2 364.8 431.6C399.3 428.6 430.7 410.1 450.1 381L597.7 159.5C604.4 149.4 608 137.6 608 125.4C608 91.5 580.5 64 546.6 64C534.5 64 522.6 67.6 512.5 74.3zM320 464C320 402.1 269.9 352 208 352C146.1 352 96 402.1 96 464C96 467.9 96.2 471.8 96.6 475.6C98.4 493.1 86.4 512 68.8 512L64 512C46.3 512 32 526.3 32 544C32 561.7 46.3 576 64 576L208 576C269.9 576 320 525.9 320 464z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  shiftLines: true, // Shift-click: a straight line from where the last stroke ended
  preview: { shape: 'circle', size: (workspace) => workspace.editBrushSize },
  options: [
    { key: 'editBrushSize', get label() { return t('tools.brush.size'); }, get title() { return t('tools.brush.sizeTitle'); }, min: 1, max: 20, step: 0.1, decimals: 1 },
    { key: 'editBrushOpacity', get label() { return t('tools.brush.opacity'); }, get title() { return t('tools.brush.opacityTitle'); }, min: 1, max: 100, unit: '%' },
    { key: 'editBrushFlow', get label() { return t('tools.brush.flow'); }, get title() { return t('tools.brush.flowTitle'); }, min: 1, max: 100, unit: '%' },
    { key: 'editBrushHardness', get label() { return t('tools.brush.hardness'); }, get title() { return t('tools.brush.hardnessTitle'); }, min: 0, max: 100, unit: '%' },
    { key: 'editBrushStack', get label() { return t('tools.brush.stack'); }, get title() { return t('tools.brush.stackTitle'); }, type: 'checkbox' },
    {
      key: 'brushDrawWith', get label() { return t('tools.drawWith.label'); }, type: 'dropdown', views: ['output'],
      choices: [
        { value: 'normal', get label() { return t('tools.drawWith.normal'); }, glyph: '' }, // paint over each cell's own character, which shows through
        { value: 'half', get label() { return t('tools.drawWith.halfBlock'); }, glyph: '▀▄' },  // each cell painted becomes a ▄ the paint colors
      ],
    },
  ],
  begin(ctx, pos, event) {
    brush.move(ctx, (event?.shiftKey && ctx.workspace.strokeEnd) || pos, pos);
    return true;
  },
  move({ project, workspace, view }, from, to) {
    const options = { size: workspace.editBrushSize, flow: stampFlow(workspace.editBrushFlow), hardness: workspace.editBrushHardness / 100 };
    const clip = selectionClip(workspace);
    const pixels = brushPixels(from, to, options, project.cols, project.rows);
    project.paintStroke(clip ? pixels.filter(({ x, y }) => clip.pixel(x, y)) : pixels, undefined, { blockChars: view === 'output' && workspace.brushDrawWith === 'half' });
    workspace.strokeEnd = to;
  },
  end({ project }) {
    project.commitEdit();
  },
};

export default brush;
