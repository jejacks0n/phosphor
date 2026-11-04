/**
 * The vector layer's shapes, as data. A shape is a path of points with cubic Bézier handles, a fill and a
 * stroke, kept as shapes until it's baked or merged (docs/vector.md). Nothing here touches a canvas.
 *
 * Shape = { z, closed, points, fill, stroke, width, m }, frozen:
 *   points  [[x, y, inX, inY, outX, outY, smooth], ...] in the shape's own (local) grid pixels; a handle is an
 *           offset from its point, 0, 0 for none; smooth (1 or 0): its handles stay in line when one moves
 *   fill, stroke  '#rrggbb' or null (none)
 *   width   the stroke's width in grid pixels (it doesn't scale with the shape)
 *   m       [a, b, c, d, e, f]: local to grid pixels, x' = a x + c y + e, y' = b x + d y + f
 *   z       stacking order, low first (ties go by key)
 * Grid pixels are a column wide and half a line tall. Numbers are rounded as they're written (points to
 * 1/100, m to 1/10000), so a trip through JSON gives back exactly the same shape, and every browser draws it
 * the same. A shape's key is 'v:' and its id: where a document travels (changes, the ledger, frames, rooms)
 * a shape is a cell under that key, and the store keeps them in their own map.
 */

export const SHAPE_PREFIX = 'v:';
export const MOST_SHAPES = 1000; // a frame's, from a file, a project or a room
export const MOST_POINTS = 500;  // a shape's: the biggest still fits in one room message
const MOST_COORD = 20000;
const MOST_WIDTH = 64;
const MOST_Z = 1e6;
const MOST_M = 1e4;       // a transform's stretch
const MOST_SHIFT = 1e7;   // and its move: turned or grown about a point far down the grid, a shape moves further than any point is
const KEY = /^v:[A-Za-z0-9_-]{1,32}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const FIELDS = ['z', 'closed', 'points', 'fill', 'stroke', 'width', 'm'];
const KAPPA = 0.5523; // a cubic's handle length for a quarter circle, as a share of its radius

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export const isShapeKey = (key) => typeof key === 'string' && key.startsWith(SHAPE_PREFIX);
export const isShape = (value) => !!value && Array.isArray(value.points);
export const sameShape = (a, b) => a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

export function newShapeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return SHAPE_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const round = (v, places) => {
  const f = 10 ** places, r = Math.round(v * f) / f;
  return r === 0 ? 0 : r; // no -0: it reads back as 0
};

export function makeShape({ points, closed, fill = null, stroke = null, width = 1, m = IDENTITY, z = 0 }) {
  return Object.freeze({
    z,
    closed: !!closed,
    points: Object.freeze(points.map((p) => Object.freeze(p.slice(0, 6).map((v) => round(v, 2)).concat(p[6] ? 1 : 0)))),
    fill,
    stroke,
    width: round(width, 2),
    m: Object.freeze(m.map((v) => round(v, 4))),
  });
}

export const withShape = (shape, changes) => makeShape({ ...shape, ...changes });

// The style a new shape gets (workspace.vectorStyle), its colors as it takes them: 'fg' is the foreground color
// now (none: no color).
export function styleColors({ vectorStyle: style, editFgColor, editFgNone }) {
  const color = (c) => (c === 'fg' ? (editFgNone ? null : editFgColor) : c);
  return { fill: color(style.fill), stroke: color(style.stroke), width: style.width };
}

