// The Magic Wand's selection on a grid of units (cells in the ANSI view, grid pixels in the pixel
// view): the units that match the one clicked (`same(i)`), the connected ones (sharing a side, as the
// Paint Bucket fills) or, not contiguous, all of them; only units `allowed(i)` accepts, when given
// (one it rejects is neither selected nor crossed). A byte per unit, 1 where selected.
export function selectMatching({ width, height, start, same, contiguous = true, allowed = null }) {
  const mask = new Uint8Array(width * height);
  const ok = (i) => !allowed || allowed(i);
  const first = start.y * width + start.x;
  if (!ok(first)) return mask;
  if (!contiguous) {
    for (let i = 0; i < mask.length; i++) if (ok(i) && same(i)) mask[i] = 1;
    return mask;
  }
  const queue = [first];
  mask[first] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % width, y = (i - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (!mask[n] && ok(n) && same(n)) {
        mask[n] = 1;
        queue.push(n);
      }
    }
  }
  return mask;
}

// The units a mask selects, as { x, y }.
export function unitsOf(mask, width) {
  const units = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) units.push({ x: i % width, y: Math.floor(i / width) });
  return units;
}
