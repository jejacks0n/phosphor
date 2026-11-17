import { squarePixels, squareCells } from '@/lib/Brushes';
import { cellsOfPixels } from '@/lib/Cells';
import { withLeads } from '@/document/wideChars';
import { isPaintBlock } from '@/document/editCells';
import { selectionClip } from '@/lib/selectionClip';
import { t } from '@/i18n/index.js';

// The eraser erases the picked layer: a cells layer's paint and edit cells; the base, black with a pinned space in
// the ANSI view (eraseBase), black pixels in the Pixel view (eraseBasePixels), as the edit layer's writers route there.
// Each view has its own size: the ANSI view's in whole cells (editEraserCells), the Pixel view's in grid pixels.
const sizeIn = (workspace, view) => (view === 'output' ? workspace.editEraserCells : workspace.editEraserSize);

const eraser = {
  id: 'eraser',
  get title() { return t('tools.eraser.title'); },
  keys: ['E'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M210.5 480L333.5 480L398.8 414.7L225.3 241.2L98.6 367.9L210.6 479.9zM256 544L210.5 544C193.5 544 177.2 537.3 165.2 525.3L49 409C38.1 398.1 32 383.4 32 368C32 352.6 38.1 337.9 49 327L295 81C305.9 70.1 320.6 64 336 64C351.4 64 366.1 70.1 377 81L559 263C569.9 273.9 576 288.6 576 304C576 319.4 569.9 334.1 559 345L424 480L544 480C561.7 480 576 494.3 576 512C576 529.7 561.7 544 544 544L256 544z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  preview: { shape: 'square', size: sizeIn, snap: true },
  options: [
    { key: 'editEraserSize', size: true, get label() { return t('tools.eraser.sizePixels'); }, get title() { return t('tools.eraser.sizePixelsTitle'); }, min: 1, max: 20, step: 1, views: ['input'] },
    { key: 'editEraserCells', size: true, get label() { return t('tools.eraser.sizeCells'); }, get title() { return t('tools.eraser.sizeCellsTitle'); }, min: 1, max: 20, step: 1, views: ['output'] },
  ],
  begin(ctx, pos) {
    eraser.move(ctx, pos, pos);
    return true;
  },
  move({ project, workspace, view }, from, to) {
    if (!project.renderer.outputCanvas) return;
    // A selection keeps it to the cells or pixels inside.
    const clip = selectionClip(workspace), size = sizeIn(workspace, view);
    // The ANSI view erases whole cells (size 1 is one character, and a wide character's trail takes
    // its lead with it); the pixel view, exact pixels.
    const square = view === 'output' ? null : squarePixels(from, to, size, project.cols, project.rows).filter(({ x, y }) => !clip || clip.pixel(x, y));
    const cells = view === 'output'
      ? withLeads(project.cells, project.cols, squareCells(from, to, size, project.cols, project.rows)).filter(({ col, row }) => !clip || clip.cell(col, row))
      : cellsOfPixels(square, project.cols, project.rows);
    const pixels = view === 'output' ? cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]) : square;
    // A ▄ with no colors of its own (Half-block: it was there to show the paint) whose last
    // paint this erases goes too, so the cell's own character comes back. The ANSI view clears
    // the edit cells it erases anyway.
    const blocks = view === 'input' ? cells.filter(({ col, row }) => isPaintBlock(project.editCellAt(col, row)) && project.cellHasPaint(col, row)) : [];
    project.eraseEditPixels(pixels);
    if (view === 'output') project.clearEditCells(cells);
    else project.clearEditCells(blocks.filter(({ col, row }) => !project.cellHasPaint(col, row)));
  },
  end({ project }) {
    project.commitEdit();
  },
};

export default eraser;
