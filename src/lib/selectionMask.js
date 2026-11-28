// The selection (workspace.selection): { c0, r0, c1, r1, mask? }, the cells it spans (inclusive) and, when it isn't all
// of them, which: mask is { view, width, height, mask } (markRaw'd), a byte a unit over the whole grid, 1 where
// selected, in cells (view 'output') or grid pixels ('input'), as the Magic Wand makes it (wandIn shows it in the other
// view). A rectangle drawn plainly has no mask: every cell of it is selected. The rectangle is what's read where a
// rectangle is meant (where a move starts, a paste lands, a crop cuts); the mask where only the selected cells are
// (copy, cut, delete, moves, the painting tools, the outline). Moves keep to whole cells, as the Select tool always has:
// a cell is in a mask made of grid pixels when either of its pixels is.
import { markRaw } from 'vue';
import { charRowsOf } from '@/lib/Cells';
import { wandIn } from '@/lib/MagicWand';

// A mask as a selection: its bounds in cells, the mask with them; null when nothing's selected.
export function masked(mask) {
  const { view, width } = mask, bits = mask.mask;
  let c0 = Infinity, r0 = Infinity, c1 = -1, r1 = -1;
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    const x = i % width, y = (i - x) / width, row = view === 'input' ? y >> 1 : y;
    if (x < c0) c0 = x;
    if (x > c1) c1 = x;
    if (row < r0) r0 = row;
    if (row > r1) r1 = row;
  }
  return c1 < 0 ? null : { c0, r0, c1, r1, mask: markRaw(mask) };
}

// Whether cell (col, row) is selected.
export function selects(sel, col, row) {
  if (!sel || col < sel.c0 || col > sel.c1 || row < sel.r0 || row > sel.r1) return false;
  const m = sel.mask;
  if (!m) return true;
  if (m.view === 'output') return m.mask[row * m.width + col] === 1;
  return m.mask[2 * row * m.width + col] === 1 || (2 * row + 1 < m.height && m.mask[(2 * row + 1) * m.width + col] === 1);
}

// The selection's cells in its bounds, a byte each, row by row (w x h): null for a plain rectangle (all of them).
export function cellBits(sel) {
  if (!sel?.mask) return null;
  const w = sel.c1 - sel.c0 + 1, h = sel.r1 - sel.r0 + 1, bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bits[y * w + x] = selects(sel, sel.c0 + x, sel.r0 + y) ? 1 : 0;
  return bits;
}

// The selection's cells, as { col, row }.
export function selectedCells(sel) {
  const cells = [];
  for (let row = sel.r0; row <= sel.r1; row++) for (let col = sel.c0; col <= sel.c1; col++) if (selects(sel, col, row)) cells.push({ col, row });
  return cells;
}

// The selection of a block w x h cells landed with its top-left at (col, row) on a cols x rows grid (rows: pixel rows),
// bits its cells (cellBits) or null for all of them: clipped to the grid; null when none of it is on the grid.
export function landedAt(w, h, bits, col, row, cols, rows) {
  const lines = charRowsOf(rows);
  const rect = { c0: Math.max(0, col), r0: Math.max(0, row), c1: Math.min(cols - 1, col + w - 1), r1: Math.min(lines - 1, row + h - 1) };
  if (rect.c0 > rect.c1 || rect.r0 > rect.r1) return null;
  if (!bits) return rect;
  const mask = new Uint8Array(cols * lines);
  for (let y = rect.r0; y <= rect.r1; y++) for (let x = rect.c0; x <= rect.c1; x++) mask[y * cols + x] = bits[(y - row) * w + (x - col)];
  return masked({ view: 'output', width: cols, height: lines, mask });
}

// The selection moved dc columns and dr rows (its outline dragged), a mask in its own units (a row is two grid pixels);
// what leaves the grid goes. Null when none of it is left.
export function shifted(sel, dc, dr) {
  if (!sel.mask) return { c0: sel.c0 + dc, r0: sel.r0 + dr, c1: sel.c1 + dc, r1: sel.r1 + dr };
  const { view, width, height, mask } = sel.mask, dy = view === 'input' ? 2 * dr : dr, out = new Uint8Array(mask.length);
  for (let y = Math.max(0, -dy); y < Math.min(height, height - dy); y++) {
    for (let x = Math.max(0, -dc); x < Math.min(width, width - dc); x++) out[(y + dy) * width + x + dc] = mask[y * width + x];
  }
  return masked({ view, width, height, mask: out });
}

// The selection as a mask in view's units over a cols x rows grid (a rectangle filled in).
export function maskIn(sel, view, cols, rows) {
  if (sel.mask) return wandIn(sel.mask, view, rows);
  const height = view === 'input' ? rows : charRowsOf(rows), mask = new Uint8Array(cols * height), k = view === 'input' ? 2 : 1;
  for (let y = sel.r0 * k; y < Math.min(height, (sel.r1 + 1) * k); y++) mask.fill(1, y * cols + sel.c0, y * cols + sel.c1 + 1);
  return { view, width: cols, height, mask };
}

// A selection and another one put together (Shift adds, Alt subtracts, both keep where they overlap): 'add',
// 'subtract' or 'intersect', before (null: nothing selected) with made. In grid pixels when either is made of them, so
// neither loses a pixel. Null when nothing's left.
export function combine(before, made, op, cols, rows) {
  if (!before) return op === 'add' ? made : null;
  const view = before.mask?.view === 'input' || made.mask?.view === 'input' ? 'input' : 'output';
  const a = maskIn(before, view, cols, rows), b = maskIn(made, view, cols, rows);
  const mask = new Uint8Array(a.mask.length);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = op === 'add' ? a.mask[i] | b.mask[i] : op === 'subtract' ? a.mask[i] & (1 - b.mask[i]) : a.mask[i] & b.mask[i];
  }
  return masked({ view, width: cols, height: a.height, mask });
}

// Two selections alike: the same cells, and the same mask (its view, size and every unit).
export function sameSelection(a, b) {
  if (a === b) return true;
  if (!a || !b || a.c0 !== b.c0 || a.r0 !== b.r0 || a.c1 !== b.c1 || a.r1 !== b.r1) return false;
  const m = a.mask, n = b.mask;
  if (!m || !n) return !m && !n;
  return m === n || (m.view === n.view && m.width === n.width && m.height === n.height && m.mask.length === n.mask.length && m.mask.every((bit, i) => bit === n.mask[i]));
}

// A selection's mask as a view shows it (view: 'output' cells, 'input' grid pixels), moved by the outline's drag while
// there is one (workspace.selectionOffset); null for none or a plain rectangle, which shows as a marquee.
export function maskShown(workspace, project, view) {
  const sel = workspace.selection;
  if (!sel?.mask) return null;
  const { dc, dr } = workspace.selectionOffset ?? { dc: 0, dr: 0 };
  const moved = dc || dr ? shifted(sel, dc, dr) : sel;
  return moved && wandIn(moved.mask, view, project.rows);
}
