// Tweens: a shape worked out part way between two of its versions (its key frames), with the timing that eases it.
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { allPoints, isGradient, outlines, withShape } from './shapes.js';

export const EASINGS = Object.freeze(['linear', 'easeIn', 'easeOut', 'easeInOut']);

// How far along a tween is at t (0..1 of its frames), as its easing has it: cubic, speeding up, slowing down, or both.
export function ease(easing, t) {
  if (easing === 'easeIn') return t ** 3;
  if (easing === 'easeOut') return 1 - (1 - t) ** 3;
  if (easing === 'easeInOut') return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;

// A transform taken apart into turn, scale and shear, each part way, and put back: so a turn turns (the short way
// round) instead of shrinking through nothing. The pivot (in the shape's own coordinates) moves in a straight line, so
// a shape turned about it turns in place.
function tweenMatrix(m0, m1, t, [px, py] = [0, 0]) {
  const parts = (m) => {
    const [a, b, c, d, e, f] = m, sx = Math.hypot(a, b);
    return sx ? { e, f, angle: Math.atan2(b, a), sx, sy: (a * d - b * c) / sx, k: (a * c + b * d) / sx } : null;
  };
  const p = parts(m0), q = parts(m1);
  if (!p || !q) return m0.map((v, i) => lerp(v, m1[i], t));
  let turn = q.angle - p.angle;
  turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
  const angle = p.angle + turn * t, sx = lerp(p.sx, q.sx, t), sy = lerp(p.sy, q.sy, t), k = lerp(p.k, q.k, t);
  const cos = Math.cos(angle), sin = Math.sin(angle), a = sx * cos, b = sx * sin, c = k * cos - sy * sin, d = k * sin + sy * cos;
  const at = (m) => [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]], from = at(m0), to = at(m1);
  return [a, b, c, d, lerp(from[0], to[0], t) - (a * px + c * py), lerp(from[1], to[1], t) - (b * px + d * py)];
}

function tweenColor(a, b, t) {
  const x = hex2rgb(a), y = hex2rgb(b);
  return rgb2hex({ r: lerp(x.r, y.r, t), g: lerp(x.g, y.g, t), b: lerp(x.b, y.b, t) });
}

// A fill or stroke: solid colors mix, gradients of one kind and stop count mix stop by stop; anything else switches.
function tweenFill(a, b, t) {
  if (typeof a === 'string' && typeof b === 'string') return tweenColor(a, b, t);
  if (isGradient(a) && isGradient(b) && a.type === b.type && a.stops.length === b.stops.length) {
    const fa = a.f ?? [0, 0], fb = b.f ?? [0, 0];
    return {
      type: a.type,
      stops: a.stops.map(([o, c], i) => [lerp(o, b.stops[i][0], t), tweenColor(c, b.stops[i][1], t)]),
      m: a.m.map((v, i) => lerp(v, b.m[i], t)),
      f: [lerp(fa[0], fb[0], t), lerp(fa[1], fb[1], t)],
    };
  }
  return t < 0.5 ? a : b;
}

// The outlines part way, when both have the same ones (open or closed, as many points each); else null.
function tweenOutlines(a, b, t) {
  const oa = outlines(a), ob = outlines(b);
  if (oa.length !== ob.length || oa.some((o, i) => o.closed !== ob[i].closed || o.points.length !== ob[i].points.length)) return null;
  const mixed = oa.map((o, i) => o.points.map((p, j) => {
    const q = ob[i].points[j];
    return [...p.slice(0, 6).map((v, n) => lerp(v, q[n], t)), (t < 0.5 ? p : q)[6]];
  }));
  return { points: mixed[0], more: mixed.slice(1).map((points, i) => [oa[i + 1].closed, points]) };
}

// The middle of a shape's points, in its own coordinates.
function pivot(shape) {
  const points = allPoints(shape), xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  return points.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0];
}

// Shape a at t = 0 to b at t = 1 (t already eased). What can't be part way (the outlines' structure, a solid color
// against a gradient, the cap, join, alignment, fill rule, stacking) is a's until half way, then b's.
export function tweenShape(a, b, t) {
  const base = t < 0.5 ? a : b;
  return withShape(base, {
    ...tweenOutlines(a, b, t),
    m: tweenMatrix(a.m, b.m, t, pivot(a)),
    fill: tweenFill(a.fill, b.fill, t),
    stroke: tweenFill(a.stroke, b.stroke, t),
    width: lerp(a.width, b.width, t),
  });
}

// Spans: a shape's key frames are the frames that own it (have its key in their changes). A tween runs from one key
// frame to the shape's next, across Blank frames that don't change it; a Wipe or Duplicate between, or the shape erased
// at the far end, ends it. The easing is kept on the key frame it starts from: frame.tweens, shape key to easing.
const ownsShape = (frame, key) => !!frame.changes.get(key)?.cell;

// The span frame i is in or starts, { from, to, easing } (easing null with no tween on it), or null.
export function spanAt(frames, key, i) {
  let from = i;
  while (!frames[from].changes.has(key)) {
    if (frames[from].kind !== 'blank' || from === 0) return null;
    from--;
  }
  if (!ownsShape(frames[from], key)) return null;
  let to = from + 1;
  for (; to < frames.length && !frames[to].changes.has(key); to++) if (frames[to].kind !== 'blank') return null;
  if (to === frames.length || !ownsShape(frames[to], key)) return null;
  return { from, to, easing: frames[from].tweens?.get(key) ?? null };
}

// A span's shape on frame i, between its key frames.
const between = (frames, key, { from, to, easing }, i) => tweenShape(frames[from].changes.get(key).cell, frames[to].changes.get(key).cell, ease(easing, (i - from) / (to - from)));

// What frame i shows of a shape: its own, the one carried to it, or where a tween puts it; null for none.
export function shapeAt(frames, key, i) {
  let from = i;
  while (!frames[from].changes.has(key)) {
    if (frames[from].kind !== 'blank' || from === 0) return null;
    from--;
  }
  const span = from < i ? spanAt(frames, key, i) : null;
  return span?.easing ? between(frames, key, span, i) : frames[from].changes.get(key).cell ?? null;
}

const tweenedKeys = (frames) => new Set(frames.flatMap((frame) => [...(frame.tweens?.keys() ?? [])]));

// Every shape a tween puts on frame i, key to { shape, easing }: its key frames' shapes mixed as far as the easing says.
export function tweenedAt(frames, i) {
  const out = new Map();
  for (const key of tweenedKeys(frames)) {
    const span = spanAt(frames, key, i);
    if (!span?.easing || span.from === i) continue;
    out.set(key, { shape: between(frames, key, span, i), easing: span.easing });
  }
  return out;
}

// A shape's tweens, in order.
export function tweenBands(frames, key) {
  const bands = [];
  frames.forEach((frame, i) => {
    const span = frame.tweens?.has(key) ? spanAt(frames, key, i) : null;
    if (span?.easing && span.from === i) bands.push(span);
  });
  return bands;
}

// The earliest frame that may look different when frame i changes: the first frame between of a tween i is in or ends.
export function tweenReach(frames, i) {
  let reach = i;
  if (i > 0) {
    for (const key of tweenedKeys(frames)) {
      const span = spanAt(frames, key, i - 1);
      if (span?.easing) reach = Math.min(reach, span.from + 1);
    }
  }
  return reach;
}
