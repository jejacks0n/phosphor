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
// At 0 it's the cell under it: the character goes too.
export const ghostCell = (cell, baseCell, strength = 0.35) => (strength <= 0 ? baseCell : { ...cell, fg: dim(cell.fg, baseCell.fg, strength), bg: dim(cell.bg, baseCell.bg, strength) });

// cells with those isGhost(i) says ghosted over baseOf(i), or the same array when none are: each cell itself, or
// ghostOf(i) (another frame's) in its place. memo: a WeakMap that keeps a ghost the same object from one call to the
// next, so what draws them redraws only what changed; it goes with the strength.
export function ghostedCells(cells, baseOf, isGhost, memo = new WeakMap(), strength = 0.35, ghostOf = (i) => cells[i]) {
  let out = null;
  for (let i = 0; i < cells.length; i++) {
    if (!isGhost(i)) continue;
    const base = baseOf(i);
    if (!base) continue;
    const cell = ghostOf(i);
    let ghost = memo.get(cell);
    if (!ghost) memo.set(cell, ghost = ghostCell(cell, base, strength));
    out ??= cells.slice();
    out[i] = ghost;
  }
  return out ?? cells;
}

// The PIXEL view's ghost: what's under each ghost cell (indexes) on both its halves, opaque enough that drawing it over
// the art leaves the same mix ghostCell makes. veil and base are RGBA, a pixel a grid pixel, cols wide.
export function veilPixels(veil, base, indexes, cols, strength = 0.35) {
  const alpha = Math.round(255 * (1 - strength));
  const put = (x, y) => {
    const at = 4 * (y * cols + x);
    veil[at] = base[at];
    veil[at + 1] = base[at + 1];
    veil[at + 2] = base[at + 2];
    veil[at + 3] = alpha;
  };
  for (const i of indexes) {
    const col = i % cols, row = (i - col) / cols;
    put(col, 2 * row);
    put(col, 2 * row + 1);
  }
}
