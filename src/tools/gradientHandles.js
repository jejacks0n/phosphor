// A gradient's handles, for the Node tool's shape (workspace.vectorPoints) or Vector select's one selected shape
// (its line isn't, there: a drag inside moves the shape), when its fill or stroke is a gradient
// (with both, workspace.vectorGradientSlot's; gradientSlot): a linear one shows a line
// from its start to its end, a radial one its center and a radius handle, and both a dot for each stop along it
// (gradientHandles). Drag the line (or a radial's center) to move the gradient, an end (or the radius handle) to
// stretch and turn it about the other (Shift: across, up and down or at 45°), a stop along the line to slide it,
// or well off the line to remove it (two always stay); click the line to add a stop there, in the color the
// gradient has there, or a stop to select it (workspace.vectorStop, the selected point let go), whose color that
// chip's box then sets. Each drag or click that changes the gradient is one undo step; removeStop is Delete's.
import { MOST_STOPS, apply, gradientColorAt, invert, isGradient, multiply, translation, withShape } from '@/document/shapes.js';
import { snappedEnd } from '@/tools/shapes.js';

const OFF_THE_LINE = 24; // CSS px a stop is dragged off its line to remove it
const MOVED = 2;         // CSS px a press goes before it's a drag, not a click

let drag = null; // { kind: 'line' | 'move' | 'end' | 'stop', key, slot, start, at, moved, which?, stop?, t? }

const hasGradient = (shape) => !!shape && (isGradient(shape.fill) || isGradient(shape.stroke));
// The key of the shape whose gradient's handles show, when it has a gradient: the Node tool's, or Vector select's
// one selected shape; or null.
export const gradientKey = (project, workspace) => {
  const { activeTool: tool, vectorSelected: chosen } = workspace;
  const key = tool === 'vnode' ? workspace.vectorPoints : tool === 'vselect' && chosen.length === 1 && chosen[0];
  return key && hasGradient(project.shapes.get(key)) ? key : null;
};
// Which of its gradients the tool edits: workspace.vectorGradientSlot's when that's one, else the one it has.
export const gradientSlot = (shape, workspace) => {
  const slot = workspace.vectorGradientSlot;
  if (isGradient(shape[slot])) return slot;
  return isGradient(shape.fill) ? 'fill' : 'stroke';
};

// The handles in grid pixels: p0 (a linear's start, a radial's center), p1 (its end, the radius), and each stop.
export function gradientHandles(shape, slot = 'fill') {
  const paint = shape[slot], w = multiply(shape.m, paint.m), at = (o) => apply(w, o, 0);
  return { p0: at(0), p1: at(1), stops: paint.stops.map(([o, color], i) => ({ i, at: at(o), color })) };
}

// Where p is along the line from a to b (0 to 1, clamped) and how far off it, in CSS px.
function along(a, b, p, unit) {
  const ax = a.x * unit.x, ay = a.y * unit.y, dx = b.x * unit.x - ax, dy = b.y * unit.y - ay, px = p.x * unit.x - ax, py = p.y * unit.y - ay;
  const length = Math.hypot(dx, dy) || 1;
  return { t: Math.min(1, Math.max(0, (px * dx + py * dy) / (length * length))), off: Math.abs(px * dy - py * dx) / length };
}
const near = (a, b, unit, radius) => Math.hypot((a.x - b.x) * unit.x, (a.y - b.y) * unit.y) <= radius;

// The turn and stretch about f (local) that takes from to to.
function about(f, from, to) {
  const ux = from.x - f.x, uy = from.y - f.y, vx = to.x - f.x, vy = to.y - f.y, n = ux * ux + uy * uy;
  if (!n || (!vx && !vy)) return null;
  const a = (ux * vx + uy * vy) / n, b = (ux * vy - uy * vx) / n;
  return [a, b, -b, a, f.x - a * f.x + b * f.y, f.y - b * f.x - a * f.y];
}

const withPaint = (shape, slot, changes) => withShape(shape, { [slot]: { ...shape[slot], ...changes } });
// Stops kept in order; the index the one at i went to.
function sorted(stops, i) {
  const order = stops.map((s, j) => [s, j]).sort(([a, ja], [b, jb]) => a[0] - b[0] || ja - jb);
  return { stops: order.map(([s]) => s), i: order.findIndex(([, j]) => j === i) };
}

// The selected stop's color set (remember: false while the native picker drags; the edit stays open then).
export function recolorStop(project, workspace, hex, { remember = true } = {}) {
  const key = gradientKey(project, workspace), shape = key && project.shapes.get(key), i = workspace.vectorStop;
  const slot = shape && gradientSlot(shape, workspace);
  if (!shape || i === null || !shape[slot].stops[i] || !hex) return;
  if (!remember) project.beginEdit();
  project.updateShapes([[key, withPaint(shape, slot, { stops: shape[slot].stops.map((s, j) => (j === i ? [s[0], hex] : s)) })]]);
  if (remember && project._stroke && !project._stroke.typing) project.commitEdit();
}

