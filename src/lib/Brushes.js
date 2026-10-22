/**
 * Which grid pixels a stroke segment touches, and how strongly. Coordinates are fractional grid
 * pixels; results are clipped to 0 <= x < cols, 0 <= y < rows. Pixel = { x, y, alpha }.
 */

// Points every half grid pixel from `from` to `to`, so fast strokes don't leave gaps.
export function interpolate(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 2);
  if (steps === 0) return [{ x: to.x, y: to.y }];
  const positions = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    positions.push({ x: from.x + t * dx, y: from.y + t * dy });
  }
  return positions;
}

const inGrid = (x, y, cols, rows) => x >= 0 && y >= 0 && x < cols && y < rows;

// Hard 1px line.
export function pencilPixels(from, to, cols, rows) {
  const pixels = new Map();
  for (const { x, y } of interpolate(from, to)) {
    const px = Math.floor(x), py = Math.floor(y);
    if (inGrid(px, py, cols, rows)) pixels.set(`${px},${py}`, { x: px, y: py, alpha: 1 });
  }
  return [...pixels.values()];
}

// Hard square of `size` grid pixels centred on the stroke (the eraser).
export function squarePixels(from, to, size, cols, rows) {
  const half = size / 2;
  const pixels = new Map();
  for (const { x, y } of interpolate(from, to)) {
    for (let iy = Math.floor(y - half); iy < Math.ceil(y + half); iy++) {
      for (let ix = Math.floor(x - half); ix < Math.ceil(x + half); ix++) {
        if (inGrid(ix, iy, cols, rows)) pixels.set(`${ix},${iy}`, { x: ix, y: iy, alpha: 1 });
      }
    }
  }
  return [...pixels.values()];
}

// Soft round brush. flow and hardness are 0..1. Overlapping stamps are kept (they build up paint).
export function brushPixels(from, to, { size, flow, hardness }, cols, rows) {
  const radius = size / 2;
  const pixels = [];
  for (const { x, y } of interpolate(from, to)) {
    for (let iy = Math.floor(y - radius); iy < Math.ceil(y + radius); iy++) {
      for (let ix = Math.floor(x - radius); ix < Math.ceil(x + radius); ix++) {
        if (!inGrid(ix, iy, cols, rows)) continue;

        const dx = ix + 0.5 - x, dy = iy + 0.5 - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;

        // Solid core out to radius * hardness, then a falloff; tiny brushes fall off linearly.
        let alpha = radius > 0.5
          ? (dist <= radius * hardness ? 1 : Math.pow(1 - (dist - radius * hardness) / (radius * (1 - hardness)), 1.5))
          : Math.max(0, 1 - dist / radius);
        alpha *= flow;

        if (alpha <= 0 || (radius > 0.5 && alpha < 0.001)) continue;
        pixels.push({ x: ix, y: iy, alpha });
      }
    }
  }
  return pixels;
}
