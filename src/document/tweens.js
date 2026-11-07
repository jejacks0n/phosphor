// Tweens: a shape worked out part way between two of its versions (its key frames), with the timing that eases it.
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { allPoints, apply, isGradient, outlines, withShape } from './shapes.js';
import { snapPoint } from '../lib/vectorSnap.js';
import { ALL_PARTS, PART_FIELDS, partsOf } from './parts.js';
import { isArt, onCells } from './artLayers.js';

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
// fill rule, stacking) is a's until half way, then b's. An art layer's move lands on the nearest whole cell.
export function tweenPart(name, a, b, t, at = pivot(a)) {
  const late = t < 0.5 ? a : b;
  if (name === 'transform') return { m: isArt(a) ? onCells(tweenMatrix(a.m, b.m, t)) : tweenMatrix(a.m, b.m, t, at) };
  if (name === 'outline') {
    const mixed = tweenOutlines(a, b, t);
    return mixed ? { ...mixed, closed: a.closed, rule: late.rule } : fieldsOf(late, name);
  }
  if (name === 'fill' || name === 'stroke') return { [name]: tweenFill(a[name], b[name], t) };
  if (name === 'start' || name === 'end') { // shares, unclamped: where the shape is drawn, an overshoot is clamped
    const rest = name === 'end' ? 1 : 0;
    return { [name]: lerp(a[name] ?? rest, b[name] ?? rest, t) };
  }
  if (name === 'width') return { width: Math.max(0, lerp(a.width, b.width, t)) };
  return fieldsOf(late, name);
}

// Shape a at t = 0 to b at t = 1, every part.
export function tweenShape(a, b, t) {
  const at = pivot(a);
  return withShape(t < 0.5 ? a : b, Object.assign({}, ...partsOf(a).map((name) => tweenPart(name, a, b, t, at))));
}

// Spans: a shape's key frames are the frames that own it (have its key in their changes). A tween runs from one key
// frame to the shape's next, across Blank frames that don't change it; a Wipe or Duplicate between, or the shape erased
// at the far end, ends it. Each part (parts.js) tweens from a key frame that sets it to the next that does, eased as
// that first one says: frame.tweens, shape key to a Map of part to easing (a part not in it holds).
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

// Each part's key frames in a shape's life, part to the frames that set it, in order: the parts it has (partsOf).
export function keyFramesOf(frames, key, life) {
  const sets = life.map((k) => setPartsAt(frames, key, k, life));
  return new Map(partsOf(frames[life[0]].changes.get(key).cell).map((name) => [name, life.filter((_, j) => sets[j].has(name))]));
}

// Each part's tween around frame i in a shape's life, part to { a, b, easing }: a the last key frame at or before i
// that sets it, b the next (undefined on its last), easing a's for it (null: it holds).
function partTweens(frames, key, life, i, keyed = keyFramesOf(frames, key, life)) {
  return new Map([...keyed].map(([name, keys]) => {
    let after = 0; // the first key after i, found by halves
    for (let most = keys.length; after < most;) {
      const mid = (after + most) >> 1;
      if (keys[mid] <= i) after = mid + 1;
      else most = mid;
    }
    const a = keys[after - 1];
    return [name, { a, b: keys[after], easing: frames[a].tweens?.get(key)?.get(name) ?? null }];
  }));
}

// A tweened transform m of a shape tweening from `from`, moved so its middle has gone whole steps of motion.
function snappedMove(from, m, motion) {
  const [px, py] = pivot(from), was = apply(from.m, px, py), now = apply(m, px, py);
  const step = snapPoint({ x: now.x - was.x, y: now.y - was.y }, motion);
  return [m[0], m[1], m[2], m[3], m[4] + step.x - (now.x - was.x), m[5] + step.y - (now.y - was.y)];
}

