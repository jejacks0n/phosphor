// The Node tool (the VECTOR tab): press a shape to edit its points (workspace.vectorPoints), and on one of its
// points, its curve handles or (once it's being edited) its outline: drag a point or a handle (Alt: the handle
// alone, broken from its partner; Shift: on a line across, up and down or at 45°; Snap to: a point on the grid),
// click the outline to add a
// point there, click empty canvas to stop. Shift-click a point to take it too (or let it go), or drag a box from
// empty canvas (or from inside the shape) over points to take them (Shift: as well); a drag of one moves them all,
// and Delete deletes them all. With no shape edited, a box takes the top shape with points in it. A shape with a gradient (made in the color box) shows its handles too
// (gradientHandles.js). A press takes the gradient's handle in reach, else the point or handle nearest it, else the
// gradient's line, else the outline; with no zoom to part handles on top of each other, a click again in the same
// place takes the next one there (pick), and a drag after moves that one. Each drag is one
// edit, worked out each move from the shape as it was at the press. Keys: Delete or Backspace deletes the
// selected stop or point, Esc lets a stop go or stops editing; the rest are Vector select's (the arrows, Delete
// with nothing selected, Esc then).
import { t } from '@/i18n/index.js';
import { allPoints, apply, deletePoint, invert, moveHandle, movePoint, nearestOnOutline, splitAt, stacked, worldPoints } from '@/document/shapes.js';
import { snappedEnd } from '@/tools/shapes.js';
import { snapAlong, snapMode, snapPoint } from '@/lib/vectorSnap.js';
import { shapeAt } from '@/lib/shapeHits.js';
import { gradientDrag, removeStop } from '@/tools/gradientHandles.js';
import { handlePicker } from '@/tools/handlePick.js';
import vselect, { handleRadius } from '@/tools/vselect.js';

let drag = null; // { kind: 'point' | 'handle', key, i, at, start, all?, which?, alone?, anchor? } or { kind: 'marquee', from, shift, empty }
const pick = handlePicker();

// The edited shape's points selected: vectorPoint (the last taken, the one the Point row shows) and those taken
// with it (vectorPicked, by Shift or a box). A vectorPoint set on its own, not among them, is the only one. Given
// the shape, only those it still has (an undo or a room's change may have taken some).
export function pickedPoints({ vectorPoint: i, vectorPicked: all }, shape = null) {
  const list = i === null ? [] : all.includes(i) ? all : [i];
  return shape ? list.filter((j) => j < allPoints(shape).length) : list;
}
function choose(workspace, list) {
  workspace.vectorPicked = [...new Set(list)];
  workspace.vectorPoint = list.at(-1) ?? null;
  workspace.vectorStop = null;
}

// The edited shape's points and curve handles in reach of pos, as handlePick's candidates (the drag in the
// shape's own, local, pixels).
function pointCandidates(project, workspace, pos, unit, radius, event) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key), out = [], shift = !!event?.shiftKey;
  const start = (kind, i, extra) => {
    project.beginEdit();
    drag = { kind, key, i, at: pos, start: project.shapes.get(key), ...extra };
    return true;
  };
  // A point: with Shift, taken too (or, taken already, let go); one of those taken keeps them all, to drag together.
  const takePoint = (i) => () => {
    const was = pickedPoints(workspace), on = was.includes(i), rest = was.filter((j) => j !== i);
    if (shift && on) return choose(workspace, rest), true;
    choose(workspace, shift || on ? [...rest, i] : [i]);
    return start('point', i, { all: pickedPoints(workspace, shape) });
  };
  const d = (p) => Math.hypot((p.x - pos.x) * unit.x, (p.y - pos.y) * unit.y);
  worldPoints(shape).forEach((p, i) => {
    const picked = () => choose(workspace, [i]);
    const takeHandle = (which) => () => (choose(workspace, [i]), start('handle', i, { which, alone: !!event?.altKey, anchor: p }));
    for (const which of ['in', 'out']) if (p[which]) out.push({ id: `${which}${i}`, d: d(p[which]), picked, take: takeHandle(which) });
    out.push({ id: `p${i}`, d: d(p), picked, take: takePoint(i) });
  });
  return out.filter((c) => c.d <= radius);
}

// A press on the edited shape's handles, its gradient's or its points' (handlePick: the gradient's first).
function handlesPress(ctx, pos, radius, event) {
  const { project, workspace, unit } = ctx;
  return pick.press([...gradientDrag.candidates(ctx, pos, radius), ...pointCandidates(project, workspace, pos, unit, radius, event)], pos, unit);
}

// A click on the edited shape's outline: a point added there, the curve kept, and taken.
function outlinePress(project, workspace, pos, unit, radius) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key), on = nearestOnOutline(shape, pos.x, pos.y);
  if (!on || on.segment < 0 || on.distance * unit.x > radius) return false;
  project.beginEdit();
  project.updateShapes([[key, splitAt(shape, on.segment, on.t)]]);
  return pointCandidates(project, workspace, pos, unit, radius).find((c) => c.id === `p${on.segment + 1}`).take();
}

// The points selected deleted, as one step; an outline left with under two goes, and the shape with its last.
export function deleteSelectedPoint(project, workspace) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key), all = shape ? pickedPoints(workspace, shape) : [];
  if (!shape || !all.length) return;
  let next = shape;
  for (const i of [...all].sort((a, b) => b - a)) if (next) next = deletePoint(next, i); // the last first: the rest keep their places
  project.updateShapes([[key, next]]);
  choose(workspace, []);
  if (!next) workspace.vectorPoints = null;
}

