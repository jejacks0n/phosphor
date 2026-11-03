// Vector select (the VECTOR tab): click a shape to select it (Shift adds or takes it away), then drag inside
// the box to move, a handle to scale (Shift keeps the proportions) or the knob above it to rotate (Shift: in
// steps of 15°). A second click on a shape edits its points (workspace.vectorPoints): drag a point or a
// handle, click the outline to add a point there, click empty canvas to leave. Each drag is one edit, worked
// out each move from the shapes as they were at the press, so nothing drifts. Keys: arrows nudge a grid pixel
// (Shift: 10), Delete or Backspace deletes (the selected point, when editing points), Esc leaves the points
// and then the selection.
import { t } from '@/i18n/index.js';
import { apply, deletePoint, invert, localBounds, moveHandle, movePoint, multiply, nearestOnOutline, rotation, scaling, shapeBounds, splitAt, translation, transformed, withShape, worldPoints } from '@/document/shapes.js';
import { shapeAt } from '@/lib/shapeHits.js';

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
    const b = shapeBounds(withShape(shape, { stroke: null })); // the points' hull, as one shape's box is
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
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

function scaleTo(project, drag, pos, shift) {
  const { box, handle } = drag, [px, py] = PULLS[handle];
  // In the box's own frame: one shape's local pixels, or the grid's.
  const frame = box.local?.m ?? [1, 0, 0, 1, 0, 0], back = invert(frame);
  const { x0, y0, x1, y1 } = box.local ?? { x0: box.corners[0].x, y0: box.corners[0].y, x1: box.corners[2].x, y1: box.corners[2].y };
  const p = apply(back, pos.x, pos.y);
  const anchor = { x: px > 0 ? x0 : px < 0 ? x1 : (x0 + x1) / 2, y: py > 0 ? y0 : py < 0 ? y1 : (y0 + y1) / 2 };
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
  if (shift) angle = Math.round(angle / SNAP) * SNAP;
  const w = rotation(angle, center.x, center.y);
  reshape(project, drag, (shape) => multiply(w, shape.m));
}

// Points mode: a press on a handle, a point or the outline of the shape being edited, or null (anything else).
// Hits are in grid pixels; the drag works in the shape's own (local) pixels.
function pointsPress(project, workspace, pos, unit, radius) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key);
  const world = worldPoints(shape), start = (kind, i, extra = {}) => {
    workspace.vectorPoint = i;
    project.beginEdit();
    drag = { kind, key, i, from: apply(invert(shape.m), pos.x, pos.y), start: project.shapes.get(key), ...extra };
    return true;
  };
  for (let i = 0; i < world.length; i++) {
    for (const which of ['in', 'out']) if (world[i][which] && near(pos, world[i][which], unit, radius)) return start('handle', i, { which });
  }
  const i = world.findIndex((p) => near(pos, p, unit, radius));
  if (i >= 0) return start('point', i);
  const on = nearestOnOutline(shape, pos.x, pos.y);
  if (on.segment >= 0 && on.distance * unit.x <= radius) {
    project.beginEdit();
    project.updateShapes([[key, splitAt(shape, on.segment, on.t)]]);
    return start('point', on.segment + 1);
  }
  return null;
}

function pointsMove(project, to) {
  const local = apply(invert(drag.start.m), to.x, to.y), { start, i } = drag;
  const next = drag.kind === 'handle' ? moveHandle(start, i, drag.which, local.x, local.y) : movePoint(start, i, local.x - drag.from.x, local.y - drag.from.y);
  project.updateShapes([[drag.key, next]]);
}

let drag = null, lastPress = null;

const selected = (workspace, project) => workspace.vectorSelected.filter((key) => project.shapes.has(key));

