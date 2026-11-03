// The Shape tool (the VECTOR tab): drag from corner to corner for a rectangle, an ellipse or a polygon
// (Sides: 3 to 12), drawn live and made an ordinary path, one undo step. Shift makes it a square, a circle
// or a regular polygon. It gets the next shape's style (workspace.vectorStyle) and is selected when it's
// made; a click without a drag makes nothing.
import { t } from '@/i18n/index.js';
import { ellipseShape, polygonShape, rectShape, styleColors, withShape } from '@/document/shapes.js';

let drag = null; // { from, key }

function shapeFor(workspace, from, to, square) {
  let dx = to.x - from.x, dy = to.y - from.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  const x0 = Math.min(from.x, from.x + dx), x1 = Math.max(from.x, from.x + dx);
  const y0 = Math.min(from.y, from.y + dy), y1 = Math.max(from.y, from.y + dy);
  const style = styleColors(workspace);
  if (!style.fill && !style.stroke) style.fill = workspace.editFgColor; // a shape that shows something
  const kind = workspace.vectorShapeKind;
  if (kind === 'ellipse') return ellipseShape(x0, y0, x1, y1, style);
  if (kind === 'polygon') return polygonShape(x0, y0, x1, y1, workspace.vectorSides, style);
  return rectShape(x0, y0, x1, y1, style);
}

export default {
  id: 'vshape',
  get title() { return t('tools.vshape.title'); },
  keys: ['U'],
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M96 128H352V384H96zM144 176V336H304V176zM448 256A112 112 0 1 1 448 480A112 112 0 1 1 448 256zM448 304A64 64 0 1 0 448 432A64 64 0 1 0 448 304z"/></svg>',
  views: ['vector'],
  kind: 'paint',
  section: 'vector',
  options: [
    {
      key: 'vectorShapeKind', get label() { return t('tools.shapes.shape'); }, type: 'segmented',
      choices: [
        { value: 'rect', get label() { return t('tools.shapes.rectangle'); }, icon: '<svg viewBox="0 0 16 16"><path d="M1 3h14v10H1zM3 5v6h10V5z"/></svg>' },
        { value: 'ellipse', get label() { return t('tools.shapes.ellipse'); }, icon: '<svg viewBox="0 0 16 16"><path d="M8 2.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11zM8 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z"/></svg>' },
        { value: 'polygon', get label() { return t('tools.vshape.polygon'); }, icon: '<svg viewBox="0 0 16 16"><path d="M8 1l7 5-2.7 8.5H3.7L1 6zM8 3.5L3.3 6.8l1.8 5.7h5.8l1.8-5.7z"/></svg>' },
      ],
    },
    {
      key: 'vectorSides', get label() { return t('tools.vshape.sides'); }, get title() { return t('tools.vshape.sidesTitle'); }, min: 3, max: 12,
      when: (ws) => ws.vectorShapeKind === 'polygon',
    },
  ],

  begin({ project }, pos) {
    drag = { from: pos, key: null };
    project.beginEdit();
    return true;
  },

  move({ project, workspace }, from, to) {
    if (!drag || (to.x === drag.from.x && to.y === drag.from.y)) return;
    const shape = shapeFor(workspace, drag.from, to, workspace.isShiftPressed);
    if (!drag.key) drag.key = project.addShape(shape);
    else project.updateShapes([[drag.key, withShape(shape, { z: project.shapes.get(drag.key).z })]]);
  },

  end({ project, workspace }) {
    const key = drag?.key;
    drag = null;
    project.commitEdit();
    if (key && project.shapes.has(key)) workspace.vectorSelected = [key];
  },

  cancel() {
    drag = null; // the viewport took the edit back
  },
};
