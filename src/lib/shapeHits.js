// Which shape is under a point, and how near a point is to one's outline: through Path2D on one 2D context
// kept for it (the shapes' paths in grid pixels; tolerances in grid pixels).
import { pathData, stacked } from '@/document/shapes.js';

let context = null;
const ctx = () => (context ??= document.createElement('canvas').getContext('2d'));

// On its fill, or within tol of its outline (or of its stroke's edge).
export function hitsShape(shape, x, y, tol) {
  const c = ctx(), path = new Path2D(pathData(shape));
  if (shape.fill && c.isPointInPath(path, x, y)) return true;
  c.lineWidth = (shape.stroke ? shape.width : 0) + 2 * tol;
  return c.isPointInStroke(path, x, y);
}

// The key of the topmost shape at (x, y), or null.
export function shapeAt(shapes, x, y, tol) {
  const order = stacked(shapes);
  for (let i = order.length - 1; i >= 0; i--) if (hitsShape(order[i][1], x, y, tol)) return order[i][0];
  return null;
}

// Whether (x, y) is within tol of the outline alone (its stroke left out): where a point can go on it.
export function nearOutline(shape, x, y, tol) {
  const c = ctx();
  c.lineWidth = 2 * tol;
  return c.isPointInStroke(new Path2D(pathData(shape)), x, y);
}
