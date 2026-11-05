// Vector select (the VECTOR tab): click a shape to select it (Shift adds or takes it away), or drag a box over
// empty canvas to select every shape it touches (Shift: adds them); each change of the selection is an undo
// step (selectShapes). Then drag inside the box to move (Shift: straight across, up and down, or at 45°), a handle to scale (Shift keeps the proportions, Alt scales from the middle)
// or the knob above it to rotate (Shift: one shape to angles in steps of 15°, several by them). A second click on a shape edits its points with the
// Node tool (vnode.js). One shape selected, its gradient's ends and stops show and drag as the Node tool's do
// (gradientHandles.js; a click on a stop selects it), ahead of the box's handles where they're near (handlePick: a
// click again takes the next one there). Each drag is one edit, worked out each move from the shapes as they were at the press,
// so nothing drifts. Keys: arrows nudge a grid pixel (Shift: 10), Delete or Backspace deletes (the selected stop,
// or else the shapes), Esc lets the stop go or deselects.
import { t } from '@/i18n/index.js';
import { apply, curveBounds, invert, localBounds, multiply, rotation, scaling, translation, transformed, withShape } from '@/document/shapes.js';
import { snappedEnd } from '@/tools/shapes.js';
import { snapAlong, snapMode, snapPoint } from '@/lib/vectorSnap.js';
import { shapeAt, shapesTouching } from '@/lib/shapeHits.js';
import { gradientDrag, removeStop } from '@/tools/gradientHandles.js';
import { handlePicker } from '@/tools/handlePick.js';

const KNOB = 24;           // CSS px above the box's top edge
const DOUBLE_MS = 400, DOUBLE_PX = 4;
const SNAP = Math.PI / 12; // 15°

// The handles' radius in CSS px: bigger under a finger.
export const handleRadius = () => (matchMedia('(pointer: coarse)').matches ? 14 : 6);

// The selection's box in grid pixels: one shape's own (turned with it), or several's together, square to the
// grid. corners run top-left, top-right, bottom-right, bottom-left.
export function selectionBox(shapes, keys) {
  const chosen = keys.map((key) => shapes.get(key)).filter(Boolean);
  if (!chosen.length) return null;
  if (chosen.length === 1) {
    const shape = chosen[0], { x0, y0, x1, y1 } = localBounds(shape);
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => apply(shape.m, x, y));
    return { corners, center: apply(shape.m, (x0 + x1) / 2, (y0 + y1) / 2), local: { m: shape.m, x0, y0, x1, y1 } };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const shape of chosen) {
    const b = curveBounds(shape); // round the curves, not their handles, as one shape's box is
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  return { corners: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, local: null };
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// The 8 handles (corners, then the edges' middles: top, right, bottom, left) and the knob, in grid pixels.
// unit: CSS px per grid pixel, so the knob sits KNOB CSS px out from the top edge, along the box's own up.
export function boxHandles(box, unit) {
  const [tl, tr, br, bl] = box.corners, top = mid(tl, tr);
  const handles = [tl, tr, br, bl, top, mid(tr, br), mid(br, bl), mid(bl, tl)];
  let ux = (top.x - box.center.x) * unit.x, uy = (top.y - box.center.y) * unit.y;
  const length = Math.hypot(ux, uy);
  if (length < 1e-6) [ux, uy] = [0, -1];
  else [ux, uy] = [ux / length, uy / length];
  return { handles, top, knob: { x: top.x + (ux * KNOB) / unit.x, y: top.y + (uy * KNOB) / unit.y } };
}

const near = (a, b, unit, radius) => Math.hypot((a.x - b.x) * unit.x, (a.y - b.y) * unit.y) <= radius;

function inside(corners, { x, y }) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

// The shapes as they were at the press, each changed by change(shape) → its new transform (or null: as it was).
function reshape(project, drag, change) {
  const changes = [];
  for (const [key, shape] of drag.start) {
    const m = change(shape);
    if (m) changes.push([key, withShape(shape, { m })]); // one the document wouldn't keep, it doesn't take
  }
  project.updateShapes(changes);
}

// The scale handle i: which way it pulls ([-1, 0, 1] in x and y: left, none, right) and the handle opposite.
const PULLS = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]];

