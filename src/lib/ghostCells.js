// The ghost: on a Blank frame, what's inherited from the frames before shows dimmed, keeping its colors, so
// what's drawn on this frame stands out. A drawing aid only: it never plays and is never exported.
import { rgb2hex } from './ColorUtils.js';

const dim = (color, base, strength) => {
  const r = Math.round(base.r + (color.r - base.r) * strength);
  const g = Math.round(base.g + (color.g - base.g) * strength);
  const b = Math.round(base.b + (color.b - base.b) * strength);
  return { r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] };
};

// A cell mixed toward the cell under it, so a ghost over a picture sits on the picture.
export const ghostCell = (cell, baseCell, strength = 0.35) => ({ ...cell, fg: dim(cell.fg, baseCell.fg, strength), bg: dim(cell.bg, baseCell.bg, strength) });

// cells with those isGhost(i) says ghosted over baseOf(i), or the same array when none are. memo: a WeakMap that
// keeps a cell's ghost the same object from one call to the next, so what draws them redraws only what changed.
export function ghostedCells(cells, baseOf, isGhost, memo = new WeakMap()) {
  let out = null;
  for (let i = 0; i < cells.length; i++) {
    if (!isGhost(i)) continue;
    const base = baseOf(i);
    if (!base) continue;
    let ghost = memo.get(cells[i]);
    if (!ghost) memo.set(cells[i], ghost = ghostCell(cells[i], base));
    out ??= cells.slice();
    out[i] = ghost;
  }
  return out ?? cells;
}
