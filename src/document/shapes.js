/**
 * The vector layer's shapes, as data. A shape is a path of points with cubic Bézier handles, a fill and a
 * stroke, kept as shapes until it's baked or merged (docs/vector.md). Nothing here touches a canvas.
 *
 * Shape = { z, closed, points, fill, stroke, width, m, more?, rule?, cap?, join?, miter?, align?, start?, end?, follow?, along?, guide? }, frozen:
 *   points  [[x, y, inX, inY, outX, outY, smooth], ...] in the shape's own (local) grid pixels; a handle is an
 *           offset from its point, 0, 0 for none; smooth (1 or 0): its handles stay in line when one moves
 *   closed  whether that outline closes
 *   more    [[closed, points], ...]: the shape's other outlines (holes, a letter's counters), filled together
 *           with the first under rule; absent with one outline
 *   rule    'evenodd'; absent: 'nonzero', SVG's and canvas's default
 *   cap, join, miter  the stroke's: 'butt' | 'square', 'miter' | 'bevel', and the miter limit (1 to 100);
 *           absent: round, round and 4
 *   align   'inside' | 'outside': the stroke inside the outline or outside it, its whole width (a shape with an
 *           open outline strokes centered then: strokeAlign); 'left' | 'right': beside the path, on that side of
 *           the way it was drawn, open or closed (strokeSide); absent: centered on it (SVG's only way)
 *   start, end  the stretch of the outlines that's drawn, as shares of their length, 0 to 1 (to 1/10000); absent:
 *           0 and 1, all of it
 *   follow  { key, ride?, face?, motion? }: the shape (another, a path) this one follows, and how: ride 'start' | 'end'
 *           (absent: along it, on this shape's own keys), face true (turned the way the path runs), motion 'half' | 'cells'
 *           (absent: smoothly); along, how far along that path it is, a share -1 to 2 (absent: 0); guide true: a path
 *           that only guides, never drawn. follow and guide are the same on every frame; along is a part (parts.js)
 * The optional fields are written only when they aren't the default, so a shape that uses none of them is
 * exactly what it was before they existed (an older copy of Phosphor refuses a shape with a field it doesn't
 * know, and with it the whole file's shapes or a room's whole change). A point's index is flat: the first
 * outline's points, then each of more's in turn (locate).
 *   fill, stroke  '#rrggbb' or null (none); either may be a gradient instead:
 *           { type: 'linear' | 'radial', stops: [[offset, '#rrggbb'], ...], m, f? }, in a unit space that m (as a
 *           shape's m) carries into the shape's own: a linear one runs from (0, 0) to (1, 0), a radial one is the
 *           circle at (0, 0) of radius 1, its focal point f (absent: the center). 2 to 16 stops, their offsets
 *           0 to 1 and in order (to 1/1000). It moves, scales and turns with the shape.
 *   width   the stroke's width in grid pixels (it doesn't scale with the shape)
 *   m       [a, b, c, d, e, f]: local to grid pixels, x' = a x + c y + e, y' = b x + d y + f
 *   z       stacking order, low first (ties go by key)
 * An art layer's record is a shape of another kind, { z, m, art } (artLayers.js): hand-drawn cells that only move on
 * whole cells, with no points, fill or stroke; makeShape, withShape, shapeFromStranger and shapeBounds hand it on.
 * Grid pixels are a column wide and half a line tall. Numbers are rounded as they're written (points to
 * 1/100, m to 1/10000), so a trip through JSON gives back exactly the same shape, and every browser draws it
 * the same. A shape's key is 'v:' and its id: where a document travels (changes, the ledger, frames, rooms)
 * a shape is a cell under that key, and the store keeps them in their own map.
 */

