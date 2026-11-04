// The Gradient tool (the VECTOR tab), for the first selected shape with a gradient fill: a linear one shows a line
// from its start to its end, a radial one its center and a radius handle, and both a dot for each stop along it
// (gradientHandles). Drag the line (or a radial's center) to move the gradient, an end (or the radius handle) to
// stretch and turn it about the other (Shift: across, up and down or at 45°), a stop along the line to slide it,
// or well off the line to remove it (two always stay); click the line to add a stop there, in the color the
// gradient has there, or a stop to select it (workspace.vectorStop), whose color the Fill chip's box then sets.
// A press on another shape selects it. Each drag or click that changes the gradient is one undo step. Keys:
// Delete or Backspace removes the selected stop, Esc lets it go; the rest are Vector select's.
import { t } from '@/i18n/index.js';
import { apply, invert, isGradient, multiply, translation, withShape } from '@/document/shapes.js';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { shapeAt } from '@/lib/shapeHits.js';
import { snappedEnd } from '@/tools/shapes.js';
import vselect, { handleRadius } from '@/tools/vselect.js';

const MOST_STOPS = 16;
const OFF_THE_LINE = 24; // CSS px a stop is dragged off its line to remove it
const MOVED = 2;         // CSS px a press goes before it's a drag, not a click

let drag = null; // { kind: 'line' | 'move' | 'end' | 'stop', key, start, at, moved, which?, stop?, t? }

// The key of the first selected shape with a gradient fill, or null.
export const gradientKey = (project, workspace) => workspace.vectorSelected.find((key) => isGradient(project.shapes.get(key)?.fill)) ?? null;

// The handles in grid pixels: p0 (a linear's start, a radial's center), p1 (its end, the radius), and each stop.
export function gradientHandles(shape) {
  const w = multiply(shape.m, shape.fill.m), at = (o) => apply(w, o, 0);
  return { p0: at(0), p1: at(1), stops: shape.fill.stops.map(([o, color], i) => ({ i, at: at(o), color })) };
}

// The gradient's color at offset o, its stops mixed.
function colorAt(stops, o) {
  const after = stops.findIndex(([at]) => at >= o);
  if (after <= 0) return stops[after < 0 ? stops.length - 1 : 0][1];
  const [a, ca] = stops[after - 1], [b, cb] = stops[after], k = b > a ? (o - a) / (b - a) : 0;
  const x = hex2rgb(ca), y = hex2rgb(cb);
  return rgb2hex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k });
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

const withFill = (shape, changes) => withShape(shape, { fill: { ...shape.fill, ...changes } });
// Stops kept in order; the index the one at i went to.
function sorted(stops, i) {
  const order = stops.map((s, j) => [s, j]).sort(([a, ja], [b, jb]) => a[0] - b[0] || ja - jb);
  return { stops: order.map(([s]) => s), i: order.findIndex(([, j]) => j === i) };
}

// The selected stop's color set (remember: false while the native picker drags; the edit stays open then).
export function recolorStop(project, workspace, hex, { remember = true } = {}) {
  const key = gradientKey(project, workspace), shape = key && project.shapes.get(key), i = workspace.vectorStop;
  if (!shape || i === null || !shape.fill.stops[i] || !hex) return;
  if (!remember) project.beginEdit();
  project.updateShapes([[key, withFill(shape, { stops: shape.fill.stops.map((s, j) => (j === i ? [s[0], hex] : s)) })]]);
  if (remember && project._stroke && !project._stroke.typing) project.commitEdit();
}

function removeStop(project, workspace) {
  const key = gradientKey(project, workspace), shape = key && project.shapes.get(key), i = workspace.vectorStop;
  if (!shape || i === null || shape.fill.stops.length <= 2) return;
  project.updateShapes([[key, withFill(shape, { stops: shape.fill.stops.filter((_, j) => j !== i) })]]);
  workspace.vectorStop = null;
}

