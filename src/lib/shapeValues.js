// The numbers the Keys panel shows for a shape's Transform, and what typing one does. X and Y are the middle of the
// shape's box in grid pixels, Turn is in degrees, and Scale is a width and a height in percent along the shape's own
// axes (so a turned shape stretches along itself). Shear isn't shown, and an edit keeps it.
import { apply, curveBounds, localBounds, multiply, rotation, scaling, transformed, translation, withShape } from '../document/shapes.js';

const round = (v, places = 0) => Math.round(v * 10 ** places) / 10 ** places;
const middleOf = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

// Turn in radians, and the two scales taken apart the way a tween does (Scale Y is negative when flipped).
function parts([a, b, c, d]) {
  const sx = Math.hypot(a, b);
  return { angle: Math.atan2(b, a), sx, sy: sx ? (a * d - b * c) / sx : 0 };
}

export function transformValues(shape) {
  const [x, y] = middleOf(curveBounds(shape)), { angle, sx, sy } = parts(shape.m);
  return { x: round(x, 1), y: round(y, 1), turn: (round((angle * 180) / Math.PI) + 360) % 360, scaleX: round(sx * 100), scaleY: round(sy * 100) };
}

// The shape with one value typed in (name: x, y, turn, scaleX or scaleY), or the shape itself when it can't be: a
// scale of 0 would flatten it for good, and Scale X is no flip (that's Scale Y's, with a turn).
export function withTransformValue(shape, name, value) {
  if (!Number.isFinite(value)) return shape;
  const { angle, sx, sy } = parts(shape.m);
  // The pivots are the middle of the shape's own box, which a turn or a stretch along its axes leaves where it is.
  const [cx, cy] = middleOf(localBounds(shape)), at = apply(shape.m, cx, cy);
  if (name === 'x' || name === 'y') {
    const [mx, my] = middleOf(curveBounds(shape));
    return transformed(shape, name === 'x' ? translation(value - mx, 0) : translation(0, value - my));
  }
  if (name === 'turn') return transformed(shape, rotation((value * Math.PI) / 180 - angle, at.x, at.y));
  const now = name === 'scaleX' ? sx : sy;
  if (!value || !now || (name === 'scaleX' && value < 0)) return shape;
  const r = value / 100 / now;
  return withShape(shape, { m: multiply(shape.m, name === 'scaleX' ? scaling(r, 1, cx, cy) : scaling(1, r, cx, cy)) });
}
