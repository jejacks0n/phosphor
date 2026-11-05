// Which shape is under a point, and how near a point is to one's outline: through Path2D on one 2D context
// kept for it (the shapes' paths in grid pixels; tolerances in grid pixels).
import { curveBounds, pathData, sideReach, stacked, strokeAlign, strokeOf, strokeReach, strokeSide } from '@/document/shapes.js';

let context = null;
const ctx = () => (context ??= document.createElement('canvas').getContext('2d'));

// A stroke's side (strokeSide, out to reach) as one Path2D at k canvas pixels a grid pixel, to fill (nonzero).
export function sidePath(shape, side, reach, k = 1) {
  const path = new Path2D();
  for (const [first, ...rest] of strokeSide(shape, side, reach)) {
    path.moveTo(first[0] * k, first[1] * k);
    for (const [x, y] of rest) path.lineTo(x * k, y * k);
    path.closePath();
  }
  return path;
}

// On its fill (under its fill rule: a hole isn't on it), or within tol of its outline (or of its stroke's edge,
// caps and joins as it draws them; a stroke inside or outside the outline, or to a side of it, only there).
export function hitsShape(shape, x, y, tol) {
  const c = ctx(), path = new Path2D(pathData(shape)), { rule, cap, join, miter } = strokeOf(shape);
  if (shape.fill && c.isPointInPath(path, x, y, rule)) return true;
  const align = shape.stroke ? strokeAlign(shape) : 'center';
  if (align !== 'center') {
    Object.assign(c, { lineWidth: 2 * (shape.width + tol), lineCap: cap, lineJoin: join, miterLimit: miter });
    const side = align === 'left' || align === 'right';
    if (c.isPointInStroke(path, x, y) && (side ? c.isPointInPath(sidePath(shape, align, sideReach(shape) + tol), x, y) : c.isPointInPath(path, x, y, rule) === (align === 'inside'))) return true;
  }
  c.lineWidth = (align === 'center' && shape.stroke ? shape.width : 0) + 2 * tol;
  if (shape.stroke) Object.assign(c, { lineCap: cap, lineJoin: join, miterLimit: miter });
  else Object.assign(c, { lineCap: 'round', lineJoin: 'round' });
  return c.isPointInStroke(path, x, y);
}

// The key of the topmost shape at (x, y), or null.
export function shapeAt(shapes, x, y, tol) {
  const order = stacked(shapes);
  for (let i = order.length - 1; i >= 0; i--) if (hitsShape(order[i][1], x, y, tol)) return order[i][0];
  return null;
}

// The keys of the shapes a box (grid pixels) touches, bottom to top: wholly inside it, or its fill or stroke
// found at points sampled over where the two overlap.
// ponytail: about 4000 samples a shape, each grown by half the spacing, so over a big overlap a shape that
// close to the box's edge counts; exact geometry (curves against the box's edges) if that's ever noticed.
export function shapesTouching(shapes, { x0, y0, x1, y1 }) {
  return stacked(shapes).filter(([, shape]) => {
    const b = curveBounds(shape), pad = strokeReach(shape);
    if (b.x0 >= x0 && b.y0 >= y0 && b.x1 <= x1 && b.y1 <= y1) return true;
    const ax = Math.max(x0, b.x0 - pad), ay = Math.max(y0, b.y0 - pad), bx = Math.min(x1, b.x1 + pad), by = Math.min(y1, b.y1 + pad);
    if (ax > bx || ay > by) return false;
    const step = Math.max(0.5, Math.sqrt(((bx - ax) * (by - ay)) / 4000));
    const nx = Math.ceil((bx - ax) / step), ny = Math.ceil((by - ay) / step);
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) if (hitsShape(shape, ax + ((bx - ax) * i) / (nx || 1), ay + ((by - ay) * j) / (ny || 1), step / 2)) return true;
    }
    return false;
  }).map(([key]) => key);
}

// Whether (x, y) is within tol of the outline alone (its stroke left out): where a point can go on it.
export function nearOutline(shape, x, y, tol) {
  const c = ctx();
  Object.assign(c, { lineWidth: 2 * tol, lineCap: 'round', lineJoin: 'round' });
  return c.isPointInStroke(new Path2D(pathData(shape)), x, y);
}
