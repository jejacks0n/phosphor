// The Pen (the VECTOR tab): a click adds a corner point, a press and drag a smooth one whose handles follow the
// pointer (Shift: a point on a line from the last, a handle from its point, across, up and down or at 45°). The
// shape converts live as it's drawn, all one undo step (penPoint, finishPen). Clicking the first point (with 3
// or more) closes it; Enter or Esc leaves it an open curve; Backspace takes the last point away. A tool or tab
// change, a frame, undo or a save finishes it as an open curve (commitEdit).
import { t } from '@/i18n/index.js';
import { withShape, worldPoints } from '@/document/shapes.js';
import { handleRadius } from '@/tools/vselect.js';
import { snappedEnd } from '@/tools/shapes.js';

const SMOOTH_PX = 3; // a drag past this many CSS px makes the point smooth

let press = null; // { key, at, unit }: the point this press made

const near = (a, b, unit, radius) => Math.hypot((a.x - b.x) * unit.x, (a.y - b.y) * unit.y) <= radius;

export default {
  id: 'pen',
  get title() { return t('tools.pen.title'); },
  keys: ['P'],
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64L448 320L368 448H272L192 320ZM320 160L256 320L304 400H336L384 320ZM304 304A16 16 0 1 0 336 304A16 16 0 1 0 304 304ZM256 480H384V576H256Z"/></svg>',
  views: ['vector'],
  kind: 'paint',
  section: 'vector',

  begin({ project, workspace, unit }, pos) {
    const key = project._stroke?.pen, shape = key && project.shapes.get(key), world = shape ? worldPoints(shape) : [];
    if (world.length >= 3 && near(pos, world[0], unit, handleRadius())) {
      project.finishPen({ closed: true });
      return false;
    }
    if (world.length && workspace.isShiftPressed) pos = snappedEnd(world.at(-1), pos);
    const added = project.penPoint(pos.x, pos.y);
    press = added && { key: added, at: pos, unit };
    return !!press;
  },

  move({ project, workspace }, from, to) {
    const shape = press && project.shapes.get(press.key);
    if (!shape) return;
    if (workspace.isShiftPressed) to = snappedEnd(press.at, to);
    const out = { x: to.x - press.at.x, y: to.y - press.at.y };
    const smooth = Math.hypot(out.x * press.unit.x, out.y * press.unit.y) > SMOOTH_PX;
    const { x, y } = press.at;
    const point = smooth ? [x, y, -out.x, -out.y, out.x, out.y, 1] : [x, y, 0, 0, 0, 0, 0];
    project.updateShapes([[press.key, withShape(shape, { points: [...shape.points.slice(0, -1), point] })]]);
  },

  end() {
    press = null; // the shape's edit stays open for the next point
  },

  // A pinch: the point this press made goes (cancelEdit leaves the Pen's edit open).
  cancel({ project }) {
    if (press) project.penBack();
    press = null;
  },

  keydown({ project }, event) {
    if (!project._stroke?.pen || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === 'Enter' || event.key === 'Escape') project.finishPen({ closed: false });
    else if (event.key === 'Backspace' || event.key === 'Delete') project.penBack();
    else return false;
    return true;
  },
};
