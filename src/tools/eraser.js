import { brushPixels, squarePixels, squareCells } from '@/lib/Brushes';
import { stampFlow } from '@/tools/brush';
import { cellsOfPixels } from '@/lib/Cells';
import { withLeads } from '@/document/wideChars';
import { isLaid, isPaintBlock } from '@/document/editCells';
import { selectionClip } from '@/lib/selectionClip';
import { t } from '@/i18n/index.js';

// The eraser erases the picked layer: a cells layer's paint and edit cells; the base, black with a pinned space in
// the ANSI view (eraseBase), black pixels in the Pixel view (eraseBasePixels), as the edit layer's writers route there.
// It's Hard (a square, cleared at once) or Soft: round and feathered as the Brush is, taking paint away a stamp at a time
// by its Flow (on the base, laying black that way). Hard has each view's own size: the ANSI view's in whole cells
// (editEraserCells), which go with their characters, the Pixel view's in grid pixels. Soft is the same in both views, as
// the Brush is: in grid pixels at the Pixel view's size, and on paint alone, so in the ANSI view too a character of
// someone's own stays (the Pixel view's Eraser never took one), but for a laid one (a Shapes line's block), which goes
// whole as a paint block does, and on the base in Monochrome ASCII, which can't show a pin's colors: there the pins go
// (docs/model.md R13).
const soft = (workspace) => workspace.editEraserSoft;
const inPixels = (workspace, view) => view === 'input' || soft(workspace);
const sizeIn = (workspace, view) => (inPixels(workspace, view) ? workspace.editEraserSize : workspace.editEraserCells);
const SOFT_HARDNESS = 0.5; // ponytail: the Brush's starting Hardness, fixed; a Hardness slider of its own if that's ever asked for

const eraser = {
  id: 'eraser',
  get title() { return t('tools.eraser.title'); },
  keys: ['E'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M210.5 480L333.5 480L398.8 414.7L225.3 241.2L98.6 367.9L210.6 479.9zM256 544L210.5 544C193.5 544 177.2 537.3 165.2 525.3L49 409C38.1 398.1 32 383.4 32 368C32 352.6 38.1 337.9 49 327L295 81C305.9 70.1 320.6 64 336 64C351.4 64 366.1 70.1 377 81L559 263C569.9 273.9 576 288.6 576 304C576 319.4 569.9 334.1 559 345L424 480L544 480C561.7 480 576 494.3 576 512C576 529.7 561.7 544 544 544L256 544z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  preview: { shape: 'square', size: sizeIn, snap: true, soft },
  options: [
    { key: 'editEraserSize', size: true, get label() { return t('tools.eraser.sizePixels'); }, get title() { return t('tools.eraser.sizePixelsTitle'); }, min: 1, max: 20, step: 1, when: (workspace) => inPixels(workspace, workspace.editorTab) },
    { key: 'editEraserCells', size: true, get label() { return t('tools.eraser.sizeCells'); }, get title() { return t('tools.eraser.sizeCellsTitle'); }, min: 1, max: 20, step: 1, views: ['output'], when: (workspace) => !soft(workspace) },
    {
      key: 'editEraserSoft', get label() { return t('tools.eraser.edge'); }, type: 'segmented',
      choices: [
        { value: false, get label() { return t('tools.eraser.hard'); } },
        { value: true, get label() { return t('tools.eraser.soft'); } },
      ],
    },
    { key: 'editEraserFlow', get label() { return t('tools.eraser.flow'); }, get title() { return t('tools.eraser.flowTitle'); }, min: 1, max: 100, unit: '%', when: soft },
  ],
  begin(ctx, pos) {
    eraser.move(ctx, pos, pos);
    return true;
  },
  move({ project, workspace, view }, from, to) {
    if (!project.renderer.outputCanvas) return;
    // A selection keeps it to the cells or pixels inside.
    const clip = selectionClip(workspace), size = sizeIn(workspace, view), exact = inPixels(workspace, view);
    // Hard in the ANSI view erases whole cells (size 1 is one character, and a wide character's trail takes its lead
    // with it); the pixel view, and Soft in either, exact pixels: Soft's stamps carry how much each takes (alpha).
    const stamps = !exact ? null : soft(workspace)
      ? brushPixels(from, to, { size, flow: stampFlow(workspace.editEraserFlow), hardness: SOFT_HARDNESS }, project.cols, project.rows, project.pixelAspect)
      : squarePixels(from, to, size, project.cols, project.rows, project.pixelAspect);
    const square = stamps?.filter(({ x, y }) => !clip || clip.pixel(x, y));
    const cells = exact
      ? cellsOfPixels(square, project.cols, project.rows)
      : withLeads(project.cells, project.cols, squareCells(from, to, size, project.cols, project.rows)).filter(({ col, row }) => !clip || clip.cell(col, row));
    const pixels = exact ? square : cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
    // A ▄ with no colors of its own (Half-block: it was there to show the paint) whose last
    // paint this erases goes too, so the cell's own character comes back, and a cell a drawing tool laid goes whole
    // when the eraser reaches either half (docs/model.md R1). Whole cells are cleared anyway.
    const blocks = exact ? cells.filter(({ col, row }) => isPaintBlock(project.editCellAt(col, row)) && project.cellHasPaint(col, row)) : [];
    const laid = exact ? cells.filter(({ col, row }) => isLaid(project.editCellAt(col, row))) : [];
    project.eraseEditPixels(pixels);
    if (!exact) project.clearEditCells(cells);
    else project.clearEditCells([...laid, ...blocks.filter(({ col, row }) => !project.cellHasPaint(col, row))]);
  },
  end({ project }) {
    project.commitEdit();
  },
};

export default eraser;
