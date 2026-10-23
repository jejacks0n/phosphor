import { squarePixels } from '@/lib/Brushes';
import { cellsOfPixels } from '@/lib/Cells';
import { BLANK } from '@/document/cellEdits';

// In the ANSI view the eraser takes a cell down through its layers: paint, then the authored cell,
// then (with Image layer on) the image, which leaves a blank cell. Layer aware (on by default) peels
// one layer per pass: each stroke removes only a cell's top layer, so the next pass shows what was
// under it. Off, one pass goes all the way down (to the image, or to blank with Image layer).
let peeled = new Set(); // cells this stroke has already taken a layer off
const keyOf = ({ col, row }) => `${col},${row}`;
const isBlank = (entry) => !!entry && entry.char === BLANK.char && entry.fg === BLANK.fg && entry.bg === BLANK.bg;

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
    { key: 'eraseImage', label: 'Image layer', type: 'checkbox', views: ['output'], title: 'Erase the image too, leaving blank cells' },
  ],
  begin(ctx, pos) {
    peeled = new Set();
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
    const blank = (list) => project.editCells(list.filter(c => !isBlank(project.cellEditAt(c.col, c.row))).map(c => ({ ...c, attrs: BLANK })));
    if (!workspace.eraseLayerAware) {
      project.eraseEditPixels(pixels);
      if (workspace.eraseImage) blank(cells);
      else project.releaseCells(cells);
      return;
    }
    // Each cell loses only its top layer this stroke: paint, else its authored entry, else the image.
    const fresh = cells.filter(c => !peeled.has(keyOf(c)));
    const painted = fresh.filter(c => project.cellHasPaint(c.col, c.row));
    const rest = fresh.filter(c => !painted.includes(c));
    const authored = rest.filter(c => project.cellEditAt(c.col, c.row) && !(workspace.eraseImage && isBlank(project.cellEditAt(c.col, c.row))));
    const image = workspace.eraseImage ? rest.filter(c => !project.cellEditAt(c.col, c.row)) : [];
    project.eraseEditPixels(pixels);
    project.releaseCells(authored);
    if (image.length) blank(image);
    [...painted, ...authored, ...image].forEach(c => peeled.add(keyOf(c)));
  },
  end({ project }) {
    peeled = new Set();
    project.commitEdit();
  },
};

export default eraser;