// Matrices, [a, b, c, d, e, f] as canvas has them.
export const multiply = ([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) => [
  a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
];
export function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
export const apply = ([a, b, c, d, e, f], x, y) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
export const translation = (dx, dy) => [1, 0, 0, 1, dx, dy];
// About (ax, ay).
export const scaling = (sx, sy, ax = 0, ay = 0) => [sx, 0, 0, sy, ax - sx * ax, ay - sy * ay];
export function rotation(angle, cx = 0, cy = 0) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

// The shape moved by w, after its own transform.
export const transformed = (shape, w) => withShape(shape, { m: multiply(w, shape.m) });

// Each point in grid pixels, its handles absolute (null for none).
export function worldPoints({ points, m }) {
  return points.map(([x, y, ix, iy, ox, oy]) => ({
    ...apply(m, x, y),
    in: ix || iy ? apply(m, x + ix, y + iy) : null,
    out: ox || oy ? apply(m, x + ox, y + oy) : null,
  }));
}

const num = (v) => String(round(v, 4));

// SVG path data in grid pixels times (sx, sy): Path2D takes it. A segment with no handles is a line.
export function pathData(shape, sx = 1, sy = 1) {
  const w = worldPoints(shape), xy = ({ x, y }) => `${num(x * sx)} ${num(y * sy)}`;
  if (!w.length) return '';
  let d = `M${xy(w[0])}`;
  const segment = (a, b) => (a.out || b.in ? `C${xy(a.out ?? a)} ${xy(b.in ?? b)} ${xy(b)}` : `L${xy(b)}`);
  for (let i = 1; i < w.length; i++) d += segment(w[i - 1], w[i]);
  if (shape.closed && w.length > 1) {
    const last = w.at(-1), first = w[0];
    if (last.out || first.in) d += segment(last, first);
    d += 'Z';
  }
  return d;
}

// [[key, shape]] in stacking order, bottom first: by z, ties by key.
export const stacked = (shapes) => [...shapes].sort(([ka, a], [kb, b]) => a.z - b.z || (ka < kb ? -1 : ka > kb ? 1 : 0));

// Where a cubic from p0 to p3 (handles p1, p2), along one axis, turns: its t in (0, 1).
function turns(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  return [(-b + Math.sqrt(d)) / (2 * a), (-b - Math.sqrt(d)) / (2 * a)];
}

// The box round a path itself, not its handles (a curve's handles reach past it): { x0, y0, x1, y1 } of points
// as worldPoints gives them.
function pathBox(w, closed) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  const curve = (a, b) => {
    if (!a.out && !b.in) return;
    const c1 = a.out ?? a, c2 = b.in ?? b;
    for (const t of [...turns(a.x, c1.x, c2.x, b.x), ...turns(a.y, c1.y, c2.y, b.y)]) {
      if (!(t > 0 && t < 1)) continue;
      const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
      take(k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x, k0 * a.y + k1 * c1.y + k2 * c2.y + k3 * b.y);
    }
  };
  for (const p of w) take(p.x, p.y);
  for (let i = 1; i < w.length; i++) curve(w[i - 1], w[i]);
  if (closed && w.length > 1) curve(w.at(-1), w[0]);
  return { x0, y0, x1, y1 };
}

// The box round a shape in its own (local) grid pixels, and in grid pixels (square to the grid): the selection's.
export const localBounds = ({ points, closed }) => pathBox(worldPoints({ points, m: IDENTITY }), closed);
export const curveBounds = (shape) => pathBox(worldPoints(shape), shape.closed);

// Grid pixels the shape can draw in: its points' and handles' hull (a cubic stays inside it), with half the
// stroke around it.
export function shapeBounds(shape) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of worldPoints(shape)) {
    for (const q of [p, p.in, p.out]) {
      if (!q) continue;
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
  }
  const pad = shape.stroke ? shape.width / 2 : 0;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

// The whole cells (grid pixels, an even y and h) over bounds, with a grid pixel around them for the edge's
// antialiasing.
export function dirtyRect(...bounds) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of bounds) {
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  if (x0 === Infinity) return null;
  x0 = Math.floor(x0 - 1); x1 = Math.ceil(x1 + 1);
  y0 = 2 * Math.floor(Math.floor(y0 - 1) / 2); y1 = 2 * Math.ceil(Math.ceil(y1 + 1) / 2);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// What a shape's made with: its fill, stroke and width.
const styleOf = ({ fill = null, stroke = null, width = 1 } = {}) => ({ fill, stroke, width });
const corner = (x, y) => [x, y, 0, 0, 0, 0, 0];

export const rectShape = (x0, y0, x1, y1, style) => makeShape({
  points: [corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1)], closed: true, ...styleOf(style),
});