// What frame i shows of a shape, part by part (parts.js), or null for none: each part from its key a (partTweens)
// fading to its next as a's easing has it, the move snapped as the Transform's key's motion says (an art layer's is
// always on whole cells, tweenPart's, whatever the motion). With nothing fading, the key frame's own. life and keyed:
// the life around frame i and its key frames (keyFramesOf), when they're known already, so frame after frame of one
// life doesn't walk it each time.
// ponytail: each call walks the shape's life; per-shape lives worked out once per movie if huge movies lag.
export function shapeAt(frames, key, i, life = lifeAt(frames, key, i), keyed = undefined) {
  if (!life.length) return null;
  const stored = (k) => frames[k].changes.get(key).cell, at = life.findLast((k) => k <= i), fields = {};
  let own = true, transformAt = at;
  for (const [name, { a, b, easing }] of partTweens(frames, key, life, i, keyed)) {
    const t = easing && b !== undefined && a !== i ? ease(easing, (i - a) / (b - a)) : 0;
    if (a !== at || t) own = false;
    Object.assign(fields, t ? tweenPart(name, stored(a), stored(b), t) : fieldsOf(stored(a), name));
    if (name !== 'transform') continue;
    const motion = frames[a].motions?.get(key) ?? 'smooth';
    transformAt = a;
    if (t && motion !== 'smooth' && !isArt(stored(a))) fields.m = snappedMove(stored(a), fields.m, motion);
  }
  return own ? stored(at) : withShape(stored(transformAt), fields);
}

const tweenedKeys = (frames) => new Set(frames.flatMap((frame) => [...(frame.tweens?.keys() ?? [])]));
const workedKeys = (frames) => new Set(frames.flatMap((frame) => [...(frame.tweens?.keys() ?? []), ...(frame.parts?.keys() ?? [])]));

// Every shape on frame i that a tween or a key frame setting only some of it works out, key to shape (what frame i
// shows of it over what its key frames hold).
export function workedOutAt(frames, i) {
  const out = new Map();
  for (const key of workedKeys(frames)) {
    const shape = shapeAt(frames, key, i);
    if (shape) out.set(key, shape);
  }
  return out;
}

// Every shape a tween runs across frame i in, key to { shape, parts }: parts maps each part tweening across it (from a
// key before i to one after) to { easing, motion } (motion the Transform's; smooth for the rest).
export function tweenedAt(frames, i) {
  const out = new Map();
  for (const key of tweenedKeys(frames)) {
    const life = lifeAt(frames, key, i), parts = new Map();
    if (!life.length) continue;
    for (const [name, { a, b, easing }] of partTweens(frames, key, life, i)) {
      if (!easing || b === undefined || a === i) continue;
      parts.set(name, { easing, motion: (name === 'transform' && frames[a].motions?.get(key)) || 'smooth' });
    }
    if (parts.size) out.set(key, { shape: shapeAt(frames, key, i), parts });
  }
  return out;
}

// Each eased key of a shape's, [at, part, next] (next: the part's next key frame, undefined on its last, or on a part
// the frame doesn't set), over every life, in frame order. Each life is walked once, from its end.
function easedKeys(frames, key) {
  const out = [], seen = new Set();
  frames.forEach((frame, at) => {
    if (seen.has(at) || !frame.tweens?.get(key) || !ownsShape(frame, key)) return;
    const life = lifeAt(frames, key, at), next = new Map(); // part to the next key frame setting it
    for (let j = life.length - 1; j >= 0; j--) {
      const k = life[j], sets = setPartsAt(frames, key, k, life);
      seen.add(k);
      for (const part of frames[k].tweens?.get(key)?.keys() ?? []) out.push([k, part, sets.has(part) ? next.get(part) : undefined]);
      for (const part of sets) next.set(part, k);
    }
  });
  return out.sort((x, y) => x[0] - y[0]); // stable: a frame's parts stay in order
}

// Where a shape tweens, in order: the stretches, { from, to }, where any of its parts does, those that overlap merged.
export function tweenBands(frames, key) {
  const bands = [];
  for (const [from, , to] of easedKeys(frames, key).filter(([, , next]) => next !== undefined).sort((x, y) => x[0] - y[0] || x[2] - y[2])) {
    const last = bands.at(-1);
    if (last && from < last.to) last.to = Math.max(last.to, to);
    else bands.push({ from, to });
  }
  return bands;
}

// The easings a shape's key frames keep that no tween uses, { at, part }: on a part's last key in its life, or on a
// part the frame doesn't set. What's stored never has any.
export const strayEasings = (frames, key) => easedKeys(frames, key).filter(([, , next]) => next === undefined).map(([at, part]) => ({ at, part }));

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