import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { SHAPE_KEY, alongShare, artBounds, artFromStranger, goodAlong, goodFollow, isArt, makeArt, makeFollow } from './artLayers.js';
export const SHAPE_PREFIX = 'v:';
export const MOST_SHAPES = 1000; // a frame's, from a file, a project or a room
export const MOST_POINTS = 500;  // a shape's, across its outlines: the biggest still fits in one room message
export const MOST_OUTLINES = 200;
export const STROKE_DEFAULTS = Object.freeze({ rule: 'nonzero', cap: 'round', join: 'round', miter: 4, align: 'center' });
const MOST_COORD = 20000;
const MOST_WIDTH = 64;
const MOST_Z = 1e6;
const MOST_M = 1e4;       // a transform's stretch
const MOST_SHIFT = 1e7;   // and its move: turned or grown about a point far down the grid, a shape moves further than any point is
const HEX = /^#[0-9a-f]{6}$/i;
const FIELDS = ['z', 'closed', 'points', 'fill', 'stroke', 'width', 'm'];
const OPTIONAL = ['more', 'rule', 'cap', 'join', 'miter', 'align', 'start', 'end', 'follow', 'along', 'guide'];
const RULES = ['evenodd'], CAPS = ['butt', 'square'], JOINS = ['miter', 'bevel'], ALIGNS = ['inside', 'outside', 'left', 'right']; // the values other than the default
const GRADIENTS = ['linear', 'radial'];
export const MOST_STOPS = 16;
export const KAPPA = 0.5523; // a cubic's handle length for a quarter circle, as a share of its radius

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export const isShapeKey = (key) => typeof key === 'string' && key.startsWith(SHAPE_PREFIX);
export const isShape = (value) => !!value && (Array.isArray(value.points) || isArt(value));
export const isGradient = (fill) => !!fill && typeof fill === 'object';

// A gradient's color at offset o, its stops mixed.
export function gradientColorAt(stops, o) {
  const after = stops.findIndex(([at]) => at >= o);
  if (after <= 0) return stops[after < 0 ? stops.length - 1 : 0][1];
  const [a, ca] = stops[after - 1], [b, cb] = stops[after], k = b > a ? (o - a) / (b - a) : 0;
  const x = hex2rgb(ca), y = hex2rgb(cb);
  return rgb2hex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k });
}

// The same gradient sampled finer: its stops, with more between them (each gap its share, by length), MOST_STOPS in all.
export function finerStops(stops) {
  const span = stops.at(-1)[0] - stops[0][0], extra = MOST_STOPS - stops.length, out = [];
  stops.forEach((stop, i) => {
    out.push(stop);
    const next = stops[i + 1], n = next && span > 0 ? Math.floor((extra * (next[0] - stop[0])) / span) : 0;
    for (let k = 1; k <= n; k++) {
      const o = stop[0] + ((next[0] - stop[0]) * k) / (n + 1);
      out.push([o, gradientColorAt(stops, o)]);
    }
  });
  return out;
}
export const sameShape = (a, b) => a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

export function newShapeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return SHAPE_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const round = (v, places) => {
  const f = 10 ** places, r = Math.round(v * f) / f;
  return r === 0 ? 0 : r; // no -0: it reads back as 0
};

// A gradient (a fill's or a stroke's) frozen, its numbers rounded, its keys in one order (so JSON compares), f left out at the center.
function roundFill(fill) {
  if (!isGradient(fill)) return fill;
  const out = {
    type: fill.type,
    stops: Object.freeze(fill.stops.map(([o, c]) => Object.freeze([round(o, 3), c]))),
    m: Object.freeze(fill.m.map((v) => round(v, 4))),
  };
  if (fill.f && (round(fill.f[0], 4) || round(fill.f[1], 4))) out.f = Object.freeze(fill.f.map((v) => round(v, 4)));
  return Object.freeze(out);
}

const share = (v) => round(Math.min(Math.max(v, 0), 1), 4); // a tween's overshoot is held to the stretch there is

const roundPoints = (points) => Object.freeze(points.map((p) => Object.freeze(p.slice(0, 6).map((v) => round(v, 2)).concat(p[6] ? 1 : 0))));