// The points (indices) of a shape in a box, grid pixels.
const pointsIn = (shape, { x0, y0, x1, y1 }) => worldPoints(shape).flatMap((p, i) => (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 ? [i] : []));

// A box let go: the edited shape's points in it taken (Shift: as well); with none edited, the top shape with
// points in it edited, those taken. Let go where it was pressed: a click, on empty canvas, stops editing.
function endMarquee(project, workspace) {
  const { shift, empty } = drag, box = workspace.vectorMarquee;
  drag = workspace.vectorMarquee = null;
  if (!box) {
    if (empty && !shift) workspace.vectorPoints = workspace.vectorPoint = null;
    return;
  }
  let key = project.shapes.has(workspace.vectorPoints) ? workspace.vectorPoints : null;
  if (!key) {
    key = stacked(project.shapes).reverse().find(([, shape]) => pointsIn(shape, box).length)?.[0];
    if (!key) return;
    workspace.vectorPoints = key;
    project.selectShapes([key]);
    choose(workspace, []);
  }
  const inside = pointsIn(project.shapes.get(key), box);
  choose(workspace, shift ? [...pickedPoints(workspace), ...inside] : inside);
}

export default {
  id: 'vnode',
  get title() { return t('tools.vnode.title'); },
  keys: ['A'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path fill-rule="evenodd" d="M160 96C160 83.1 167.8 71.4 179.8 66.4C191.8 61.4 205.5 64.2 214.7 73.4L534.7 393.4C543.9 402.6 546.6 416.3 541.6 428.3C536.6 440.3 524.9 448 512 448L374.6 448L436.3 571.5C444.2 587.3 437.8 606.5 422 614.4C406.2 622.3 387 615.9 379.1 600.1L316.3 474.5L214.6 566.6C205.2 575.1 191.7 577.3 180.1 572.2C168.5 567.1 160 555.6 160 542.9L160 96zM208 154L208 505L327 398L405 553L414 548L335 400L470 400z"/></svg>`,
  views: ['vector'],
  kind: 'paint',
  section: 'vector',
  begin(ctx, pos, event) {
    const { project, workspace, unit } = ctx, radius = handleRadius();
    if (workspace.vectorPoints && project.shapes.has(workspace.vectorPoints)) {
      if (handlesPress(ctx, pos, radius, event) || gradientDrag.line(ctx, pos, radius) || outlinePress(project, workspace, pos, unit, radius)) return true;
    }
    const hit = shapeAt(project.shapes, pos.x, pos.y, radius / unit.x);
    if (!hit || hit === workspace.vectorPoints) { // empty canvas, or inside the shape edited: a box over points (end)
      drag = { kind: 'marquee', from: pos, shift: !!event?.shiftKey, empty: !hit };
      return true;
    }
    choose(workspace, []);
    workspace.vectorPoints = hit; // another shape's points (a press on one of them takes it at once)
    project.selectShapes([hit]);
    return handlesPress(ctx, pos, radius, event);
  },

  move(ctx, from, to) {
    pick.move(to, ctx.unit);
    if (gradientDrag.active) return gradientDrag.move(ctx, from, to);
    const { project, workspace } = ctx;
    if (!drag) return;
    if (drag.kind === 'marquee') {
      const f = drag.from;
      if (to.x !== f.x || to.y !== f.y) workspace.vectorMarquee = { x0: Math.min(f.x, to.x), y0: Math.min(f.y, to.y), x1: Math.max(f.x, to.x), y1: Math.max(f.y, to.y) };
      return;
    }
    // Shift: a point on a line from where it was pressed, a handle on one from its point.
    const shift = workspace.isShiftPressed;
    if (shift) to = snappedEnd(drag.kind === 'handle' ? drag.anchor : drag.at, to);
    const back = invert(drag.start.m), { start, i } = drag;
    let next;
    if (drag.kind === 'handle') {
      const local = apply(back, to.x, to.y);
      next = moveHandle(start, i, drag.which, local.x, local.y, { alone: drag.alone });
    } else {
      // The point where it was grabbed, moved with the pointer: on the grid with Snap to (along Shift's line).
      const was = worldPoints(start)[i], snap = snapMode(workspace);
      const moved = { x: was.x + to.x - drag.at.x, y: was.y + to.y - drag.at.y };
      const at = shift ? snapAlong(was, moved, snap) : snapPoint(moved, snap);
      const a = apply(back, was.x, was.y), b = apply(back, at.x, at.y);
      next = drag.all.reduce((shape, j) => movePoint(shape, j, b.x - a.x, b.y - a.y), start); // those taken with it too
    }
    project.updateShapes([[drag.key, next]]);
  },

  end(ctx) {
    const { project } = ctx;
    if (gradientDrag.active) gradientDrag.end(ctx);
    else if (drag?.kind === 'marquee') endMarquee(project, ctx.workspace);
    else if (drag) {
      drag = null;
      project.commitEdit();
    }
    pick.end();
  },

  cancel(ctx) {
    drag = null; // the viewport took the edit back
    ctx.workspace.vectorMarquee = null;
    pick.reset();
    gradientDrag.cancel(ctx);
  },

  keydown(ctx, event) {
    const { project, workspace } = ctx;
    if (workspace.vectorPoints && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (workspace.vectorStop !== null && ['Escape', 'Delete', 'Backspace'].includes(event.key)) {
        if (event.key === 'Escape') workspace.vectorStop = null;
        else removeStop(project, workspace);
        return true;
      }
      if (event.key === 'Escape') {
        workspace.vectorPoints = workspace.vectorPoint = null;
        return true;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && pickedPoints(workspace).length) {
        deleteSelectedPoint(project, workspace);
        return true;
      }
    }
    return vselect.keydown(ctx, event);
  },
};