function scaleTo(project, drag, pos, shift, fromMiddle) {
  const { box, handle } = drag, [px, py] = PULLS[handle];
  // In the box's own frame: one shape's local pixels, or the grid's.
  const frame = box.local?.m ?? [1, 0, 0, 1, 0, 0], back = invert(frame);
  const { x0, y0, x1, y1 } = box.local ?? { x0: box.corners[0].x, y0: box.corners[0].y, x1: box.corners[2].x, y1: box.corners[2].y };
  const p = apply(back, pos.x, pos.y);
  const middle = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const anchor = fromMiddle ? middle : { x: px > 0 ? x0 : px < 0 ? x1 : middle.x, y: py > 0 ? y0 : py < 0 ? y1 : middle.y };
  const from = { x: px > 0 ? x1 : x0, y: py > 0 ? y1 : y0 };
  let sx = px && from.x !== anchor.x ? (p.x - anchor.x) / (from.x - anchor.x) : 1;
  let sy = py && from.y !== anchor.y ? (p.y - anchor.y) / (from.y - anchor.y) : 1;
  if (shift) {
    const s = !px ? sy : !py ? sx : Math.abs(sx) > Math.abs(sy) ? sx : sy;
    sx = sy = s;
  }
  const s = scaling(sx, sy, anchor.x, anchor.y);
  const w = multiply(frame, multiply(s, back)); // the scale in the box's frame, as grid pixels
  reshape(project, drag, (shape) => multiply(w, shape.m));
}

function rotateTo(project, drag, pos, shift) {
  const { center } = drag.box;
  let angle = Math.atan2(pos.y - center.y, pos.x - center.x) - Math.atan2(drag.from.y - center.y, drag.from.x - center.x);
  if (shift) {
    // One shape: its own angle in steps (so a turned one squares up again); several, square to the grid: the turn.
    const m = drag.box.local?.m, from = m ? Math.atan2(m[1], m[0]) : 0;
    angle = Math.round((from + angle) / SNAP) * SNAP - from;
  }
  const w = rotation(angle, center.x, center.y);
  reshape(project, drag, (shape) => multiply(w, shape.m));
}

let drag = null, lastPress = null;
const pick = handlePicker();

// A drag of the box's (or a marquee) let go: a second click on a shape, not moved, edits its points.
function endDrag(project, workspace) {
  if (!drag) return;
  const { again, moved, kind, keys, shift } = drag;
  drag = null;
  if (kind === 'marquee') {
    const box = workspace.vectorMarquee;
    workspace.vectorMarquee = null;
    const touched = box ? shapesTouching(project.shapes, box) : [];
    if (box || !shift) project.selectShapes(shift ? [...keys, ...touched.filter((key) => !keys.includes(key))] : touched);
    return;
  }
  project.commitEdit();
  if (again && !moved) {
    workspace.vectorSelected = [again];
    workspace.setActiveTool('vnode');
    workspace.vectorPoints = again;
    workspace.vectorPoint = null;
  }
}

const selected = (workspace, project) => workspace.vectorSelected.filter((key) => project.shapes.has(key));