export function makeShape({ points, closed, fill = null, stroke = null, width = 1, m = IDENTITY, z = 0, more, rule, cap, join, miter, align, start, end, follow, along, guide, art }) {
  if (art) return makeArt({ z, m, art, follow, along });
  const shape = {
    z,
    closed: !!closed,
    points: roundPoints(points),
    fill: roundFill(fill),
    stroke: roundFill(stroke),
    width: round(width, 2),
    m: Object.freeze(m.map((v) => round(v, 4))),
  };
  if (more?.length) shape.more = Object.freeze(more.map(([c, pts]) => Object.freeze([!!c, roundPoints(pts)])));
  if (rule && rule !== STROKE_DEFAULTS.rule) shape.rule = rule;
  if (cap && cap !== STROKE_DEFAULTS.cap) shape.cap = cap;
  if (join && join !== STROKE_DEFAULTS.join) shape.join = join;
  if (miter !== undefined && round(miter, 2) !== STROKE_DEFAULTS.miter) shape.miter = round(miter, 2);
  if (align && align !== STROKE_DEFAULTS.align) shape.align = align;
  if (start && share(start)) shape.start = share(start);
  if (end !== undefined && share(end) !== 1) shape.end = share(end);
  if (follow) shape.follow = makeFollow(follow);
  if (along && alongShare(along)) shape.along = alongShare(along);
  if (guide) shape.guide = true;
  return Object.freeze(shape);
}

// The fill rule and the stroke's cap, join, miter limit and alignment, the defaults filled in.
export const strokeOf = ({ rule, cap, join, miter, align }) => ({
  rule: rule ?? STROKE_DEFAULTS.rule, cap: cap ?? STROKE_DEFAULTS.cap, join: join ?? STROKE_DEFAULTS.join, miter: miter ?? STROKE_DEFAULTS.miter,
  align: align ?? STROKE_DEFAULTS.align,
});
// Whether every outline closes: only then has the shape an inside for its stroke to go in or out of.
export const allClosed = (shape) => shape.closed && (shape.more ?? []).every(([c]) => c);
// Where the stroke is drawn: its alignment, or centered when it's inside or outside and an outline is open.
export function strokeAlign(shape) {
  const { align } = strokeOf(shape);
  return align === 'left' || align === 'right' || allClosed(shape) ? align : 'center';
}
// How far past its outline the stroke reaches, before caps and joins: half its width centered, none inside, all of
// it outside or to a side.
export const strokeReach = (shape) => (shape.stroke ? shape.width * { inside: 0, center: 0.5, outside: 1, left: 1, right: 1 }[strokeAlign(shape)] : 0);

const CURVE_STEPS = 16;
// Each outline as a polyline in grid pixels, a curve in CURVE_STEPS steps: [{ closed, points: [[x, y, point], ...] }],
// point true where the outline has one of its points (not a step along a curve).
function polylines(shape) {
  return outlines(shape).map(({ closed, points }) => {
    const w = worldOf(points, shape.m), out = w.length ? [[w[0].x, w[0].y, true]] : [];
    for (let i = 0; i < (closed ? w.length : w.length - 1); i++) {
      const a = w[i], b = w[(i + 1) % w.length], p1 = a.out ?? a, p2 = b.in ?? b;
      if (!a.out && !b.in) out.push([b.x, b.y, true]);
      else {
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS, u = 1 - t, at = (q) => u * u * u * a[q] + 3 * u * u * t * p1[q] + 3 * u * t * t * p2[q] + t * t * t * b[q];
          out.push([at('x'), at('y'), k === CURVE_STEPS]);
        }
      }
    }
    return { closed, points: out };
  });
}

const signedArea = (poly) => poly.reduce((sum, [ax, ay], i) => sum + ax * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * ay, 0) / 2;

// How far a stroke to a side can reach past a corner, drawn at twice its width: a miter's point, with room to spare.
const cornerReach = (shape) => {
  const { join, miter } = strokeOf(shape);
  return shape.width * Math.max(1.5, join === 'miter' ? miter : 1);
};

