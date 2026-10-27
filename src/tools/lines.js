// Lines (ANSI view): drag from cell to cell to draw box-drawing lines. Each cell the drag passes
// through gets the piece its path needs (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), in Single or Double, turning
// corners and joining itself where it crosses back. With Connect it also joins the lines it crosses
// or lands on, and those whose ends point into it, as Shapes' Connect does; without, it draws over them.
// A line that ends on another joins it (a T), rather than running through it.
import { cellSteps } from '@/lib/Brushes';
import { armsOf, inwardArms, pieceOf } from '@/lib/BoxJoin';
import { charRowsOf, showsChar } from '@/lib/Cells';

const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left: the order of a piece's arms
const keyOf = ({ col, row }) => `${col},${row}`;

// The stroke: where the drag is (a cell), each cell's arms from it, and what each showed before it.
let stroke = null;

// The cell under a grid position, held to the grid.
const cellOf = (project, { x, y }) => ({
  col: Math.max(0, Math.min(project.cols - 1, Math.floor(x))),
  row: Math.max(0, Math.min(charRowsOf(project.rows) - 1, Math.floor(y / 2))),
});

// The character a cell shows (none when it's off the grid, or hidden under paint).
function shownAt(project, col, row) {
  if (col < 0 || row < 0 || col >= project.cols || row >= charRowsOf(project.rows)) return undefined;
  const cell = project.cells[row * project.cols + col];
  return cell && showsChar(cell) ? cell.char : undefined;
}

// Write the stroke's pieces in these cells, in the colors you're typing with.
function draw(project, workspace, cells) {
  const attrs = workspace.typingAttrs();
  const written = [];
  for (const { col, row } of cells) {
    // The stroke's arms here, and with Connect the piece that was under it and the arms pointing in
    // from its neighbors; each axis keeps the stroke's weight where it has one. A lone arm (a line's
    // end with nothing to join) runs on straight (pieceOf).
    const own = stroke.arms.get(keyOf({ col, row }));
    let arms = own;
    if (workspace.lineConnect) {
      const under = armsOf(stroke.under.get(keyOf({ col, row }))) ?? [0, 0, 0, 0];
      const inward = inwardArms(STEPS.map(([dc, dr]) => shownAt(project, col + dc, row + dr)));
      const v = own[0] || own[2], h = own[1] || own[3];
      arms = own.map((w, d) => w || ((under[d] || inward[d]) && ((d % 2 ? h : v) || under[d] || inward[d])));
    }
    const char = pieceOf(arms);
    if (char) written.push({ col, row, attrs: { char, ...attrs } });
  }
  project.writeEditCells(written, { clearPaint: true });
}

const lines = {
  id: 'lines',
  title: 'Lines (box drawing)',
  keys: ['L'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M64 128H448V576H384V192H64Z"/><path d="M224 352H576V416H224Z"/></svg>`,
  views: ['output'],
  kind: 'paint',
  section: 'cell',
  altPicks: true,
  autoScroll: true,
  preview: { shape: 'cell' },
  options: [
    {
      key: 'lineStyle', label: 'Line', type: 'segmented',
      choices: [{ value: 'single', label: '─ Single' }, { value: 'double', label: '═ Double' }],
    },
    { key: 'lineConnect', label: 'Connect', type: 'checkbox', title: 'Join the lines it crosses or lands on' },
  ],
  begin({ project }, pos) {
    const cell = cellOf(project, pos), key = keyOf(cell);
    stroke = { at: cell, arms: new Map([[key, [0, 0, 0, 0]]]), under: new Map([[key, shownAt(project, cell.col, cell.row)]]) };
    return true;
  },
  move({ project, workspace }, from, to) {
    if (!stroke) return;
    const weight = workspace.lineStyle === 'double' ? 2 : 1;
    const touched = new Map();
    let at = stroke.at;
    for (const step of cellSteps(at, cellOf(project, to))) {
      const d = STEPS.findIndex(([dc, dr]) => step.col - at.col === dc && step.row - at.row === dr);
      const key = keyOf(step);
      if (!stroke.arms.has(key)) {
        stroke.arms.set(key, [0, 0, 0, 0]);
        stroke.under.set(key, shownAt(project, step.col, step.row));
      }
      stroke.arms.get(keyOf(at))[d] = weight;
      stroke.arms.get(key)[(d + 2) % 4] = weight;
      touched.set(keyOf(at), at);
      touched.set(key, step);
      at = step;
    }
    stroke.at = at;
    if (touched.size) draw(project, workspace, [...touched.values()]);
  },
  end({ project }) {
    stroke = null;
    project.commitEdit();
  },
};

export default lines;
