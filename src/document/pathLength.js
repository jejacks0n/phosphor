/**
 * Measuring a shape's outline along its curves, for drawing a line on and for shapes following a path. Nothing
 * here touches a canvas.
 *
 * measure(shape) gives { length, at(share), cut(from, to), shareOf(segment, t) }, kept per record:
 *   length  the outlines' lengths added, the first then each of more's, a closed outline's closing side included,
 *           in grid pixels (through shape.m)
 *   at      { x, y, angle } at a share of the length (0 to 1, clamped), in grid pixels; angle (radians) is the
 *           direction of travel
 *   cut     the stretch between two shares as open outlines, one for each outline it runs through, in the shape's
 *           own coordinates and points (shapes.js); [] when there is no stretch
 *   shareOf the share at segment's t, segment numbered as nearestOnOutline numbers it
 * With no length (an art layer, a lone point) at gives the first point, or the record's translation, with angle 0.
 */

import { apply, controls, outlines } from './shapes.js';

const STEPS = 32; // each cubic's table; plenty for a fraction of a grid pixel

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// A cubic's control points (four [x, y]) split at t (de Casteljau): [the part before, the part after].
function split(c, t) {
  const [ab, bc, cd] = [lerp(c[0], c[1], t), lerp(c[1], c[2], t), lerp(c[2], c[3], t)];
  const [abc, bcd] = [lerp(ab, bc, t), lerp(bc, cd, t)];
  const mid = lerp(abc, bcd, t);
  return [[c[0], ab, abc, mid], [mid, bcd, cd, c[3]]];
}
const pointAt = (c, t) => split(c, t)[0][3];

// The cubic's part from t0 to t1; a straight one (no handles) stays straight.
function between(c, t0, t1, straight) {
  if (straight) return [lerp(c[0], c[3], t0), lerp(c[0], c[3], t0), lerp(c[0], c[3], t1), lerp(c[0], c[3], t1)];
  const rest = t0 > 0 ? split(c, t0)[1] : c;
  return t1 >= 1 ? rest : split(rest, (t1 - t0) / (1 - t0))[0];
}

// Points in shapes.js's format for a chain of cubics, each starting where the one before ended.
function chain(curves) {
  const points = [[curves[0][0][0], curves[0][0][1], 0, 0, 0, 0, 0]];
  for (const c of curves) {
    const last = points.at(-1);
    last[4] = c[1][0] - c[0][0]; last[5] = c[1][1] - c[0][1];
    points.push([c[3][0], c[3][1], c[2][0] - c[3][0], c[2][1] - c[3][1], 0, 0, 0]);
  }
  return points;
}

// Every segment of the shape: its flat index, its outline, whether it's straight (no handles), its cubic local and in
// grid pixels, a table of the length reached at each step, and where it starts along the shape.
function segmentsOf(shape) {
  const out = [];
  let start = 0, total = 0;
  outlines(shape).forEach(({ closed, points }, o) => {
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const local = controls(points, i);
      const straight = same(local[0], local[1]) && same(local[2], local[3]);
      const world = local.map(([x, y]) => { const w = apply(shape.m, x, y); return [w.x, w.y]; });
      if (straight) { world[1] = lerp(world[0], world[3], 1 / 3); world[2] = lerp(world[0], world[3], 2 / 3); } // t runs evenly along it
      const table = [0];
      let prev = world[0];
      for (let k = 1; k <= STEPS; k++) {
        const p = pointAt(world, k / STEPS);
        table.push(table[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
        prev = p;
      }
      out.push({ index: start + i, outline: o, local, straight, world, table, from: total, length: table[STEPS] });
      total += table[STEPS];
    }
    start += points.length;
  });
  return { segments: out, length: total };
}

// Where a distance along the shape falls: its segment and t. Where two segments meet, it's the first's end, or with
// `onward` the second's start.
function find(segments, d, onward = false) {
  let seg = null;
  for (const s of segments) {
    if (!s.length) continue;
    seg = s;
    if (onward ? d < s.from + s.length : d <= s.from + s.length) break;
  }
  const local = Math.min(Math.max(d - seg.from, 0), seg.length);
  let k = 1;
  while (k < STEPS && seg.table[k] < local) k++;
  const span = seg.table[k] - seg.table[k - 1];
  return { seg, k, t: (k - 1 + (span ? (local - seg.table[k - 1]) / span : 0)) / STEPS };
}

function build(shape) {
  const { segments, length } = segmentsOf(shape);
  const first = outlines(shape).find((o) => o.points.length)?.points[0];
  const home = first ? apply(shape.m, first[0], first[1]) : { x: shape.m[4], y: shape.m[5] };
  const clamp = (share) => Math.min(Math.max(share, 0), 1);

  const at = (share) => {
    if (!length) return { x: home.x, y: home.y, angle: 0 };
    const { seg, k, t } = find(segments, clamp(share) * length), c = seg.world, u = 1 - t;
    const [x, y] = pointAt(c, t);
    let dx = 3 * (u * u * (c[1][0] - c[0][0]) + 2 * u * t * (c[2][0] - c[1][0]) + t * t * (c[3][0] - c[2][0]));
    let dy = 3 * (u * u * (c[1][1] - c[0][1]) + 2 * u * t * (c[2][1] - c[1][1]) + t * t * (c[3][1] - c[2][1]));
    if (Math.hypot(dx, dy) < 1e-9) { // a handle on its point: the way the table's step went
      const a = pointAt(c, (k - 1) / STEPS), b = pointAt(c, k / STEPS);
      dx = b[0] - a[0]; dy = b[1] - a[1];
    }
    return { x, y, angle: Math.atan2(dy, dx) };
  };

  const cut = (from, to) => {
    from = clamp(from); to = clamp(to);
    if (!length || !(to > from)) return [];
    const a = find(segments, from * length, true), b = find(segments, to * length);
    const runs = []; // [outline, [cubics]]
    for (const s of segments) {
      if (!s.length || s.index < a.seg.index || s.index > b.seg.index) continue;
      const curve = between(s.local, s === a.seg ? a.t : 0, s === b.seg ? b.t : 1, s.straight);
      if (runs.at(-1)?.[0] === s.outline) runs.at(-1)[1].push(curve);
      else runs.push([s.outline, [curve]]);
    }
    return runs.map(([, curves]) => ({ closed: false, points: chain(curves) }));
  };

  const shareOf = (segment, t) => {
    const s = segments.find((x) => x.index === segment);
    if (!s || !length) return 0;
    t = Math.min(Math.max(t, 0), 1);
    if (s.straight) return (s.from + s.length * t * t * (3 - 2 * t)) / length; // nearestOnOutline's t on a cubic with no handles
    const f = t * STEPS, k = Math.min(Math.floor(f), STEPS - 1);
    return (s.from + s.table[k] + (s.table[k + 1] - s.table[k]) * (f - k)) / length;
  };

  return Object.freeze({ length, at, cut, shareOf });
}

const measured = new WeakMap();
export function measure(shape) {
  let out = measured.get(shape);
  if (!out) measured.set(shape, out = build(shape));
  return out;
}
