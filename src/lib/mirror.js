// Mirror mode: what's drawn on one side of the rulers' zero is drawn again on the other. The mark of a
// stroke is { axes, clip }: where it folds (x across, y down or null) and what the selection allows.
import { cellWidth } from '@/lib/CharWidth';
import { turnChar } from '@/lib/TurnChars';
import { isPaintBlock } from '@/document/editCells';
import { selectionClip } from '@/lib/selectionClip';
import { charRowsOf } from '@/lib/Cells';

// Rulers at 0 fold the middle of the drawing across; down is only on when the zero is moved down.
export const mirrorAxes = (zero, cols) => ({ x: zero.x === 0 ? cols / 2 : zero.x, y: zero.y === 0 ? null : zero.y });

export const mirrorOps = (axes) => (axes.y === null ? [['h']] : [['h'], ['v'], ['h', 'v']]);

// Axis a in cells: a unit at u (cell column or row) lands on 2a - 1 - u; a pixel row is half a cell, so 4a - 1 - y.
const across = (axes, op, v) => (op.includes('h') ? 2 * axes.x - 1 - v : v);
const down = (axes, op, v) => (op.includes('v') ? 4 * axes.y - 1 - v : v);

export function mirrorPixels(pixels, { axes, clip }, cols, rows) {
  // A spot the original or an earlier copy lays is taken; one this copy lays again isn't (a Brush move's dabs add up).
  const taken = new Set(pixels.map((p) => `${p.x},${p.y}`));
  return mirrorOps(axes).map((op) => {
    const out = [], laid = [];
    for (const p of pixels) {
      const x = across(axes, op, p.x);
      const y = down(axes, op, p.y);
      const key = `${x},${y}`;
      if (x < 0 || x >= cols || y < 0 || y >= rows * 2 || taken.has(key) || clip?.pixel(x, y) === false) continue;
      laid.push(key);
      out.push({ ...p, x, y });
    }
    for (const key of laid) taken.add(key);
    return out;
  });
}

export function mirrorCells(cells, { axes, clip }, cols, rows, font = null) {
  const span = (c) => (cellWidth(c.attrs?.char ?? '') === 2 ? 2 : 1);
  const taken = new Set(cells.flatMap((c) => (span(c) === 2 ? [`${c.col},${c.row}`, `${c.col + 1},${c.row}`] : [`${c.col},${c.row}`])));
  return mirrorOps(axes).map((op) => {
    const out = [];
    for (const c of cells) {
      const char = c.attrs?.char;
      const wide = op.includes('h') && span(c) === 2;
      const col = across(axes, op, c.col) - (wide ? 1 : 0);
      const row = op.includes('v') ? 2 * axes.y - 1 - c.row : c.row;
      const last = col + (span(c) === 2 ? 1 : 0);
      if (col < 0 || last >= cols || row < 0 || row >= rows) continue;
      const keys = last > col ? [`${col},${row}`, `${last},${row}`] : [`${col},${row}`];
      if (keys.some((k) => taken.has(k)) || clip?.cell(col, row) === false) continue;
      keys.forEach((k) => taken.add(k));
      const turned = char && !isPaintBlock(c.attrs) ? op.reduce((ch, o) => turnChar(ch, o, font), char) : char;
      out.push({ ...c, col, row, ...(char && { attrs: { ...c.attrs, char: turned } }) });
    }
    return out;
  });
}

// A continuous grid point to the center of the pixel its mirror lands on; a coordinate the ops don't flip stays.
export const mirrorPoint = (p, ops, axes) => ({
  x: ops.includes('h') ? across(axes, ops, Math.floor(p.x)) + 0.5 : p.x,
  y: ops.includes('v') ? down(axes, ops, Math.floor(p.y)) + 0.5 : p.y,
});

// Where the axes draw, in CSS px from the art's left and top (a cell row is two grid pixels).
export const axisLines = (axes, unit) => [
  { axis: 'x', at: axes.x * unit.x },
  ...(axes.y === null ? [] : [{ axis: 'y', at: 2 * axes.y * unit.y }]),
];

export const strokeMirror = (workspace, project, tool) =>
  workspace.mirror && tool.mirrors
    ? { axes: mirrorAxes(workspace.rulerZero, project.cols), clip: selectionClip(workspace) }
    : null;

export function withMirror(project, mark, fn) {
  const before = project._mirror;
  project._mirror = mark;
  try {
    return fn();
  } finally {
    project._mirror = before;
  }
}

// Runs step for the items and, under a mark, for each mirrored copy; the copies' own writes add nothing.
export function eachSide(project, items, step, kind = 'pixels') {
  const mark = project._mirror;
  if (!mark || project._mirroring) return step(items);
  const rows = charRowsOf(project.rows); // the store's rows are grid pixels
  const copies = kind === 'cells'
    ? mirrorCells(items, mark, project.cols, rows, project.drawingFont)
    : mirrorPixels(items, mark, project.cols, rows);
  project._mirroring = true; // the original's own nested writes stay plain too
  try {
    step(items);
    for (const copy of copies) if (copy.length) step(copy);
  } finally {
    project._mirroring = false;
  }
}