// Four smooth points, top, right, bottom, left, each a quarter circle's handles long.
export function ellipseShape(x0, y0, x1, y1, style) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = KAPPA * (x1 - x0) / 2, hy = KAPPA * (y1 - y0) / 2;
  return makeShape({
    points: [[cx, y0, -hx, 0, hx, 0, 1], [x1, cy, 0, -hy, 0, hy, 1], [cx, y1, hx, 0, -hx, 0, 1], [x0, cy, 0, hy, 0, -hy, 1]],
    closed: true,
    ...styleOf(style),
  });
}

// A polygon inscribed in the box, its first corner at the top.
export function polygonShape(x0, y0, x1, y1, sides, style) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const points = Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / sides;
    return corner(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  });
  return makeShape({ points, closed: true, ...styleOf(style) });
}

// Segment i's four control points, local.
function controls(points, i) {
  const a = points[i], b = points[(i + 1) % points.length];
  return [[a[0], a[1]], [a[0] + a[4], a[1] + a[5]], [b[0] + b[2], b[1] + b[3]], [b[0], b[1]]];
}
const at = (c, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u ** 3 * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t ** 3 * c[3][k]);
};
const segmentCount = ({ points, closed }) => (closed ? points.length : points.length - 1);

// The outline's nearest place to (x, y) (grid pixels): { segment, t, distance }, distance in grid pixels.
export function nearestOnOutline(shape, x, y) {
  const best = { segment: -1, t: 0, distance: Infinity };
  const distAt = (c, t) => {
    const [px, py] = at(c, t), w = apply(shape.m, px, py);
    return Math.hypot(w.x - x, w.y - y);
  };
  for (let i = 0; i < segmentCount(shape); i++) {
    const c = controls(shape.points, i);
    let t0 = 0, d0 = Infinity;
    for (let k = 0; k <= 32; k++) {
      const d = distAt(c, k / 32);
      if (d < d0) { d0 = d; t0 = k / 32; }
    }
    for (let step = 1 / 64; step > 1e-4; step /= 2) { // refine around the best sample
      for (const t of [t0 - step, t0 + step]) {
        if (t < 0 || t > 1) continue;
        const d = distAt(c, t);
        if (d < d0) { d0 = d; t0 = t; }
      }
    }
    if (d0 < best.distance) Object.assign(best, { segment: i, t: t0, distance: d0 });
  }
  return best;
}

// A point added on segment i at t, the curve where it was (de Casteljau).
export function splitAt(shape, i, t) {
  const pts = shape.points.map((p) => p.slice()), c = controls(pts, i);
  const lerp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const p01 = lerp(c[0], c[1]), p12 = lerp(c[1], c[2]), p23 = lerp(c[2], c[3]);
  const p012 = lerp(p01, p12), p123 = lerp(p12, p23), mid = lerp(p012, p123);
  const a = pts[i], b = pts[(i + 1) % pts.length], curved = a[4] || a[5] || b[2] || b[3];
  if (curved) {
    a[4] = p01[0] - a[0]; a[5] = p01[1] - a[1];
    b[2] = p23[0] - b[0]; b[3] = p23[1] - b[1];
  }
  const added = curved ? [mid[0], mid[1], p012[0] - mid[0], p012[1] - mid[1], p123[0] - mid[0], p123[1] - mid[1], 1] : corner(mid[0], mid[1]);
  pts.splice(i + 1, 0, added);
  return withShape(shape, { points: pts });
}

// Point i moved by (dx, dy), local, its handles with it.
export function movePoint(shape, i, dx, dy) {
  const pts = shape.points.map((p) => p.slice());
  pts[i][0] += dx;
  pts[i][1] += dy;
  return withShape(shape, { points: pts });
}

