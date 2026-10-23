import { squarePixels } from '@/lib/Brushes';
import { cellsOfPixels } from '@/lib/Cells';

// In the ANSI view, Layer aware (on by default) peels one layer per pass: a stroke removes a cell's
// paint, and only a cell with no paint is released back to the image (cells whose paint this stroke
// erased aren't then released by the same stroke). Off, one pass clears both back to the image.
let paintErased = new Set();
const keyOf = ({ col, row }) => `${col},${row}`;

const eraser = {
  id: 'eraser',
  title: 'Eraser',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M210.5 480L333.5 480L398.8 414.7L225.3 241.2L98.6 367.9L210.6 479.9zM256 544L210.5 544C193.5 544 177.2 537.3 165.2 525.3L49 409C38.1 398.1 32 383.4 32 368C32 352.6 38.1 337.9 49 327L295 81C305.9 70.1 320.6 64 336 64C351.4 64 366.1 70.1 377 81L559 263C569.9 273.9 576 288.6 576 304C576 319.4 569.9 334.1 559 345L424 480L544 480C561.7 480 576 494.3 576 512C576 529.7 561.7 544 544 544L256 544z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  preview: { shape: 'square', size: (workspace) => workspace.editEraserSize },
  options: [
    { key: 'editEraserSize', label: 'Size', title: 'Eraser size', min: 1, max: 20, step: 1 },
    { key: 'eraseLayerAware', label: 'Layer aware', type: 'checkbox', views: ['output'], title: 'Erase one layer per pass: paint first, then the cells under it' },
  ],
  begin(ctx, pos) {
    paintErased = new Set();
    eraser.move(ctx, pos, pos);
    return true;
  },
  move({ project, workspace, view }, from, to) {
    if (!project.renderer.outputCanvas) return;
    const pixels = squarePixels(from, to, workspace.editEraserSize, project.cols, project.rows);
    if (view !== 'output') {
      project.eraseEditPixels(pixels);
      return;
    }
    const cells = cellsOfPixels(pixels, project.cols, project.rows);
    if (workspace.eraseLayerAware) cells.filter(cell => project.cellHasPaint(cell.col, cell.row)).forEach(cell => paintErased.add(keyOf(cell)));
    project.eraseEditPixels(pixels);
    project.releaseCells(cells.filter(cell => !paintErased.has(keyOf(cell))));
  },
  end({ project }) {
    paintErased = new Set();
    project.commitEdit();
  },
};

export default eraser;
