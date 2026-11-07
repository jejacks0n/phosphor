// The numbers the Keys panel shows for a shape's Transform, and what typing one does. X and Y are the middle of the
// shape's own box (as it is before its transform) carried through the transform, in grid pixels: the point Turn and
// Scale pivot on, so neither moves it. Turn is in degrees, and Scale is a width and a height in percent along the shape's own
// axes (so a turned shape stretches along itself). Shear isn't shown, and an edit keeps it. An art layer has X and Y
// only: its top left corner, which sits on whole cells (X a column, Y an even grid pixel), a typed one rounded there.
import { isArt } from '../document/artLayers.js';
import { apply, localBounds, multiply, rotation, scaling, transformed, translation, withShape } from '../document/shapes.js';

const round = (v, places = 0) => Math.round(v * 10 ** places) / 10 ** places;
const middleOf = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

// Turn in radians, and the two scales taken apart the way a tween does (Scale Y is negative when flipped).
function parts([a, b, c, d]) {
  const sx = Math.hypot(a, b);
  return { angle: Math.atan2(b, a), sx, sy: sx ? (a * d - b * c) / sx : 0 };
}

const pivot = (shape) => (isArt(shape) ? { x: shape.m[4], y: shape.m[5] } : apply(shape.m, ...middleOf(localBounds(shape))));

export function transformValues(shape) {
  if (isArt(shape)) return pivot(shape);
  const { x, y } = pivot(shape), { angle, sx, sy } = parts(shape.m);
  return { x: round(x, 1), y: round(y, 1), turn: (round((angle * 180) / Math.PI) + 360) % 360, scaleX: round(sx * 100), scaleY: round(sy * 100) };
}

// The shape with one value typed in (name: x, y, turn, scaleX or scaleY), or the shape itself when it can't be: a
// scale of 0 would flatten it for good, Scale X is no flip (that's Scale Y's, with a turn), and a value as it already
// reads is no change.
export function withTransformValue(shape, name, value) {
  if (!Number.isFinite(value) || value === transformValues(shape)[name] || (isArt(shape) && name !== 'x' && name !== 'y')) return shape;
  const { angle, sx, sy } = parts(shape.m), at = pivot(shape);
  let next;
  if (name === 'x' || name === 'y') next = transformed(shape, name === 'x' ? translation(value - at.x, 0) : translation(0, value - at.y));
  else if (name === 'turn') next = transformed(shape, rotation((value * Math.PI) / 180 - angle, at.x, at.y));
  else {
    const now = name === 'scaleX' ? sx : sy;
    if (!value || !now || (name === 'scaleX' && value < 0)) return shape;
    const r = value / 100 / now, [cx, cy] = middleOf(localBounds(shape));
    next = withShape(shape, { m: multiply(shape.m, name === 'scaleX' ? scaling(r, 1, cx, cy) : scaling(1, r, cx, cy)) });
  }
  return next.m.every((v, i) => v === shape.m[i]) ? shape : next;
}
