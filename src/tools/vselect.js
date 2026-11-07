// Vector select (the VECTOR tab): click a shape to select it (Shift adds or takes it away), or drag a box over
// empty canvas to select every shape it touches (Shift: adds them); each change of the selection is an undo
// step (selectShapes). Then drag inside the box to move (Shift: straight across, up and down, or at 45°), a handle to scale (Shift keeps the proportions, Alt scales from the middle)
// or the knob above it to rotate (Shift: one shape to angles in steps of 15°, several by them). A second click on a shape edits its points with the
// Node tool (vnode.js); on an art layer it steps into it instead (enterArt), to the ANSI tab. One shape selected, its gradient's ends and stops show and drag as the Node tool's do
// (gradientHandles.js; a click on a stop selects it), and so do the Start and End handles on the outline of a shape with those rows in the Keys panel (trimHandles), ahead of the box's handles where they're near (handlePick: a
// click again takes the next one there). Each drag is one edit, worked out each move from the shapes as they were at the press,
// so nothing drifts. An art layer moves by whole cells (a column across, a line down, whatever Snap to says) and has no size or turn handles, alone or with other shapes. Keys: arrows nudge a grid pixel (Shift: 10; an art layer's a cell), Delete or Backspace deletes (the selected stop,
// or else the shapes), Esc lets the stop go or deselects.
// A follower (on its path: placedShapes) is shown, boxed and turned or scaled where it shows; the record keeps its own
// transform under the placement (reshape). Dragged alone it slides along its path instead (slideTo), and the arrows
// step its Along by 1% (Shift: 10%); moving with its path's Start or End, neither moves it. While Follow a path… picks
// (workspace.pickingPath), a click on a shape that can be a path (pathAt) links the picker to it, and Esc or a click on
// empty canvas ends the pick; either way nothing else happens.
import { t } from '@/i18n/index.js';
import { isArt } from '@/document/artLayers.js';
import { allClosed, apply, curveBounds, invert, localBounds, multiply, nearestOnOutline, rotation, scaling, translation, transformed, withShape } from '@/document/shapes.js';
import { listedParts } from '@/document/keys.js';
import { lifeAt } from '@/document/tweens.js';
import { measure } from '@/document/pathLength.js';
import { snappedEnd } from '@/tools/shapes.js';
import { snapAlong, snapMode, snapPoint } from '@/lib/vectorSnap.js';
import { shapeAt, shapesTouching } from '@/lib/shapeHits.js';
import { gradientDrag, removeStop } from '@/tools/gradientHandles.js';
import { centerOf, placedShapes } from '@/document/followers.js';
import { DOUBLE_MS, DOUBLE_PX, handlePicker } from '@/tools/handlePick.js';

const REACH = 22;          // CSS px from a trim handle that a press takes it (a 44px hit area)
const KNOB = 24;           // CSS px above the box's top edge
const SNAP = Math.PI / 12; // 15°

// The handles' radius in CSS px: bigger under a finger.
export const handleRadius = () => (matchMedia('(pointer: coarse)').matches ? 14 : 6);

// The selection's box in grid pixels: one shape's own (turned with it), or several's together, square to the
// grid. corners run top-left, top-right, bottom-right, bottom-left. cells: an art layer is in it, so it only moves.
export function selectionBox(shapes, keys) {
  const chosen = keys.map((key) => shapes.get(key)).filter(Boolean);
  if (!chosen.length) return null;
  const cells = chosen.some(isArt);
  if (chosen.length === 1) {
    const shape = chosen[0], { x0, y0, x1, y1 } = localBounds(shape);
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => apply(shape.m, x, y));
    return { corners, center: apply(shape.m, (x0 + x1) / 2, (y0 + y1) / 2), local: { m: shape.m, x0, y0, x1, y1 }, cells };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const shape of chosen) {
    const b = curveBounds(shape); // round the curves, not their handles, as one shape's box is
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  return { corners: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, local: null, cells };
}

