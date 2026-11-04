// The Node tool (the VECTOR tab): press a shape to edit its points (workspace.vectorPoints), and on one of its
// points, its curve handles or (once it's being edited) its outline: drag a point or a handle (Alt: the handle
// alone, broken from its partner; Shift: on a line across, up and down or at 45°; Snap to: a point on the grid),
// click the outline to add a
// point there, click empty canvas to stop. A shape with a gradient (made in the color box) shows its handles too
// (gradientHandles.js). A press takes the gradient's handle in reach, else the point or handle nearest it, else the
// gradient's line, else the outline; with no zoom to part handles on top of each other, a click again in the same
// place takes the next one there (pick), and a drag after moves that one. Each drag is one
// edit, worked out each move from the shape as it was at the press. Keys: Delete or Backspace deletes the
// selected stop or point, Esc lets a stop go or stops editing; the rest are Vector select's (the arrows, Delete
// with nothing selected, Esc then).
import { t } from '@/i18n/index.js';
import { apply, deletePoint, invert, moveHandle, movePoint, nearestOnOutline, splitAt, worldPoints } from '@/document/shapes.js';
import { snappedEnd } from '@/tools/shapes.js';
import { snapAlong, snapMode, snapPoint } from '@/lib/vectorSnap.js';
import { shapeAt } from '@/lib/shapeHits.js';
import { gradientDrag, removeStop } from '@/tools/gradientHandles.js';
import { handlePicker } from '@/tools/handlePick.js';
import vselect, { handleRadius } from '@/tools/vselect.js';

let drag = null; // { kind: 'point' | 'handle', key, i, at, from, start, which?, alone?, anchor? }
const pick = handlePicker();

// The edited shape's points and curve handles in reach of pos, as handlePick's candidates (the drag in the
// shape's own, local, pixels).
function pointCandidates(project, workspace, pos, unit, radius, event) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key), out = [];
  const take = (kind, i, extra = {}) => () => {
    workspace.vectorPoint = i;
    workspace.vectorStop = null;
    project.beginEdit();
    drag = { kind, key, i, at: pos, from: apply(invert(shape.m), pos.x, pos.y), start: project.shapes.get(key), ...extra };
    return true;
  };
  const d = (p) => Math.hypot((p.x - pos.x) * unit.x, (p.y - pos.y) * unit.y);
  worldPoints(shape).forEach((p, i) => {
    const picked = () => {
      workspace.vectorPoint = i;
      workspace.vectorStop = null;
    };
    for (const which of ['in', 'out']) if (p[which]) out.push({ id: `${which}${i}`, d: d(p[which]), picked, take: take('handle', i, { which, alone: !!event?.altKey, anchor: p }) });
    out.push({ id: `p${i}`, d: d(p), picked, take: take('point', i) });
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

// The point selected deleted; with under two left, the shape goes, and its points with it.
export function deleteSelectedPoint(project, workspace) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key);
  if (!shape || workspace.vectorPoint === null) return;
  const next = deletePoint(shape, workspace.vectorPoint);
  project.updateShapes([[key, next]]);
  workspace.vectorPoint = null;
  if (!next) workspace.vectorPoints = null;
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
    if (hit === workspace.vectorPoints && hit) return false; // inside it: still editing its points
    workspace.vectorPoint = workspace.vectorStop = null;
    workspace.vectorPoints = hit; // another shape's points (a press on one of them takes it at once), or none
    if (!hit) return false; // the selection stays
    project.selectShapes([hit]);
    return handlesPress(ctx, pos, radius, event);
  },

  move(ctx, from, to) {
    pick.move(to, ctx.unit);
    if (gradientDrag.active) return gradientDrag.move(ctx, from, to);
    const { project, workspace } = ctx;
    if (!drag) return;
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
      next = movePoint(start, i, b.x - a.x, b.y - a.y);
    }
    project.updateShapes([[drag.key, next]]);
  },

  end(ctx) {
    const { project } = ctx;
    if (gradientDrag.active) gradientDrag.end(ctx);
    else if (drag) {
      drag = null;
      project.commitEdit();
    }
    pick.end();
  },

  cancel(ctx) {
    drag = null; // the viewport took the edit back
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
      if ((event.key === 'Delete' || event.key === 'Backspace') && workspace.vectorPoint !== null) {
        deleteSelectedPoint(project, workspace);
        return true;
      }
    }
    return vselect.keydown(ctx, event);
  },
};
