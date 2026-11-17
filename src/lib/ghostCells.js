// The ghost: on a Blank frame, what's inherited from the frames before shows dimmed, keeping its colors, so
// what's drawn on this frame stands out, and so do pictures of nearby frames: those before in their own colors, those
// after in one cool tint, each fainter the further it is. A drawing aid only: it never plays and is never exported.
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

// The most frames the ghost shows on each side.
export const MOST_GHOST_FRAMES = 5;

// The frames after's tint, and how far toward it their colors go: toward the tint as bright as the color (its
// brightest channel), so black stays black and a picture keeps its shape.
const TINT = [60, 200, 255], TINT_SHARE = 0.8;
const tintOf = (r, g, b) => {
  const bright = Math.max(r, g, b) / 255;
  return [r, g, b].map((value, i) => Math.round(value + (TINT[i] * bright - value) * TINT_SHARE));
};
const tintColor = (color) => {
  const [r, g, b] = tintOf(color.r, color.g, color.b);
  return { r, g, b, hex: rgb2hex({ r, g, b }), c: [r, g, b] };
};
export const tinted = (cell) => ({ ...cell, fg: tintColor(cell.fg), bg: tintColor(cell.bg) });

// How much of the ghost's strength the kth of n frames on one side keeps: the nearest all of it, each further one a share less.
export const ghostFade = (k, n) => (n + 1 - k) / n;

// Which picture shows at each grid index: pictures ({ cells, built }), nearest first, each a set of indexes into its
// built frame's cells; the first that has an index wins it, and a wide character's trail goes with its lead.
export function pictureOwners(pictures) {
  const owners = new Map();
  for (const picture of pictures) {
    const built = picture.built.cells;
    for (const i of picture.cells) {
      if (!owners.has(i)) owners.set(i, picture);
      if (built[i + 1]?.wide === 'trail' && !owners.has(i + 1)) owners.set(i + 1, picture);
    }
  }
  return owners;
}

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
// the art leaves the same mix ghostCell makes. veil and base are RGBA, a pixel a grid pixel, cols wide. tint: in the
// frames after's tint, as tinted makes it.
export function veilPixels(veil, base, indexes, cols, strength = 0.35, tint = false) {
  const alpha = Math.round(255 * (1 - strength));
  const put = (x, y) => {
    const at = 4 * (y * cols + x);
    const [r, g, b] = tint ? tintOf(base[at], base[at + 1], base[at + 2]) : [base[at], base[at + 1], base[at + 2]];
    veil[at] = r;
    veil[at + 1] = g;
    veil[at + 2] = b;
    veil[at + 3] = alpha;
  };
  for (const i of indexes) {
    const col = i % cols, row = (i - col) / cols;
    put(col, 2 * row);
    put(col, 2 * row + 1);
  }
}