// The one selected shape's Start and End handles, for the parts it has a row for in the Keys panel (so only with Animate
// on): { key, shape (where it shows: placedShapes), handles: [{ part, share, at }] } with at in grid pixels on the
// outline; or null.
export function trimHandles(project, workspace) {
  const chosen = workspace.vectorSelected.filter((key) => project.shapes.has(key));
  if (!project.animate || !project.hasFrames || workspace.activeTool !== 'vselect' || chosen.length !== 1) return null;
  const [key] = chosen, shape = placedShapes(project).get(key), life = lifeAt(project.frames, key, project.frame)[0];
  if (isArt(shape) || life === undefined) return null;
  const listed = listedParts(project.frames, key, life), along = measure(shape);
  const handles = ['start', 'end'].filter((part) => listed.includes(part)).map((part) => {
    const share = shape[part] ?? (part === 'end' ? 1 : 0);
    return { part, share, at: along.at(share) };
  });
  return handles.length ? { key, shape, handles } : null;
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// The 8 handles (corners, then the edges' middles: top, right, bottom, left) and the knob, in grid pixels.
// unit: CSS px per grid pixel, so the knob sits KNOB CSS px out from the top edge, along the box's own up.
// A box with an art layer in it has none: no handles and no knob (knob null).
export function boxHandles(box, unit) {
  const [tl, tr, br, bl] = box.corners, top = mid(tl, tr);
  if (box.cells) return { handles: [], top, knob: null };
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

// The shapes as they were at the press, each changed by change(shown, placed) → its new transform (or null: as it
// was), where it shows (placed: a follower on its path). A follower's record gets the transform that its placement
// (shown.m over its own m: the move onto the path, and Face the path's turn) carries to that.
function reshape(project, drag, change) {
  const changes = [];
  for (const [key, shape, shown] of drag.start) {
    const m = change(shown, shown !== shape);
    if (m) changes.push([key, withShape(shape, { m: shown === shape ? m : multiply(shape.m, multiply(invert(shown.m), m)) })]); // one the document wouldn't keep, it doesn't take
  }
  project.updateShapes(changes);
}

// A share of a path held to it: 0 through 1 (on a closed path, round past either end), to 1/10000.
function heldShare(path, share) {
  const held = !allClosed(path) ? Math.min(1, Math.max(0, share)) : share < 0 || share > 1 ? share - Math.floor(share) : share;
  return Math.round(held * 1e4) / 1e4;
}

// The one follower dragged: its Along set to the share of its path nearest where its middle is dragged, keyed on the
// frame showing. Moving with the path's Start or End, it stays.
function slideTo(project, drag, to) {
  const [[key, shape, shown]] = drag.start, path = placedShapes(project).get(shape.follow.key);
  if (shape.follow.ride || !path) return;
  const c = centerOf(shown), near = nearestOnOutline(path, c.x + to.x - drag.from.x, c.y + to.y - drag.from.y);
  if (near.segment < 0) return;
  project.updateShapes([[key, withShape(shape, { along: heldShare(path, measure(path).shareOf(near.segment, near.t)) })]]);
}

// Follow a path…'s pick: the key of the shape under pos that the picker could follow (one with an outline, not an art
// layer, not a follower, not the picker), or null. Hits are where shapes show, a guide on its outline.
export function pathAt(project, picker, pos, tol) {
  const placed = placedShapes(project), key = shapeAt(placed, pos.x, pos.y, tol), shape = placed.get(key);
  return key && key !== picker && !isArt(shape) && !shape.follow ? key : null;
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

// A trim handle dragged: its part set to the share of the outline nearest the pointer (on the shape where it shows),
// held to 0 through 1.
function trimTo(project, workspace, drag, pos) {
  const [key, shape] = drag.start[0], near = nearestOnOutline(drag.placed, pos.x, pos.y);
  if (near.segment < 0) return;
  const share = Math.min(1, Math.max(0, Math.round(measure(drag.placed).shareOf(near.segment, near.t) * 1e4) / 1e4));
  workspace.vectorTrim = { part: drag.part, share };
  project.updateShapes([[key, withShape(shape, { [drag.part]: share })]]);
}

let drag = null, lastPress = null;
const pick = handlePicker();

// A drag of the box's (or a marquee) let go: a second click on a shape, not moved, edits its points (on an art layer,
// steps into it).
function endDrag(project, workspace) {
  if (!drag) return;
  const { again, enter, moved, kind, keys, shift } = drag;
  drag = null;
  if (kind === 'marquee') {
    const box = workspace.vectorMarquee;
    workspace.vectorMarquee = null;
    const touched = box ? shapesTouching(placedShapes(project), box) : [];
    if (box || !shift) project.selectShapes(shift ? [...keys, ...touched.filter((key) => !keys.includes(key))] : touched);
    return;
  }
  workspace.vectorTrim = null;
  project.commitEdit();
  if (again && !moved) {
    workspace.vectorSelected = [again];
    workspace.setActiveTool('vnode');
    workspace.vectorPoints = again;
    workspace.vectorPoint = null;
  } else if (enter && !moved && project.enterArt(enter)) workspace.editorTab = 'output';
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
    const placed = placedShapes(project), keys = selected(workspace, project), box = selectionBox(placed, keys); // where they show
    // A drag of the shapes, each [key, record, where it shows]; of one follower on its path alone, a slide along it.
    const at = (kind, extra = {}) => {
      const start = (extra.keys ?? keys).map((key) => [key, project.shapes.get(key), placed.get(key)]);
      if (kind === 'move' && start.length === 1 && start[0][1] !== start[0][2]) kind = 'slide';
      drag = { kind, from: pos, box, start, shift, ...extra };
      project.beginEdit();
      return true;
    };
    if (workspace.pickingPath) { // Follow a path…: a click picks the path, or on empty canvas, ends the pick
      const path = pathAt(project, workspace.pickingPath, pos, tol);
      if (path) project.followPath(workspace.pickingPath, path);
      if (path || !shapeAt(placed, pos.x, pos.y, tol)) workspace.pickingPath = null;
      return false;
    }
    if (box && !shift) {
      // The box's handles and the knob, and (one shape) its gradient's, which come first; or a click again's.
      const { handles, knob } = boxHandles(box, unit), letStop = () => { workspace.vectorStop = null; };
      const d = (p) => Math.hypot((p.x - pos.x) * unit.x, (p.y - pos.y) * unit.y);
      const trim = trimHandles(project, workspace);
      const trims = (trim?.handles ?? []).map(({ part, at: place }) => ({ id: part, d: d(place), take: () => at('trim', { part, placed: trim.shape }) }));
      const own = box.cells ? [] : [{ id: 'knob', d: d(knob), take: () => at('rotate'), picked: letStop }, ...handles.map((h, handle) => ({ id: `h${handle}`, d: d(h), take: () => at('scale', { handle, grip: h }), picked: letStop }))];
      if (pick.press([...trims.filter((c) => c.d <= REACH), ...own.filter((c) => c.d <= radius), ...gradientDrag.candidates(ctx, pos, radius)], pos, unit)) return true;
    } else pick.reset();
    const hit = shapeAt(placed, pos.x, pos.y, tol);
    // A second click edits points; an art layer has none, so it steps into the layer (see endDrag).
    const now = performance.now(), second = hit && lastPress?.key === hit && now - lastPress.time < DOUBLE_MS && near(pos, lastPress.pos, unit, DOUBLE_PX);
    const art = isArt(project.shapes.get(hit)), again = second && !art, enter = second && art;
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
    // A second click on a shape (pressed and let go without moving) edits its points, or steps into an art layer: see end.
    if (box && inside(box.corners, pos)) return at('move', { again: again && hit, enter: enter && hit });
    if (hit) {
      project.selectShapes([hit]);
      return at('move', { keys: [hit], box: selectionBox(placed, [hit]), again: again && hit, enter: enter && hit });
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
    if (drag.kind === 'trim') return trimTo(project, workspace, drag, to);
    if (drag.kind === 'slide') return slideTo(project, drag, to);
    const snap = snapMode(workspace);
    if (drag.kind === 'move') {
      const end = shift ? snappedEnd(drag.from, to) : to;
      if (drag.box.cells) {
        // An art layer is on whole cells: the pointer's way, in whole cells, whatever Snap to says.
        const by = snapPoint({ x: end.x - drag.from.x, y: end.y - drag.from.y }, 'cells');
        return reshape(project, drag, (shape, placed) => !placed && transformed(shape, translation(by.x, by.y)).m);
      }
      // Snap to: the box's corner nearest the grab on the grid (along Shift's line), the shapes with it.
      const corner = drag.box.corners.reduce((a, b) => (Math.hypot(b.x - drag.from.x, b.y - drag.from.y) < Math.hypot(a.x - drag.from.x, a.y - drag.from.y) ? b : a));
      const moved = { x: corner.x + end.x - drag.from.x, y: corner.y + end.y - drag.from.y };
      const at = shift ? snapAlong(corner, moved, snap) : snapPoint(moved, snap);
      reshape(project, drag, (shape, placed) => !placed && transformed(shape, translation(at.x - corner.x, at.y - corner.y)).m); // a follower stays on its path
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
    if (gradientDrag.active) {
      if (gradientDrag.end(ctx)) return pick.reset(); // a stop's color opened
    } else endDrag(project, workspace);
    pick.end();
  },

  cancel(ctx) {
    drag = null; // the viewport took the edit back
    ctx.workspace.vectorMarquee = null;
    ctx.workspace.vectorTrim = null;
    gradientDrag.cancel(ctx);
    pick.reset();
  },

  keydown({ project, workspace }, event) {
    const keys = selected(workspace, project), [dx, dy] = ARROWS[event.key] ?? [];
    if (workspace.pickingPath && event.key === 'Escape') {
      workspace.pickingPath = null;
      return true;
    }
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
      const before = project.shapes;
      project.deleteShapes(keys);
      if (project.shapes !== before) workspace.vectorSelected = []; // or refused (a layer someone's drawing in): still selected
      return true;
    }
    if (dx === undefined) return false;
    const step = event.shiftKey ? 10 : 1, tall = keys.some((key) => isArt(project.shapes.get(key))) ? 2 : 1; // a cell is two grid pixels tall
    const placed = placedShapes(project);
    project.updateShapes(keys.map((key) => {
      const shape = project.shapes.get(key);
      if (placed.get(key) === shape) return [key, transformed(shape, translation(dx * step, dy * step * tall))];
      const path = placed.get(shape.follow.key); // on its path: along it, right and down forward
      return [key, shape.follow.ride ? shape : withShape(shape, { along: heldShare(path, (shape.along ?? 0) + (dx + dy) * step / 100) })];
    }));
    return true;
  },
};

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