export default {
  id: 'vselect',
  get title() { return t('tools.vselect.title'); },
  keys: ['V'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M160 96C160 83.1 167.8 71.4 179.8 66.4C191.8 61.4 205.5 64.2 214.7 73.4L534.7 393.4C543.9 402.6 546.6 416.3 541.6 428.3C536.6 440.3 524.9 448 512 448L374.6 448L436.3 571.5C444.2 587.3 437.8 606.5 422 614.4C406.2 622.3 387 615.9 379.1 600.1L316.3 474.5L214.6 566.6C205.2 575.1 191.7 577.3 180.1 572.2C168.5 567.1 160 555.6 160 542.9L160 96z"/></svg>`,
  views: ['vector'],
  kind: 'paint',
  section: 'vector',

  begin(ctx, pos, event) {
    const { project, workspace, unit } = ctx, shift = !!event?.shiftKey, radius = handleRadius(), tol = radius / unit.x;
    const keys = selected(workspace, project), box = selectionBox(project.shapes, keys);
    const at = (kind, extra = {}) => {
      drag = { kind, from: pos, box, start: (extra.keys ?? keys).map((key) => [key, project.shapes.get(key)]), shift, ...extra };
      project.beginEdit();
      return true;
    };
    if (box && !shift) {
      // The box's handles and the knob, and (one shape) its gradient's, which come first; or a click again's.
      const { handles, knob } = boxHandles(box, unit), letStop = () => { workspace.vectorStop = null; };
      const d = (p) => Math.hypot((p.x - pos.x) * unit.x, (p.y - pos.y) * unit.y);
      const own = [{ id: 'knob', d: d(knob), take: () => at('rotate'), picked: letStop }, ...handles.map((h, handle) => ({ id: `h${handle}`, d: d(h), take: () => at('scale', { handle, grip: h }), picked: letStop }))];
      if (pick.press([...own.filter((c) => c.d <= radius), ...gradientDrag.candidates(ctx, pos, radius)], pos, unit)) return true;
    } else pick.reset();
    const hit = shapeAt(project.shapes, pos.x, pos.y, tol);
    const now = performance.now(), again = hit && lastPress?.key === hit && now - lastPress.time < DOUBLE_MS
      && near(pos, lastPress.pos, unit, DOUBLE_PX);
    lastPress = { key: hit, time: now, pos };
    const marquee = () => {
      drag = { kind: 'marquee', from: pos, keys, shift };
      return true;
    };
    if (shift) {
      if (!hit) return marquee();
      project.selectShapes(keys.includes(hit) ? keys.filter((key) => key !== hit) : [...keys, hit]);
      return false;
    }
    // A second click on a shape (pressed and let go without moving) edits its points: see end.
    if (box && inside(box.corners, pos)) return at('move', { again: again && hit });
    if (hit) {
      project.selectShapes([hit]);
      return at('move', { keys: [hit], box: selectionBox(project.shapes, [hit]), again: again && hit });
    }
    return marquee(); // let go where it was pressed: a click on empty canvas, which deselects
  },

  move(ctx, from, to) {
    const { project, workspace } = ctx;
    pick.move(to, ctx.unit);
    if (gradientDrag.active) return gradientDrag.move(ctx, from, to);
    if (!drag) return;
    const shift = workspace.isShiftPressed;
    drag.moved ||= to.x !== drag.from.x || to.y !== drag.from.y;
    if (drag.kind === 'marquee') {
      const { from: f } = drag;
      if (drag.moved) workspace.vectorMarquee = { x0: Math.min(f.x, to.x), y0: Math.min(f.y, to.y), x1: Math.max(f.x, to.x), y1: Math.max(f.y, to.y) };
      return;
    }
    const snap = snapMode(workspace);
    if (drag.kind === 'move') {
      const end = shift ? snappedEnd(drag.from, to) : to;
      // Snap to: the box's corner nearest the grab on the grid (along Shift's line), the shapes with it.
      const corner = drag.box.corners.reduce((a, b) => (Math.hypot(b.x - drag.from.x, b.y - drag.from.y) < Math.hypot(a.x - drag.from.x, a.y - drag.from.y) ? b : a));
      const moved = { x: corner.x + end.x - drag.from.x, y: corner.y + end.y - drag.from.y };
      const at = shift ? snapAlong(corner, moved, snap) : snapPoint(moved, snap);
      reshape(project, drag, (shape) => transformed(shape, translation(at.x - corner.x, at.y - corner.y)).m);
    }
    else if (drag.kind === 'scale') {
      // Snap to: the handle dragged on the grid, where it was grabbed moved with the pointer.
      const grip = snapPoint({ x: drag.grip.x + to.x - drag.from.x, y: drag.grip.y + to.y - drag.from.y }, snap);
      scaleTo(project, drag, snap === 'none' ? to : grip, shift, workspace.isAltPressed);
    }
    else rotateTo(project, drag, to, shift);
  },

  end(ctx) {
    const { project, workspace } = ctx;
    if (gradientDrag.active) gradientDrag.end(ctx);
    else endDrag(project, workspace);
    pick.end();
  },

  cancel(ctx) {
    drag = null; // the viewport took the edit back
    ctx.workspace.vectorMarquee = null;
    gradientDrag.cancel(ctx);
    pick.reset();
  },

  keydown({ project, workspace }, event) {
    const keys = selected(workspace, project), [dx, dy] = ARROWS[event.key] ?? [];
    const stop = workspace.vectorStop !== null && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (stop && event.key === 'Escape') workspace.vectorStop = null;
    else if (stop && (event.key === 'Delete' || event.key === 'Backspace')) removeStop(project, workspace);
    if (stop && ['Escape', 'Delete', 'Backspace'].includes(event.key)) return true;
    if (event.key === 'Escape') {
      if (!keys.length) return false;
      project.selectShapes([]);
      return true;
    }
    if (!keys.length || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      project.deleteShapes(keys);
      workspace.vectorSelected = [];
      return true;
    }
    if (dx === undefined) return false;
    const step = event.shiftKey ? 10 : 1;
    project.updateShapes(keys.map((key) => [key, transformed(project.shapes.get(key), translation(dx * step, dy * step))]));
    return true;
  },
};

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
