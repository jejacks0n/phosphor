// Tweens: a shape worked out part way between two of its versions (its key frames), with the timing that eases it.
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { allPoints, apply, isGradient, outlines, withShape } from './shapes.js';
import { snapPoint } from '../lib/vectorSnap.js';
import { ALL_PARTS, PARTS, PART_FIELDS } from './parts.js';

export const EASINGS = Object.freeze(['linear', 'easeIn', 'easeOut', 'easeInOut', 'elastic']);
// How a movie's tweens move shapes: smoothly, or by half cells or whole cells (as VECTOR's Snap to steps them).
export const MOTIONS = Object.freeze(['smooth', 'half', 'cells']);

// How far along a tween is at t (0..1 of its frames), as its easing has it: cubic, speeding up, slowing down, or both;
// or elastic, springing past the end and back, settling there (so it can be past 1 on the way).
export function ease(easing, t) {
  if (easing === 'elastic') return t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
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
      stops: a.stops.map(([o, c], i) => [Math.min(1, Math.max(0, lerp(o, b.stops[i][0], t))), tweenColor(c, b.stops[i][1], t)]), // past an end, still on the gradient
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

const fieldsOf = (shape, name) => Object.fromEntries(PART_FIELDS[name].map((field) => [field, shape[field]]));

// One part (parts.js) of shape a at t = 0 to b at t = 1 (t already eased), as fields; turned about at (a's middle by
// default). What can't be part way (the outlines' structure, a solid color against a gradient, the stroke's style, the
// fill rule, stacking) is a's until half way, then b's.
export function tweenPart(name, a, b, t, at = pivot(a)) {
  const late = t < 0.5 ? a : b;
  if (name === 'transform') return { m: tweenMatrix(a.m, b.m, t, at) };
  if (name === 'outline') {
    const mixed = tweenOutlines(a, b, t);
    return mixed ? { ...mixed, closed: a.closed, rule: late.rule } : fieldsOf(late, name);
  }
  if (name === 'fill' || name === 'stroke') return { [name]: tweenFill(a[name], b[name], t) };
  if (name === 'width') return { width: Math.max(0, lerp(a.width, b.width, t)) };
  return fieldsOf(late, name);
}

// Shape a at t = 0 to b at t = 1, every part.
export function tweenShape(a, b, t) {
  const at = pivot(a);
  return withShape(t < 0.5 ? a : b, Object.assign({}, ...PARTS.map((name) => tweenPart(name, a, b, t, at))));
}

// Spans: a shape's key frames are the frames that own it (have its key in their changes). A tween runs from one key
// frame to the shape's next, across Blank frames that don't change it; a Wipe or Duplicate between, or the shape erased
// at the far end, ends it. The easing is kept on the key frame it starts from: frame.tweens, shape key to easing.
const ownsShape = (frame, key) => !!frame.changes.get(key)?.cell;

// A shape's life around frame i: its key frames, in order, linked as spans are (only Blank frames that don't have it
// between); [] when frame i shows no such shape. An erase, or a Wipe or Duplicate that doesn't have it, ends a life.
export function lifeAt(frames, key, i) {
  let at = i;
  while (!frames[at].changes.has(key)) {
    if (frames[at].kind !== 'blank' || at === 0) return [];
    at--;
  }
  if (!ownsShape(frames[at], key)) return [];
  const life = [at];
  for (let k = at; frames[k].kind === 'blank' && k > 0;) { // back: a Blank key frame carries from the one before
    let j = k - 1;
    while (j > 0 && !frames[j].changes.has(key) && frames[j].kind === 'blank') j--;
    if (!ownsShape(frames[j], key)) break;
    life.unshift(k = j);
  }
  for (let k = at; ;) { // on
    let j = k + 1;
    while (j < frames.length && !frames[j].changes.has(key) && frames[j].kind === 'blank') j++;
    if (j === frames.length || !ownsShape(frames[j], key)) break;
    life.push(k = j);
  }
  return life;
}

// The parts key frame i (in life) sets of a shape: every part on the life's first, and on a Wipe or Duplicate (they
// don't carry); else what frame.parts says, all of them when it says nothing.
export function setPartsAt(frames, key, i, life = lifeAt(frames, key, i)) {
  if (life[0] === i || frames[i].kind !== 'blank') return ALL_PARTS;
  return frames[i].parts?.get(key) ?? ALL_PARTS;
}

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

// How far along frame i is from key frame a to key frame b (of life), as one clock over the spans between: each span
// with a tween takes its share of the frames, eased as it is; one without takes none (it holds). 0 with none tweened.
function clockAt(frames, key, life, a, b, i) {
  let total = 0, done = 0;
  for (let j = a; j < b; j++) {
    const from = life[j], to = life[j + 1], easing = frames[from].tweens?.get(key);
    if (!easing) continue;
    total += to - from;
    done += (to - from) * (i <= from ? 0 : i >= to ? 1 : ease(easing, (i - from) / (to - from)));
  }
  return total ? done / total : 0;
}

// A tweened transform m of a shape tweening from `from`, moved so its middle has gone whole steps of motion.
function snappedMove(from, m, motion) {
  const [px, py] = pivot(from), was = apply(from.m, px, py), now = apply(m, px, py);
  const step = snapPoint({ x: now.x - was.x, y: now.y - was.y }, motion);
  return [m[0], m[1], m[2], m[3], m[4] + step.x - (now.x - was.x), m[5] + step.y - (now.y - was.y)];
}

// What frame i shows of a shape, part by part (parts.js), or null for none, moved as the movie's motion has it: each part from the last key frame at or
// before i that set it, fading to the next that does, as clockAt has it. With nothing fading, the key frame's own.
// ponytail: each call walks the shape's life; per-shape lives worked out once per movie if huge movies lag.
export function shapeAt(frames, key, i, motion = 'smooth') {
  const life = lifeAt(frames, key, i);
  if (!life.length) return null;
  const stored = (j) => frames[life[j]].changes.get(key).cell;
  const at = life.findLastIndex((k) => k <= i), sets = life.map((k) => setPartsAt(frames, key, k, life));
  const fields = {};
  let own = true, transformAt = at;
  for (const name of PARTS) {
    let a = at, b = at + 1;
    while (!sets[a].has(name)) a--;
    while (b < life.length && !sets[b].has(name)) b++;
    if (name === 'transform') transformAt = a;
    const t = life[a] === i || b === life.length ? 0 : clockAt(frames, key, life, a, b, i);
    if (a !== at || t) own = false;
    Object.assign(fields, t ? tweenPart(name, stored(a), stored(b), t) : fieldsOf(stored(a), name));
    if (name === 'transform' && t && motion !== 'smooth') fields.m = snappedMove(stored(a), fields.m, motion);
  }
  return own ? stored(at) : withShape(stored(transformAt), fields);
}

const tweenedKeys = (frames) => new Set(frames.flatMap((frame) => [...(frame.tweens?.keys() ?? [])]));
const workedKeys = (frames) => new Set(frames.flatMap((frame) => [...(frame.tweens?.keys() ?? []), ...(frame.parts?.keys() ?? [])]));

// Every shape on frame i that a tween or a key frame setting only some of it works out, key to shape (what frame i
// shows of it over what its key frames hold).
export function workedOutAt(frames, i, motion = 'smooth') {
  const out = new Map();
  for (const key of workedKeys(frames)) {
    const shape = shapeAt(frames, key, i, motion);
    if (shape) out.set(key, shape);
  }
  return out;
}

// Every shape a tween puts on frame i, key to { shape, easing }: its key frames' shapes mixed as far as the easing says.
export function tweenedAt(frames, i, motion = 'smooth') {
  const out = new Map();
  for (const key of tweenedKeys(frames)) {
    const span = spanAt(frames, key, i);
    if (!span?.easing || span.from === i) continue;
    out.set(key, { shape: shapeAt(frames, key, i, motion), easing: span.easing });
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

// The earliest frame that may look different when frame i changes: a part can fade to frame i from as far back as
// the first key frame of its shape's life, when that life has a tween or a key frame setting only some of it.
export function tweenReach(frames, i) {
  let reach = i;
  if (i > 0) {
    for (const key of workedKeys(frames)) {
      const life = lifeAt(frames, key, i - 1);
      const worked = life.some((k, j) => (j < life.length - 1 && frames[k].tweens?.has(key)) || setPartsAt(frames, key, k, life) !== ALL_PARTS);
      if (worked) reach = Math.min(reach, life[0] + 1);
    }
  }
  return reach;
}