// The area to one side ('left' or 'right' of the way it was drawn, as it shows: a mirrored shape's sides trade)
// of the shape's outlines, pad grid pixels wider all round: a quadrilateral beside each segment, as deep as the
// stroke's width (an open outline's first and last reaching as far past its ends, for caps), and a wedge across
// each corner that turns away from that side, out to a miter's point. Only the wedges reach further: beside a
// curve that bends back on itself, a deeper quadrilateral would reach across to the other side. Polygons
// [[x, y], ...], each turned the same way, so that filled together (nonzero) they're one area with no seams. A
// stroke at twice its width, cut to this, is a stroke to that side, its caps and joins as they were.
// ponytail: a bend tighter than the stroke's width lets a little of the other side in; trim the quadrilaterals
// against their neighbors if that's ever noticed.
export function strokeSide(shape, side, pad = 0) {
  const m = shape.m, s = (side === 'left' ? 1 : -1) * Math.sign(m[0] * m[3] - m[1] * m[2] || 1), polys = [];
  const reach = shape.width + 0.25 + pad, corner = cornerReach(shape) + pad; // 0.25: past the stroke's soft edge
  const normal = ([dx, dy], by = reach) => [s * dy * by, -s * dx * by];
  const plus = ([x, y], [dx, dy], by = 1) => [x + dx * by, y + dy * by];
  for (const { closed, points } of polylines(shape)) {
    const segs = [];
    for (let i = 0; i < (closed ? points.length : points.length - 1); i++) {
      const a = points[i], b = points[(i + 1) % points.length], long = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (long > 1e-9) segs.push([a, b, [(b[0] - a[0]) / long, (b[1] - a[1]) / long]]);
    }
    segs.forEach(([a, b, d], i) => {
      const n = normal(d), start = !closed && i === 0 ? plus(a, d, -reach) : a, end = !closed && i === segs.length - 1 ? plus(b, d, reach) : b;
      polys.push([start, end, plus(end, n), plus(start, n)]);
      const next = segs[i + 1] ?? (closed ? segs[0] : null);
      if (!next) return;
      const e = next[2], turn = d[0] * e[1] - d[1] * e[0], mid = [d[0] - e[0], d[1] - e[1]], midLong = Math.hypot(...mid);
      const by = b[2] ? corner : reach; // out to a miter's point only where the path has a point, not along a curve's steps
      if (s * turn > 1e-9 && midLong > 1e-9) polys.push([b, plus(b, normal(d, by)), plus(b, mid, (by * 2) / midLong), plus(b, normal(e, by))]);
    });
  }
  return polys.map((poly) => (signedArea(poly) < 0 ? poly.reverse() : poly));
}

// The shape's outlines, [{ closed, points }], the first one first.
// An art layer has none: it's cells, not a path (artLayers.js).
export const outlines = (shape) => (isArt(shape) ? [] : [{ closed: shape.closed, points: shape.points }, ...(shape.more ?? []).map(([closed, points]) => ({ closed, points }))]);
// The shape with these outlines instead; null with none.
export const withOutlines = (shape, list) => (list.length ? withShape(shape, { points: list[0].points, closed: list[0].closed, more: list.slice(1).map((o) => [o.closed, o.points]) }) : null);
export const allPoints = (shape) => outlines(shape).flatMap((o) => o.points);
// A flat point index as its outline (o) and its index there (j).
export function locate(shape, i) {
  let o = 0;
  for (const { points } of outlines(shape)) {
    if (i < points.length) return { o, j: i };
    i -= points.length;
    o++;
  }
  return null;
}

export const withShape = (shape, changes) => makeShape({ ...shape, ...changes });

// The style a new shape gets (workspace.vectorStyle), its colors as it takes them: 'fg' is the foreground color
// now (none: no color).
export function styleColors({ vectorStyle: style, editFgColor, editFgNone }) {
  const color = (c) => (c === 'fg' ? (editFgNone ? null : editFgColor) : c);
  return { fill: color(style.fill), stroke: color(style.stroke), width: style.width, cap: style.cap, join: style.join, miter: style.miter, align: style.align };
}

