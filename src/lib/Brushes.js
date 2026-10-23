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

// --- Shapes. from/to are grid positions in any order; results are whole pixels clipped to the grid.

const bounds = (from, to) => ({
  x0: Math.floor(Math.min(from.x, to.x)), y0: Math.floor(Math.min(from.y, to.y)),
  x1: Math.floor(Math.max(from.x, to.x)), y1: Math.floor(Math.max(from.y, to.y)),
});

export function rectPixels(from, to, filled, cols, rows) {
  const { x0, y0, x1, y1 } = bounds(from, to);
  const pixels = [];
  for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if ((filled || edge) && inGrid(x, y, cols, rows)) pixels.push({ x, y, alpha: 1 });
    }
  }
  return pixels;
}

// The ellipse inscribed in the dragged rect. A pixel is inside when its offset from the centre falls
// within the radii plus half a pixel (so even a 1x1 rect draws); the outline is the inside pixels
// with an outside neighbour.
// With antialias, each pixel's alpha is how much of it the shape covers instead.
export function ellipsePixels(from, to, filled, cols, rows, antialias = false) {
  const { x0, y0, x1, y1 } = bounds(from, to);
  if (antialias) {
    const cover = ellipseCoverage(x0, y0, x1, y1, filled), pixels = [];
    for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
        const alpha = cover(x, y);
        if (alpha > 0) pixels.push({ x, y, alpha });
      }
    }
    return pixels;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 0.5, ry = (y1 - y0) / 2 + 0.5;
  const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const pixels = [];
  for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
      if (!inside(x, y)) continue;
      const outline = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (filled || outline) pixels.push({ x, y, alpha: 1 });
    }
  }
  return pixels;
}

// How much of each unit square (x..x+1, y..y+1) the ellipse filling the inclusive box x0..x1, y0..y1
// covers, from n x n samples. An outline is a ring one unit thick.
export function ellipseCoverage(x0, y0, x1, y1, filled, n = 4) {
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
  const within = (sx, sy, ax, ay) => ax > 0 && ay > 0 && ((sx - cx) / ax) ** 2 + ((sy - cy) / ay) ** 2 <= 1;
  return (x, y) => {
    let hits = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const sx = x + (i + 0.5) / n, sy = y + (j + 0.5) / n;
        if (within(sx, sy, rx, ry) && (filled || !within(sx, sy, rx - 1, ry - 1))) hits++;
      }
    }
    return hits / (n * n);
  };
}

const BOX = {
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
};

// A line-drawn box's outline cells for a cell rect (either corner first), row-major, clipped to the
// grid (cols x rows cells) after the shape is decided, so a box running off the edge keeps its real
// corners. One row is a horizontal run, one column a vertical run (a single cell is horizontal).
export function boxCells(rect, style, cols, rows) {
  const c0 = Math.min(rect.c0, rect.c1), c1 = Math.max(rect.c0, rect.c1);
  const r0 = Math.min(rect.r0, rect.r1), r1 = Math.max(rect.r0, rect.r1);
  const g = BOX[style];
  const cells = [];
  for (let row = Math.max(0, r0); row <= Math.min(rows - 1, r1); row++) {
    for (let col = Math.max(0, c0); col <= Math.min(cols - 1, c1); col++) {
      if (row !== r0 && row !== r1 && col !== c0 && col !== c1) continue;
      let char;
      if (r0 === r1) char = g.h;
      else if (c0 === c1) char = g.v;
      else if (row === r0) char = col === c0 ? g.tl : col === c1 ? g.tr : g.h;
      else if (row === r1) char = col === c0 ? g.bl : col === c1 ? g.br : g.h;
      else char = g.v;
      cells.push({ col, row, char });
    }
  }
  return cells;
}
