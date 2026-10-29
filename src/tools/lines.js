// The Pencil's Single and Double lines (ANSI view): drag from cell to cell to draw box-drawing lines.
// Each cell the drag passes through gets the piece its path needs (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), turning
// corners and joining itself where it crosses back. With Connect it also joins the lines it crosses
// or lands on, and those whose ends point into it, as Shapes' Connect does; without, it draws over them.
// A line that ends on another joins it (a T), rather than running through it.
import { cellSteps } from '@/lib/Brushes';
import { armsOf, inwardArms, pieceOf } from '@/lib/BoxJoin';
import { charRowsOf, showsChar } from '@/lib/Cells';
import { selectionClip } from '@/lib/selectionClip';

const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left: the order of a piece's arms
const keyOf = ({ col, row }) => `${col},${row}`;

// The stroke: where the drag is (a cell), each cell's arms from it, and the arms each showed before it.
let stroke = null;
// Where the last stroke ended: its cell, the piece it left there and that piece's arms before its lone
// arm ran on (pieceOf), so a stroke that starts there (Shift-click) turns rather than tees.
let lastEnd = null;

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

// The arms of the box piece a cell shows (none when it shows something else).
const armsAt = (project, { col, row }) => armsOf(shownAt(project, col, row)) ?? [0, 0, 0, 0];

// Write the stroke's pieces in these cells, in the colors you're typing with.
function draw(project, workspace, cells) {
  const attrs = workspace.typingAttrs();
  const clip = selectionClip(workspace);
  const written = [];
  for (const { col, row } of cells) {
    // The stroke's arms here, and with Connect the piece that was under it and the arms pointing in
    // from its neighbors; each axis keeps the stroke's weight where it has one. A lone arm (a line's
    // end with nothing to join) runs on straight (pieceOf).
    const own = stroke.arms.get(keyOf({ col, row }));
    let arms = own;
    if (workspace.pencilConnect) {
      const under = stroke.under.get(keyOf({ col, row }));
      const inward = inwardArms(STEPS.map(([dc, dr]) => shownAt(project, col + dc, row + dr)));
      const v = own[0] || own[2], h = own[1] || own[3];
      arms = own.map((w, d) => w || ((under[d] || inward[d]) && ((d % 2 ? h : v) || under[d] || inward[d])));
    }
    const char = pieceOf(arms);
    if (char && (!clip || clip.cell(col, row))) written.push({ col, row, attrs: { char, ...attrs } });
    if (col === stroke.at.col && row === stroke.at.row) stroke.end = { char, arms };
  }
  project.writeEditCells(written, { clearPaint: true });
}

// begin, then move for each step of the drag, then end (the Pencil commits the edit).
export default {
  begin({ project }, pos) {
    const cell = cellOf(project, pos), key = keyOf(cell);
    const continues = lastEnd?.key === key && lastEnd.char === shownAt(project, cell.col, cell.row);
    stroke = { at: cell, arms: new Map([[key, [0, 0, 0, 0]]]), under: new Map([[key, continues ? lastEnd.arms : armsAt(project, cell)]]) };
  },
  move({ project, workspace }, from, to) {
    if (!stroke) return;
    const weight = workspace.pencilDrawWith === 'double' ? 2 : 1;
    const touched = new Map();
    let at = stroke.at;
    for (const step of cellSteps(at, cellOf(project, to))) {
      const d = STEPS.findIndex(([dc, dr]) => step.col - at.col === dc && step.row - at.row === dr);
      const key = keyOf(step);
      if (!stroke.arms.has(key)) {
        stroke.arms.set(key, [0, 0, 0, 0]);
        stroke.under.set(key, armsAt(project, step));
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
  end() {
    if (stroke?.end) lastEnd = { key: keyOf(stroke.at), ...stroke.end };
    stroke = null;
  },
};