// The shape's fill (or its stroke: slot) as another kind: 'solid' (a gradient's first stop), or 'linear' (across
// its box, left to right) or 'radial' (from its box's middle to the farthest corner), a gradient keeping its stops
// and a color going from itself (from, for none) to the color to.
export function fillAs(shape, kind, { from, to }, slot = 'fill') {
  const fill = shape[slot];
  if (kind === 'solid') return isGradient(fill) ? fill.stops[0][1] : fill;
  if (isGradient(fill) && fill.type === kind) return fill;
  const stops = isGradient(fill) ? fill.stops : [[0, fill ?? from], [1, to]];
  const { x0, y0, x1, y1 } = localBounds(shape), w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (kind === 'radial') {
    const r = Math.hypot(w, h) / 2 || 1;
    return { type: 'radial', stops, m: [r, 0, 0, r, cx, cy] };
  }
  return { type: 'linear', stops, m: w ? [w, 0, 0, w, x0, cy] : [0, h || 1, -(h || 1), 0, cx, y0] }; // a line straight down: top to bottom
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

const worldOf = (points, m) => points.map(([x, y, ix, iy, ox, oy]) => ({
  ...apply(m, x, y),
  in: ix || iy ? apply(m, x + ix, y + iy) : null,
  out: ox || oy ? apply(m, x + ox, y + oy) : null,
}));
// Each point in grid pixels, its handles absolute (null for none), flat across the outlines.
export const worldPoints = (shape) => worldOf(allPoints(shape), shape.m);

const num = (v) => String(round(v, 4));

// SVG path data in grid pixels times (sx, sy): Path2D takes it. A segment with no handles is a line.
export function pathData(shape, sx = 1, sy = 1) {
  const xy = ({ x, y }) => `${num(x * sx)} ${num(y * sy)}`;
  const segment = (a, b) => (a.out || b.in ? `C${xy(a.out ?? a)} ${xy(b.in ?? b)} ${xy(b)}` : `L${xy(b)}`);
  let d = '';
  for (const { closed, points } of outlines(shape)) {
    const w = worldOf(points, shape.m);
    if (!w.length) continue;
    d += `M${xy(w[0])}`;
    for (let i = 1; i < w.length; i++) d += segment(w[i - 1], w[i]);
    if (closed && w.length > 1) {
      const last = w.at(-1), first = w[0];
      if (last.out || first.in) d += segment(last, first);
      d += 'Z';
    }
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

// The box round a shape's outlines themselves, not their handles (a curve's handles reach past it), carried by m:
// { x0, y0, x1, y1 }.
function pathBox(shape, m) {
  if (isArt(shape)) {
    const { x, y, w, h } = artBounds({ m, art: shape.art });
    return { x0: x, y0: y, x1: x + w, y1: y + h };
  }
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
  for (const { closed, points } of outlines(shape)) {
    const w = worldOf(points, m);
    for (const p of w) take(p.x, p.y);
    for (let i = 1; i < w.length; i++) curve(w[i - 1], w[i]);
    if (closed && w.length > 1) curve(w.at(-1), w[0]);
  }
  return { x0, y0, x1, y1 };
}

// The box round a shape in its own (local) grid pixels, and in grid pixels (square to the grid): the selection's.
export const localBounds = (shape) => pathBox(shape, IDENTITY);
export const curveBounds = (shape) => pathBox(shape, shape.m);

// Grid pixels the shape can draw in: its points' and handles' hull (a cubic stays inside it), with the stroke
// around it: half its width (none inside, all of it outside), as far as a miter join can reach past a corner, and
// a square cap past a diagonal end.
export function shapeBounds(shape) {
  if (isArt(shape)) return artBounds(shape);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of worldPoints(shape)) {
    for (const q of [p, p.in, p.out]) {
      if (!q) continue;
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
  }
  const { join, cap, miter } = strokeOf(shape);
  const pad = strokeReach(shape) * Math.max(join === 'miter' ? miter : 1, cap === 'square' ? Math.SQRT2 : 1);
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

// The shapes below take a style as styleColors gives it: fill, stroke, width, cap, join, miter limit and alignment.
const corner = (x, y) => [x, y, 0, 0, 0, 0, 0];

export const rectShape = (x0, y0, x1, y1, style) => makeShape({
  points: [corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1)], closed: true, ...style,
});

// Four smooth points, top, right, bottom, left, each a quarter circle's handles long.
export function ellipseShape(x0, y0, x1, y1, style) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = KAPPA * (x1 - x0) / 2, hy = KAPPA * (y1 - y0) / 2;
  return makeShape({
    points: [[cx, y0, -hx, 0, hx, 0, 1], [x1, cy, 0, -hy, 0, hy, 1], [cx, y1, hx, 0, -hx, 0, 1], [x0, cy, 0, hy, 0, -hy, 1]],
    closed: true,
    ...style,
  });
}

// A polygon inscribed in the box, its first corner at the top.
export function polygonShape(x0, y0, x1, y1, sides, style) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const points = Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / sides;
    return corner(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  });
  return makeShape({ points, closed: true, ...style });
}

