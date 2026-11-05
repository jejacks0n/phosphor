// Tweens: a shape worked out part way between two of its versions (its key frames), with the timing that eases it.
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { isGradient, outlines, withShape } from './shapes.js';

export const EASINGS = Object.freeze(['linear', 'easeIn', 'easeOut', 'easeInOut']);

// How far along a tween is at t (0..1 of its frames), as its easing has it: cubic, speeding up, slowing down, or both.
export function ease(easing, t) {
  if (easing === 'easeIn') return t ** 3;
  if (easing === 'easeOut') return 1 - (1 - t) ** 3;
  if (easing === 'easeInOut') return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;

// A transform taken apart into move, turn, scale and shear, each part way, and put back: so a turn turns (the short way
// round) instead of shrinking through nothing.
function tweenMatrix(m0, m1, t) {
  const parts = (m) => {
    const [a, b, c, d, e, f] = m, sx = Math.hypot(a, b);
    return sx ? { e, f, angle: Math.atan2(b, a), sx, sy: (a * d - b * c) / sx, k: (a * c + b * d) / sx } : null;
  };
  const p = parts(m0), q = parts(m1);
  if (!p || !q) return m0.map((v, i) => lerp(v, m1[i], t));
  let turn = q.angle - p.angle;
  turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
  const angle = p.angle + turn * t, sx = lerp(p.sx, q.sx, t), sy = lerp(p.sy, q.sy, t), k = lerp(p.k, q.k, t);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [sx * cos, sx * sin, k * cos - sy * sin, k * sin + sy * cos, lerp(p.e, q.e, t), lerp(p.f, q.f, t)];
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

// Shape a at t = 0 to b at t = 1 (t already eased). What can't be part way (the outlines' structure, a solid color
// against a gradient, the cap, join, alignment, fill rule, stacking) is a's until half way, then b's.
export function tweenShape(a, b, t) {
  const base = t < 0.5 ? a : b;
  return withShape(base, {
    ...tweenOutlines(a, b, t),
    m: tweenMatrix(a.m, b.m, t),
    fill: tweenFill(a.fill, b.fill, t),
    stroke: tweenFill(a.stroke, b.stroke, t),
    width: lerp(a.width, b.width, t),
  });
}
