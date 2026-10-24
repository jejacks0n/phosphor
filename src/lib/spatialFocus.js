// Arrow-key focus by position, for a panel of controls that isn't one regular grid (the color box:
// swatch grids, the None swatch, the recent colors). From `from` (a DOMRect-like { left, top,
// width, height }), the index in `rects` of the nearest control in the arrow's direction, weighing
// distance off the line twice as much, so the same row (or column) wins; -1 when there's none.
const DIRECTIONS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function nearestInDirection(from, rects, key) {
  const dir = DIRECTIONS[key];
  if (!dir) return -1;
  const c0 = center(from);
  let best = -1, bestScore = Infinity;
  rects.forEach((rect, i) => {
    const c = center(rect), dx = c.x - c0.x, dy = c.y - c0.y;
    const along = dx * dir[0] + dy * dir[1];          // how far in the arrow's direction
    const off = Math.abs(dx * dir[1] - dy * dir[0]);  // how far off its line
    if (along <= 0.5) return;
    const score = along + 2 * off;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
