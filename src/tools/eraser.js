import { squarePixels } from '@/lib/Brushes';
import { cellsOfPixels } from '@/lib/Cells';
import { withLeads } from '@/document/wideChars';

// The eraser erases the layers chosen with its [Base] [Edit] toggles (workspace.eraseLayers).
// Edit: paint and edit cells. Base: the base layer, black with a pinned space in the ANSI view
// (eraseBase), black pixels in the Pixel view (eraseBasePixels). Every chosen layer is erased at once.

const isPaintBlock = (entry) => entry?.char === '▄' && entry.fg === undefined && entry.bg === undefined;

const eraser = {
  id: 'eraser',
  title: 'Eraser',
  keys: ['E'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M210.5 480L333.5 480L398.8 414.7L225.3 241.2L98.6 367.9L210.6 479.9zM256 544L210.5 544C193.5 544 177.2 537.3 165.2 525.3L49 409C38.1 398.1 32 383.4 32 368C32 352.6 38.1 337.9 49 327L295 81C305.9 70.1 320.6 64 336 64C351.4 64 366.1 70.1 377 81L559 263C569.9 273.9 576 288.6 576 304C576 319.4 569.9 334.1 559 345L424 480L544 480C561.7 480 576 494.3 576 512C576 529.7 561.7 544 544 544L256 544z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  preview: { shape: 'square', size: (workspace) => workspace.editEraserSize, snap: true },
  options: [
    { key: 'editEraserSize', label: 'Size', title: 'Eraser size', min: 1, max: 20, step: 1 },
    { key: 'eraseLayers', label: 'Erase', type: 'layers' },
  ],
  begin(ctx, pos) {
    eraser.move(ctx, pos, pos);
    return true;
  },
  move({ project, workspace, view }, from, to) {
    if (!project.renderer.outputCanvas) return;
    const square = squarePixels(from, to, workspace.editEraserSize, project.cols, project.rows);
    // The ANSI view erases whole cells (size 1 is one character, and a wide character's trail takes
    // its lead with it); the pixel view, exact pixels.
    const under = cellsOfPixels(square, project.cols, project.rows);
    const cells = view === 'output' ? withLeads(project.cells, project.cols, under) : under;
    const pixels = view === 'output' ? cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]) : square;
    const { base, edit } = workspace.eraseLayers;
    if (edit) {
      // A ▄ with no colors of its own (Half-block: it was there to show the paint) whose last
      // paint this erases goes too, so the cell's own character comes back. The ANSI view clears
      // the edit cells it erases anyway.
      const blocks = view === 'input' ? cells.filter(({ col, row }) => isPaintBlock(project.editCellAt(col, row)) && project.cellHasPaint(col, row)) : [];
      project.eraseEditPixels(pixels);
      if (view === 'output') project.clearEditCells(cells);
      else project.clearEditCells(blocks.filter(({ col, row }) => !project.cellHasPaint(col, row)));
    }
    if (base) view === 'output' ? project.eraseBase(cells) : project.eraseBasePixels(square);
  },
  end({ project }) {
    project.commitEdit();
  },
};

export default eraser;