// Point i's handle ('in' or 'out') to (x, y), local. A smooth point's other handle turns to stay in line, at
// its own length; alone (Alt), it stays where it is and the point's handles are free of each other from then on.
export function moveHandle(shape, i, which, x, y, { alone = false } = {}) {
  const pts = shape.points.map((p) => p.slice()), p = pts[i];
  if (alone) p[6] = 0;
  const [own, other] = which === 'in' ? [2, 4] : [4, 2];
  p[own] = x - p[0];
  p[own + 1] = y - p[1];
  const length = Math.hypot(p[other], p[other + 1]), toward = Math.hypot(p[own], p[own + 1]);
  if (p[6] && length && toward) {
    p[other] = (-p[own] / toward) * length;
    p[other + 1] = (-p[own + 1] / toward) * length;
  }
  return withShape(shape, { points: pts });
}

// Point i made smooth (its handles in line, along its neighbors; a third of the way to each when it has
// none) or a sharp corner (no handles: the edges either side of it run straight in).
export function setSmooth(shape, i, smooth) {
  const pts = shape.points.map((p) => p.slice()), p = pts[i];
  p[6] = smooth ? 1 : 0;
  if (!smooth) p.fill(0, 2, 6);
  if (smooth) {
    const n = pts.length, prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
    const hasPrev = shape.closed || i > 0, hasNext = shape.closed || i < n - 1;
    let dx = (hasNext ? next[0] : p[0]) - (hasPrev ? prev[0] : p[0]), dy = (hasNext ? next[1] : p[1]) - (hasPrev ? prev[1] : p[1]);
    if (p[4] || p[5]) [dx, dy] = [p[4] - p[2], p[5] - p[3]];
    const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const inLength = Math.hypot(p[2], p[3]) || (hasPrev ? Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 3 : 0);
    const outLength = Math.hypot(p[4], p[5]) || (hasNext ? Math.hypot(next[0] - p[0], next[1] - p[1]) / 3 : 0);
    [p[2], p[3], p[4], p[5]] = [-ux * inLength, -uy * inLength, ux * outLength, uy * outLength];
  }
  return withShape(shape, { points: pts });
}

// Null when fewer than two points would be left.
export function deletePoint(shape, i) {
  if (shape.points.length <= 2) return null;
  return withShape(shape, { points: shape.points.filter((_, at) => at !== i) });
}

// A shape from a file, a project or another browser, or null when it's anything a shape can't be.
const finite = (v, most) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= most;
export function shapeFromStranger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== FIELDS.length || !FIELDS.every((f) => f in value)) return null;
  const { z, closed, points, fill, stroke, width, m } = value;
  if (!Number.isInteger(z) || Math.abs(z) > MOST_Z || typeof closed !== 'boolean') return null;
  if (!(fill === null || (typeof fill === 'string' && HEX.test(fill))) || !(stroke === null || (typeof stroke === 'string' && HEX.test(stroke)))) return null;
  if (!finite(width, MOST_WIDTH) || width < 0) return null;
  if (!Array.isArray(m) || m.length !== 6 || !m.every((v, i) => finite(v, i < 4 ? MOST_M : MOST_SHIFT)) || Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-6) return null;
  if (!Array.isArray(points) || !points.length || points.length > MOST_POINTS) return null;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 7 || !p.slice(0, 6).every((v) => finite(v, MOST_COORD)) || (p[6] !== 0 && p[6] !== 1)) return null;
  }
  return makeShape({ z, closed, points, fill, stroke, width, m });
}

export const isGoodShapeKey = (key) => typeof key === 'string' && KEY.test(key);

export const serializeShapes = (map) => [...map];

// A Map from a file's [key, shape] pairs; empty for none, null when any is bad or there are too many.
export function deserializeShapes(pairs) {
  if (pairs === undefined) return new Map();
  if (!Array.isArray(pairs) || pairs.length > MOST_SHAPES) return null;
  const map = new Map();
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || !isGoodShapeKey(pair[0])) return null;
    const shape = shapeFromStranger(pair[1]);
    if (!shape) return null;
    map.set(pair[0], shape);
  }
  return map;
}