// Segment i's four control points, local.
export function controls(points, i) {
  const a = points[i], b = points[(i + 1) % points.length];
  return [[a[0], a[1]], [a[0] + a[4], a[1] + a[5]], [b[0] + b[2], b[1] + b[3]], [b[0], b[1]]];
}
const at = (c, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u ** 3 * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t ** 3 * c[3][k]);
};
// The outline's nearest place to (x, y) (grid pixels): { segment, t, distance }, distance in grid pixels. segment
// is the flat index of the point the segment starts at (an outline's last, closed, runs back to its own first).
export function nearestOnOutline(shape, x, y) {
  const best = { segment: -1, t: 0, distance: Infinity };
  const distAt = (c, t) => {
    const [px, py] = at(c, t), w = apply(shape.m, px, py);
    return Math.hypot(w.x - x, w.y - y);
  };
  let start = 0;
  for (const { closed, points } of outlines(shape)) {
    const count = closed ? points.length : points.length - 1;
    for (let i = 0; i < count; i++) {
      const c = controls(points, i);
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
      if (d0 < best.distance) Object.assign(best, { segment: start + i, t: t0, distance: d0 });
    }
    start += points.length;
  }
  return best;
}

// The shape with point i's outline changed by edit(points, j, closed) (points copied, each point a copy; edit
// changes them in place, or returns the outline's new points, or null to take the outline away).
function editOutline(shape, i, edit) {
  const { o, j } = locate(shape, i), list = outlines(shape);
  const pts = list[o].points.map((p) => p.slice()), out = edit(pts, j, list[o].closed);
  if (out === null) list.splice(o, 1);
  else list[o] = { closed: list[o].closed, points: out ?? pts };
  return withOutlines(shape, list);
}

// A point added on segment i (flat, as nearestOnOutline gives it) at t, the curve where it was (de Casteljau).
export function splitAt(shape, i, t) {
  return editOutline(shape, i, (pts, j) => {
    const c = controls(pts, j);
    const lerp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const p01 = lerp(c[0], c[1]), p12 = lerp(c[1], c[2]), p23 = lerp(c[2], c[3]);
    const p012 = lerp(p01, p12), p123 = lerp(p12, p23), mid = lerp(p012, p123);
    const a = pts[j], b = pts[(j + 1) % pts.length], curved = a[4] || a[5] || b[2] || b[3];
    if (curved) {
      a[4] = p01[0] - a[0]; a[5] = p01[1] - a[1];
      b[2] = p23[0] - b[0]; b[3] = p23[1] - b[1];
    }
    const added = curved ? [mid[0], mid[1], p012[0] - mid[0], p012[1] - mid[1], p123[0] - mid[0], p123[1] - mid[1], 1] : corner(mid[0], mid[1]);
    pts.splice(j + 1, 0, added);
  });
}

// Point i moved by (dx, dy), local, its handles with it.
export function movePoint(shape, i, dx, dy) {
  return editOutline(shape, i, (pts, j) => {
    pts[j][0] += dx;
    pts[j][1] += dy;
  });
}