export function removeStop(project, workspace) {
  const key = gradientKey(project, workspace), shape = key && project.shapes.get(key), i = workspace.vectorStop;
  const slot = shape && gradientSlot(shape, workspace);
  if (!shape || i === null || shape[slot].stops.length <= 2) return;
  project.updateShapes([[key, withPaint(shape, slot, { stops: shape[slot].stops.filter((_, j) => j !== i) })]]);
  workspace.vectorStop = null;
}

// Where a press finds the gradient's handles: its ends and stops in reach (candidates, handlePick's; a stop at an
// end is the end's), else its line (line: the drag started, or false).
export const gradientDrag = {
  candidates({ project, workspace, unit }, pos, radius) {
    const key = gradientKey(project, workspace), shape = key && project.shapes.get(key);
    if (!shape) return [];
    const slot = gradientSlot(shape, workspace), { p0, p1, stops } = gradientHandles(shape, slot), radial = shape[slot].type === 'radial';
    const stopNear = (p) => stops.find((s) => near(s.at, p, unit, 1))?.i; // a stop at that end
    const take = (hit) => () => {
      project.beginEdit();
      drag = { ...hit, key, slot, start: shape, at: pos, moved: false };
      return true;
    };
    const picked = (stop) => () => {
      workspace.vectorStop = stop ?? null;
      workspace.vectorPoint = null;
    };
    const handle = (id, at, hit) => ({ id, d: Math.hypot((at.x - pos.x) * unit.x, (at.y - pos.y) * unit.y), first: true, picked: picked(hit.stop), take: take(hit) });
    return [
      handle('g1', p1, { kind: 'end', which: 1, stop: stopNear(p1) }),
      handle('g0', p0, { kind: radial ? 'move' : 'end', which: 0, stop: stopNear(p0) }),
      ...stops.filter((s) => !near(s.at, p0, unit, 1) && !near(s.at, p1, unit, 1)).map((s) => handle(`s${s.i}`, s.at, { kind: 'stop', stop: s.i })),
    ].filter((c) => c.d <= radius);
  },

  line({ project, workspace, unit }, pos, radius) {
    const key = gradientKey(project, workspace), shape = key && project.shapes.get(key);
    if (!shape) return false;
    const slot = gradientSlot(shape, workspace), { p0, p1 } = gradientHandles(shape, slot), on = along(p0, p1, pos, unit);
    if (on.off > radius || on.t <= 0 || on.t >= 1) return false;
    project.beginEdit();
    drag = { kind: 'line', t: on.t, key, slot, start: shape, at: pos, moved: false };
    return true;
  },

  get active() {
    return !!drag;
  },

  move({ project, workspace, unit }, from, to) {
    if (!drag) return;
    if (!drag.moved && !near(drag.at, to, unit, MOVED)) drag.moved = true;
    if (!drag.moved) return;
    const { start, slot } = drag, back = invert(start.m), local = (p) => apply(back, p.x, p.y);
    let next = null;
    if (drag.kind === 'line' || drag.kind === 'move') {
      const a = local(drag.at), b = local(to);
      next = withPaint(start, slot, { m: multiply(translation(b.x - a.x, b.y - a.y), start[slot].m) });
    } else if (drag.kind === 'end') {
      const { p0, p1 } = gradientHandles(start, slot), fixed = drag.which ? p0 : p1, moving = drag.which ? p1 : p0;
      const end = workspace.isShiftPressed ? snappedEnd(fixed, to) : to;
      const turn = about(local(fixed), local(moving), local(end));
      if (turn) next = withPaint(start, slot, { m: multiply(turn, start[slot].m) });
    } else if (drag.kind === 'stop') {
      const { p0, p1 } = gradientHandles(start, slot), on = along(p0, p1, to, unit), stops = start[slot].stops;
      if (on.off > OFF_THE_LINE && stops.length > 2) {
        next = withPaint(start, slot, { stops: stops.filter((_, j) => j !== drag.stop) });
        workspace.vectorStop = null;
      } else {
        const order = sorted(stops.map((s, j) => (j === drag.stop ? [on.t, s[1]] : s)), drag.stop);
        next = withPaint(start, slot, { stops: order.stops });
        workspace.vectorStop = order.i;
      }
    }
    if (next) project.updateShapes([[drag.key, next]]);
  },

  end({ project, workspace }) {
    if (!drag) return;
    const { kind, moved, start, key, slot } = drag, { stops } = start[slot];
    if (!moved) {
      if (kind === 'line' && stops.length < MOST_STOPS) {
        const order = sorted([...stops, [drag.t, gradientColorAt(stops, drag.t)]], stops.length);
        project.updateShapes([[key, withPaint(start, slot, { stops: order.stops })]]);
        workspace.vectorStop = order.i;
      } else if (drag.stop !== undefined) workspace.vectorStop = drag.stop;
    }
    if (workspace.vectorStop !== null) workspace.vectorPoint = null;
    drag = null;
    project.commitEdit();
  },

  cancel() {
    drag = null; // the viewport took the edit back
  },
};
