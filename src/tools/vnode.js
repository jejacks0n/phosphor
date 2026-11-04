// The Node tool (the VECTOR tab): press a shape to edit its points (workspace.vectorPoints), and on one of its
// points, its curve handles or (once it's being edited) its outline: drag a point or a handle (Alt: the handle
// alone, broken from its partner; Shift: on a line across, up and down or at 45°), click the outline to add a
// point there, click empty canvas to stop. Each drag is one edit, worked out each move from the shape as it was
// at the press. Keys: Delete or Backspace deletes the selected point, Esc stops editing points; the rest are
// Vector select's (the arrows, Delete with no point selected, Esc then).
import { t } from '@/i18n/index.js';
import { apply, deletePoint, invert, moveHandle, movePoint, nearestOnOutline, splitAt, worldPoints } from '@/document/shapes.js';
import { snappedEnd } from '@/tools/shapes.js';
import { shapeAt } from '@/lib/shapeHits.js';
import vselect, { handleRadius } from '@/tools/vselect.js';

let drag = null; // { kind: 'point' | 'handle', key, i, at, from, start, which?, alone?, anchor? }

const near = (a, b, unit, radius) => Math.hypot((a.x - b.x) * unit.x, (a.y - b.y) * unit.y) <= radius;

// A press on the edited shape's handle, point or (with add) outline, or false. Hits are in grid pixels; the
// drag works in the shape's own (local) pixels.
function pointsPress(project, workspace, pos, unit, radius, { event, add = true } = {}) {
  const key = workspace.vectorPoints, shape = project.shapes.get(key);
  const world = worldPoints(shape), start = (kind, i, extra = {}) => {
    workspace.vectorPoint = i;
    project.beginEdit();
    drag = { kind, key, i, at: pos, from: apply(invert(shape.m), pos.x, pos.y), start: project.shapes.get(key), ...extra };
    return true;
  };
  for (let i = 0; i < world.length; i++) {
    for (const which of ['in', 'out']) if (world[i][which] && near(pos, world[i][which], unit, radius)) return start('handle', i, { which, alone: !!event?.altKey, anchor: world[i] });
  }
  const i = world.findIndex((p) => near(pos, p, unit, radius));
  if (i >= 0) return start('point', i);
  const on = add && nearestOnOutline(shape, pos.x, pos.y);
  if (on && on.segment >= 0 && on.distance * unit.x <= radius) {
    project.beginEdit();
    project.updateShapes([[key, splitAt(shape, on.segment, on.t)]]);
    return start('point', on.segment + 1);
  }
  return false;
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

  begin({ project, workspace, unit }, pos, event) {
    const radius = handleRadius();
    if (workspace.vectorPoints && project.shapes.has(workspace.vectorPoints) && pointsPress(project, workspace, pos, unit, radius, { event })) return true;
    const hit = shapeAt(project.shapes, pos.x, pos.y, radius / unit.x);
    if (hit === workspace.vectorPoints && hit) return false; // inside it: still editing its points
    workspace.vectorPoint = null;
    workspace.vectorPoints = hit; // another shape's points (a press on one of them takes it at once), or none
    if (!hit) return false; // the selection stays
    project.selectShapes([hit]);
    return pointsPress(project, workspace, pos, unit, radius, { event, add: false });
  },

  move({ project, workspace }, from, to) {
    if (!drag) return;
    // Shift: a point on a line from where it was pressed, a handle on one from its point.
    if (workspace.isShiftPressed) to = snappedEnd(drag.kind === 'handle' ? drag.anchor : drag.at, to);
    const local = apply(invert(drag.start.m), to.x, to.y), { start, i } = drag;
    const next = drag.kind === 'handle' ? moveHandle(start, i, drag.which, local.x, local.y, { alone: drag.alone }) : movePoint(start, i, local.x - drag.from.x, local.y - drag.from.y);
    project.updateShapes([[drag.key, next]]);
  },

  end({ project }) {
    if (!drag) return;
    drag = null;
    project.commitEdit();
  },

  cancel() {
    drag = null; // the viewport took the edit back
  },

  keydown(ctx, event) {
    const { project, workspace } = ctx;
    if (workspace.vectorPoints && !event.metaKey && !event.ctrlKey && !event.altKey) {
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