// Point i's handle ('in' or 'out') to (x, y), local. A smooth point's other handle turns to stay in line, at
// its own length; alone (Alt), it stays where it is and the point's handles are free of each other from then on.
export function moveHandle(shape, i, which, x, y, { alone = false } = {}) {
  return editOutline(shape, i, (pts, j) => {
    const p = pts[j];
    if (alone) p[6] = 0;
    const [own, other] = which === 'in' ? [2, 4] : [4, 2];
    p[own] = x - p[0];
    p[own + 1] = y - p[1];
    const length = Math.hypot(p[other], p[other + 1]), toward = Math.hypot(p[own], p[own + 1]);
    if (p[6] && length && toward) {
      p[other] = (-p[own] / toward) * length;
      p[other + 1] = (-p[own + 1] / toward) * length;
    }
  });
}

// Point i made smooth (its handles in line, along its neighbors in its outline; a third of the way to each when
// it has none) or a sharp corner (no handles: the edges either side of it run straight in).
export function setSmooth(shape, i, smooth) {
  return editOutline(shape, i, (pts, j, closed) => {
    const p = pts[j];
    p[6] = smooth ? 1 : 0;
    if (!smooth) return void p.fill(0, 2, 6);
    const n = pts.length, prev = pts[(j - 1 + n) % n], next = pts[(j + 1) % n];
    const hasPrev = closed || j > 0, hasNext = closed || j < n - 1;
    let dx = (hasNext ? next[0] : p[0]) - (hasPrev ? prev[0] : p[0]), dy = (hasNext ? next[1] : p[1]) - (hasPrev ? prev[1] : p[1]);
    if (p[4] || p[5]) [dx, dy] = [p[4] - p[2], p[5] - p[3]];
    const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const inLength = Math.hypot(p[2], p[3]) || (hasPrev ? Math.hypot(p[0] - prev[0], p[1] - prev[1]) / 3 : 0);
    const outLength = Math.hypot(p[4], p[5]) || (hasNext ? Math.hypot(next[0] - p[0], next[1] - p[1]) / 3 : 0);
    [p[2], p[3], p[4], p[5]] = [-ux * inLength, -uy * inLength, ux * outLength, uy * outLength];
  });
}

// Point i free: its handles kept, each moving on its own (moveHandle); a point with none gets smooth ones first.
export function setFree(shape, i) {
  const [, , ix, iy, ox, oy] = allPoints(shape)[i];
  return editOutline(ix || iy || ox || oy ? shape : setSmooth(shape, i, true), i, (pts, j) => {
    pts[j][6] = 0;
  });
}

// Point i gone; an outline left under two points goes with it, and null when that was the last outline.
export function deletePoint(shape, i) {
  return editOutline(shape, i, (pts, j) => (pts.length <= 2 ? null : pts.filter((_, at) => at !== j)));
}

// A point carried by w: its place by all of it, its handles (offsets) by its stretch and turn alone.
function carried(p, w) {
  const at = apply(w, p[0], p[1]), lin = [w[0], w[1], w[2], w[3], 0, 0], i = apply(lin, p[2], p[3]), o = apply(lin, p[4], p[5]);
  return [at.x, at.y, i.x, i.y, o.x, o.y, p[6]];
}

// A shape's outlines carried into another's own space (into: the inverse of that one's m).
export function outlinesIn(shape, into) {
  const w = multiply(into, shape.m);
  return outlines(shape).map((o) => ({ closed: o.closed, points: o.points.map((p) => carried(p, w)) }));
}

// Join: others' outlines carried into bottom's own space and added to it, filled evenodd so that any outline
// inside another is a hole, in bottom's style. Null when that's more points or outlines than a shape may have.
export function joined(bottom, others) {
  const list = outlines(bottom), into = invert(bottom.m);
  for (const shape of others) list.push(...outlinesIn(shape, into));
  if (list.length > MOST_OUTLINES || list.reduce((n, o) => n + o.points.length, 0) > MOST_POINTS) return null;
  return withOutlines(withShape(bottom, { rule: 'evenodd' }), list);
}

