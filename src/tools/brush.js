import { brushPixels } from '@/lib/Brushes';
import { selectionClip } from '@/lib/selectionClip';
import { t } from '@/i18n/index.js';
import { useProjectStore } from '@/store/ProjectStore';
import { beginShade, shade, shadeChoice, shades, shadeWayOption } from '@/tools/shade';

// Draw with: Ink only (docs/model.md R17), the Pencil's and the Brush's: Set FG along a stroke, a cell's foreground
// recolored where it shows a character. After Half-block; not in Monochrome ASCII, which shows no color, where the tool
// draws Colors only (inkDrawn, what the toolbar shows).
const colored = () => useProjectStore().renderStyle !== 'ascii';
export const inkChoice = { value: 'ink', get label() { return t('tools.drawWith.ink'); }, glyph: 'Aa', when: colored };
export const inks = (ws, key, view = ws.editorTab) => view === 'output' && ws[key] === 'ink' && colored();
export const inkDrawn = (value) => (value === 'ink' && !colored() ? 'normal' : value);

// Opacity, Flow, Hardness and Build up: a Shade or Ink only stroke's cells take a whole step or none (a whole color or
// none), so they go while it's shown.
const painting = (ws) => !shades(ws, 'brushDrawWith') && !inks(ws, 'brushDrawWith');

// A stamp's flow from the Flow slider (1-100): squared, so the low end builds up gently (a stroke's
// stamps overlap and add up: 10% used to lay 70% in one pass at size 5), and never under the
// paint layer's smallest step (1/255), which would round to nothing.
export const stampFlow = (percent) => Math.max(1 / 255, (percent / 100) ** 2);

// The other paint tools' Opacity (the Pencil's, Shapes', the Paint Bucket's, the Gradient's): each its own, kept, and
// laid by that tool alone, shown only where it lays paint (paints). Not in the toolbar until there's room for it:
// OPACITY_SHOWN shows all four, and the Pencil's and Shapes' digits then set it.
export const OPACITY_SHOWN = false;
export const opacityOption = (key, paints) => ({
  key, amount: true, get label() { return t('tools.opacity'); }, get title() { return t('tools.opacityTitle'); }, min: 1, max: 100, unit: '%',
  when: (ws) => OPACITY_SHOWN && paints(ws),
});

const brush = {
  id: 'brush',
  get title() { return t('tools.brush.title'); },
  keys: ['B'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M512.5 74.3L291.1 222C262 241.4 243.5 272.9 240.5 307.3C302.8 320.1 351.9 369.2 364.8 431.6C399.3 428.6 430.7 410.1 450.1 381L597.7 159.5C604.4 149.4 608 137.6 608 125.4C608 91.5 580.5 64 546.6 64C534.5 64 522.6 67.6 512.5 74.3zM320 464C320 402.1 269.9 352 208 352C146.1 352 96 402.1 96 464C96 467.9 96.2 471.8 96.6 475.6C98.4 493.1 86.4 512 68.8 512L64 512C46.3 512 32 526.3 32 544C32 561.7 46.3 576 64 576L208 576C269.9 576 320 525.9 320 464z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  mirrors: true,
  altPicks: true,
  shiftLines: true, // Shift-click: a straight line from where the last stroke ended
  pressure: true, // a pen's positions carry its pressure (useEditorInteractions), which scales each stamp's size and flow
  preview: { shape: 'circle', size: (workspace) => workspace.editBrushSize },
  nothingToLay: ({ workspace }) => (workspace.editFgNone ? 'tools.fgNone' : null), // it paints the foreground
  options: [
    { key: 'editBrushSize', size: true, get label() { return t('tools.brush.size'); }, get title() { return t('tools.brush.sizeTitle'); }, min: 1, max: 20, step: 0.1, decimals: 1 },
    { key: 'editBrushOpacity', amount: true, get label() { return t('tools.brush.opacity'); }, get title() { return t('tools.brush.opacityTitle'); }, min: 1, max: 100, unit: '%', when: painting },
    { key: 'editBrushFlow', get label() { return t('tools.brush.flow'); }, get title() { return t('tools.brush.flowTitle'); }, min: 1, max: 100, unit: '%', when: painting },
    { key: 'editBrushHardness', hardness: true, get label() { return t('tools.brush.hardness'); }, get title() { return t('tools.brush.hardnessTitle'); }, min: 0, max: 100, unit: '%', when: painting },
    { key: 'editBrushStack', get label() { return t('tools.brush.stack'); }, get title() { return t('tools.brush.stackTitle'); }, type: 'checkbox', when: painting },
    {
      key: 'brushDrawWith', drawWith: true, get label() { return t('tools.drawWith.label'); }, type: 'dropdown', views: ['output'],
      choices: [
        { value: 'normal', get label() { return t('tools.drawWith.normal'); }, glyph: '' }, // paint over each cell's own character, which shows through
        { value: 'half', get label() { return t('tools.drawWith.halfBlock'); }, glyph: '▀▄' },  // each cell painted becomes a ▄ the paint colors
        inkChoice,
        shadeChoice,
      ],
      drawn: (ws) => inkDrawn(ws.brushDrawWith),
    },
    shadeWayOption('brushDrawWith'),
  ],
  writesChars: ({ workspace, view }) => shades(workspace, 'brushDrawWith', view),
  begin(ctx, pos, event) {
    if (shades(ctx.workspace, 'brushDrawWith', ctx.view) && !beginShade(ctx, event)) return false;
    brush.move(ctx, (event?.shiftKey && ctx.workspace.strokeEnd) || pos, pos);
    return true;
  },
  move({ project, workspace, view }, from, to) {
    // A Shade or Ink only stroke reaches the cells its Size covers, hard: no soft edge to reach further.
    const shading = shades(workspace, 'brushDrawWith', view), inking = inks(workspace, 'brushDrawWith', view);
    const options = shading || inking ? { size: workspace.editBrushSize, flow: 1, hardness: 1 } : { size: workspace.editBrushSize, flow: stampFlow(workspace.editBrushFlow), hardness: workspace.editBrushHardness / 100, pressure: { size: true, flow: true } };
    const clip = selectionClip(workspace);
    const pixels = brushPixels(from, to, options, project.cols, project.rows, project.pixelAspect), clipped = clip ? pixels.filter(({ x, y }) => clip.pixel(x, y)) : pixels;
    if (shading) shade(project, clipped);
    else if (inking) project.inkCells(clipped);
    else project.paintStroke(clipped, undefined, { blockChars: (view === 'output' && workspace.brushDrawWith === 'half') || 'plain', opacity: workspace.editBrushOpacity, stack: workspace.editBrushStack });
    workspace.strokeEnd = { x: to.x, y: to.y }; // without the pen's pressure as it lifted: a Shift-click line has its own
  },
  end({ project }) {
    project.commitEdit();
  },
};

export default brush;