export default {
  id: 'vselect',
  get title() { return t('tools.vselect.title'); },
  keys: ['V'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M160 96C160 83.1 167.8 71.4 179.8 66.4C191.8 61.4 205.5 64.2 214.7 73.4L534.7 393.4C543.9 402.6 546.6 416.3 541.6 428.3C536.6 440.3 524.9 448 512 448L374.6 448L436.3 571.5C444.2 587.3 437.8 606.5 422 614.4C406.2 622.3 387 615.9 379.1 600.1L316.3 474.5L214.6 566.6C205.2 575.1 191.7 577.3 180.1 572.2C168.5 567.1 160 555.6 160 542.9L160 96z"/></svg>`,
  views: ['vector'],
  kind: 'paint',
  section: 'vector',

  begin({ project, workspace, unit }, pos, event) {
    const shift = !!event?.shiftKey, radius = handleRadius(), tol = radius / unit.x;
    if (workspace.vectorPoints && project.shapes.has(workspace.vectorPoints)) {
      if (pointsPress(project, workspace, pos, unit, radius)) return true;
      const hit = shapeAt(project.shapes, pos.x, pos.y, tol);
      if (hit === workspace.vectorPoints) return false; // inside it: still editing its points
      workspace.vectorPoints = workspace.vectorPoint = null; // and the selection stays, unless it's another shape
      if (!hit) return false;
    }
    const keys = selected(workspace, project), box = selectionBox(project.shapes, keys);
    const at = (kind, extra = {}) => {
      drag = { kind, from: pos, box, start: (extra.keys ?? keys).map((key) => [key, project.shapes.get(key)]), shift, ...extra };
      project.beginEdit();
      return true;
    };
    if (box && !shift) {
      const { handles, knob } = boxHandles(box, unit);
      if (near(pos, knob, unit, radius)) return at('rotate');
      const handle = handles.findIndex((h) => near(pos, h, unit, radius));
      if (handle >= 0) return at('scale', { handle });
    }
    const hit = shapeAt(project.shapes, pos.x, pos.y, tol);
    const now = performance.now(), again = hit && lastPress?.key === hit && now - lastPress.time < DOUBLE_MS
      && near(pos, lastPress.pos, unit, DOUBLE_PX);
    lastPress = { key: hit, time: now, pos };
    if (shift) {
      if (hit) workspace.vectorSelected = keys.includes(hit) ? keys.filter((key) => key !== hit) : [...keys, hit];
      return false;
    }
    // A second click on a shape (pressed and let go without moving) edits its points: see end.
    if (box && inside(box.corners, pos)) return at('move', { again: again && hit });
    if (hit) {
      workspace.vectorSelected = [hit];
      workspace.vectorPoints = null;
      return at('move', { keys: [hit], box: selectionBox(project.shapes, [hit]), again: again && hit });
    }
    workspace.vectorSelected = [];
    workspace.vectorPoints = null;
    return false;
  },

  move({ project, workspace }, from, to) {
    if (!drag) return;
    const shift = workspace.isShiftPressed;
    drag.moved ||= to.x !== drag.from.x || to.y !== drag.from.y;
    if (drag.kind === 'point' || drag.kind === 'handle') pointsMove(project, to);
    else if (drag.kind === 'move') reshape(project, drag, (shape) => transformed(shape, translation(to.x - drag.from.x, to.y - drag.from.y)).m);
    else if (drag.kind === 'scale') scaleTo(project, drag, to, shift);
    else rotateTo(project, drag, to, shift);
  },

  end({ project, workspace }) {
    if (!drag) return;
    const { again, moved } = drag;
    drag = null;
    project.commitEdit();
    if (again && !moved) {
      workspace.vectorSelected = [again];
      workspace.vectorPoints = again;
      workspace.vectorPoint = null;
    }
  },

  cancel() {
    drag = null; // the viewport took the edit back
  },

  keydown({ project, workspace }, event) {
    const keys = selected(workspace, project), [dx, dy] = ARROWS[event.key] ?? [];
    if (event.key === 'Escape') {
      if (workspace.vectorPoints) workspace.vectorPoints = workspace.vectorPoint = null;
      else if (keys.length) workspace.vectorSelected = [];
      else return false;
      return true;
    }
    if (!keys.length || event.metaKey || event.ctrlKey || event.altKey) return false;
    if ((event.key === 'Delete' || event.key === 'Backspace') && workspace.vectorPoints && workspace.vectorPoint !== null) {
      deleteSelectedPoint(project, workspace);
      return true;
    }
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

// The point selected in points mode deleted; with under two left, the shape goes, and points mode with it.
export function deleteSelectedPoint(project, workspace) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key);
  if (!shape || workspace.vectorPoint === null) return;
  const next = deletePoint(shape, workspace.vectorPoint);
  project.updateShapes([[key, next]]);
  workspace.vectorPoint = null;
  if (!next) workspace.vectorPoints = null;
}

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