export default {
  id: 'vgradient',
  get title() { return t('tools.vgradient.title'); },
  keys: ['G'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill-rule="evenodd" d="M128 96H512A32 32 0 0 1 544 128V512A32 32 0 0 1 512 544H128A32 32 0 0 1 96 512V128A32 32 0 0 1 128 96ZM144 144V496H224V144ZM272 144V496H320V144ZM368 144V496H400V144ZM448 144V496H464V144Z"/></svg>`,
  views: ['vector'],
  kind: 'paint',
  section: 'vector',

  begin({ project, workspace, unit }, pos) {
    const radius = handleRadius(), key = gradientKey(project, workspace), shape = key && project.shapes.get(key);
    if (shape) {
      const { p0, p1, stops } = gradientHandles(shape), radial = shape.fill.type === 'radial';
      const stopNear = (p) => stops.find((s) => near(s.at, p, unit, 1))?.i; // a stop at that end
      let hit = null;
      if (near(pos, p1, unit, radius)) hit = { kind: 'end', which: 1, stop: stopNear(p1) };
      else if (near(pos, p0, unit, radius)) hit = { kind: radial ? 'move' : 'end', which: 0, stop: stopNear(p0) };
      else {
        const stop = stops.find((s) => near(s.at, pos, unit, radius));
        if (stop) hit = { kind: 'stop', stop: stop.i };
        else {
          const on = along(p0, p1, pos, unit);
          if (on.off <= radius && on.t > 0 && on.t < 1) hit = { kind: 'line', t: on.t };
        }
      }
      if (hit) {
        project.beginEdit();
        drag = { ...hit, key, start: shape, at: pos, moved: false };
        return true;
      }
    }
    const other = shapeAt(project.shapes, pos.x, pos.y, radius / unit.x);
    if (other && other !== key) {
      workspace.vectorSelected = [other];
      workspace.vectorStop = null;
    }
    return false;
  },

  move({ project, workspace, unit }, from, to) {
    if (!drag) return;
    if (!drag.moved && !near(drag.at, to, unit, MOVED)) drag.moved = true;
    if (!drag.moved) return;
    const { start } = drag, back = invert(start.m), local = (p) => apply(back, p.x, p.y);
    let next = null;
    if (drag.kind === 'line' || drag.kind === 'move') {
      const a = local(drag.at), b = local(to);
      next = withFill(start, { m: multiply(translation(b.x - a.x, b.y - a.y), start.fill.m) });
    } else if (drag.kind === 'end') {
      const { p0, p1 } = gradientHandles(start), fixed = drag.which ? p0 : p1, moving = drag.which ? p1 : p0;
      const end = workspace.isShiftPressed ? snappedEnd(fixed, to) : to;
      const turn = about(local(fixed), local(moving), local(end));
      if (turn) next = withFill(start, { m: multiply(turn, start.fill.m) });
    } else if (drag.kind === 'stop') {
      const { p0, p1 } = gradientHandles(start), on = along(p0, p1, to, unit), stops = start.fill.stops;
      if (on.off > OFF_THE_LINE && stops.length > 2) {
        next = withFill(start, { stops: stops.filter((_, j) => j !== drag.stop) });
        workspace.vectorStop = null;
      } else {
        const order = sorted(stops.map((s, j) => (j === drag.stop ? [on.t, s[1]] : s)), drag.stop);
        next = withFill(start, { stops: order.stops });
        workspace.vectorStop = order.i;
      }
    }
    if (next) project.updateShapes([[drag.key, next]]);
  },

  end({ project, workspace }) {
    if (!drag) return;
    const { kind, moved, start, key } = drag;
    if (!moved) {
      if (kind === 'line' && start.fill.stops.length < MOST_STOPS) {
        const order = sorted([...start.fill.stops, [drag.t, colorAt(start.fill.stops, drag.t)]], start.fill.stops.length);
        project.updateShapes([[key, withFill(start, { stops: order.stops })]]);
        workspace.vectorStop = order.i;
      } else if (drag.stop !== undefined) workspace.vectorStop = drag.stop;
    }
    drag = null;
    project.commitEdit();
  },

  cancel() {
    drag = null; // the viewport took the edit back
  },

  keydown(ctx, event) {
    const { project, workspace } = ctx;
    if (workspace.vectorStop !== null && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key === 'Escape') {
        workspace.vectorStop = null;
        return true;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        removeStop(project, workspace);
        return true;
      }
    }
    return vselect.keydown(ctx, event);
  },
};