// Separate: each outline a shape of its own, in the shape's style and place.
export const separated = (shape) => outlines(shape).map((o) => withShape(shape, { points: o.points, closed: o.closed, more: [], rule: undefined }));

// A shape from a file, a project or another browser, or null when it's anything a shape can't be.
const finite = (v, most) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= most;
const goodColor = (c) => c === null || (typeof c === 'string' && HEX.test(c));
function goodFill(fill) {
  if (!isGradient(fill)) return goodColor(fill);
  if (Array.isArray(fill) || !GRADIENTS.includes(fill.type)) return false;
  if (!Object.keys(fill).every((k) => ['type', 'stops', 'm', ...(fill.type === 'radial' ? ['f'] : [])].includes(k))) return false;
  const { stops, m, f } = fill;
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > MOST_STOPS) return false;
  let last = 0;
  for (const stop of stops) {
    if (!Array.isArray(stop) || stop.length !== 2 || !finite(stop[0], 1) || stop[0] < last || typeof stop[1] !== 'string' || !HEX.test(stop[1])) return false;
    last = stop[0];
  }
  if (!Array.isArray(m) || m.length !== 6 || !m.every((v) => finite(v, MOST_SHIFT)) || Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-6) return false;
  return f === undefined || (Array.isArray(f) && f.length === 2 && f.every((v) => finite(v, 1)) && Math.hypot(...f) <= 1);
}
const goodPoints = (points) => Array.isArray(points) && points.length > 0
  && points.every((p) => Array.isArray(p) && p.length === 7 && p.slice(0, 6).every((v) => finite(v, MOST_COORD)) && (p[6] === 0 || p[6] === 1));
export function shapeFromStranger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if ('art' in value) return artFromStranger(value);
  const keys = Object.keys(value);
  if (!FIELDS.every((f) => f in value) || !keys.every((k) => FIELDS.includes(k) || OPTIONAL.includes(k))) return null;
  const { z, closed, points, fill, stroke, width, m, more, rule, cap, join, miter, align, start, end, follow, along, guide } = value;
  if (!Number.isInteger(z) || Math.abs(z) > MOST_Z || typeof closed !== 'boolean') return null;
  if (!goodFill(fill) || !goodFill(stroke)) return null;
  if (!finite(width, MOST_WIDTH) || width < 0) return null;
  if (!Array.isArray(m) || m.length !== 6 || !m.every((v, i) => finite(v, i < 4 ? MOST_M : MOST_SHIFT)) || Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-6) return null;
  if (!goodPoints(points)) return null;
  let count = points.length;
  if ('more' in value) {
    if (!Array.isArray(more) || !more.length || more.length >= MOST_OUTLINES) return null;
    for (const o of more) {
      if (!Array.isArray(o) || o.length !== 2 || typeof o[0] !== 'boolean' || !goodPoints(o[1])) return null;
      count += o[1].length;
    }
  }
  if (count > MOST_POINTS) return null;
  // Only the values other than the default: a default is written by leaving the field out.
  if (('rule' in value && !RULES.includes(rule)) || ('cap' in value && !CAPS.includes(cap)) || ('join' in value && !JOINS.includes(join)) || ('align' in value && !ALIGNS.includes(align))) return null;
  if ('miter' in value && (!finite(miter, 100) || miter < 1 || miter === STROKE_DEFAULTS.miter)) return null;
  if (('start' in value && (!finite(start, 1) || start <= 0)) || ('end' in value && (!finite(end, 1) || end < 0 || end === 1))) return null; // shares, the defaults 0 and 1 left out
  if (('follow' in value && !goodFollow(follow, false)) || ('along' in value && !goodAlong(along)) || ('guide' in value && guide !== true)) return null;
  return makeShape({ z, closed, points, fill, stroke, width, m, more, rule, cap, join, miter, align, start, end, follow, along, guide });
}

export const isGoodShapeKey = (key) => typeof key === 'string' && SHAPE_KEY.test(key);

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
