// Rectangles and ellipses, outlined or filled. The pixel view paints them; the ANSI view draws
// rectangles as single/double line boxes or with the active character, and anything else (all
// ellipses, or "Half-block") as paint at grid resolution, which is half-block drawing.
import { rectPixels, ellipsePixels, boxCells } from '@/lib/Brushes';
import { rectCells } from '@/document/cellEdits';
import { charRowsOf } from '@/lib/Cells';

let start = null; // the drag's first grid position

const cellRect = (a, b) => ({
  c0: Math.floor(Math.min(a.x, b.x)), c1: Math.floor(Math.max(a.x, b.x)),
  r0: Math.floor(Math.min(a.y, b.y) / 2), r1: Math.floor(Math.max(a.y, b.y) / 2),
});

function apply({ project, workspace, view }, end) {
  const { shapeKind: kind, shapeFilled: filled, shapeDrawWith: drawWith } = workspace;
  const pixelShape = () => (kind === 'ellipse' ? ellipsePixels : rectPixels)(start, end, filled, project.cols, project.rows);
  if (view === 'input' || kind === 'ellipse' || drawWith === 'half') {
    project.paintStroke(pixelShape());
    return;
  }

  const rows = charRowsOf(project.rows);
  const rect = cellRect(start, end);
  const attrs = workspace.typingAttrs();
  const inGrid = ({ col, row }) => col >= 0 && row >= 0 && col < project.cols && row < rows;
  const isEdge = ({ col, row }) => col === rect.c0 || col === rect.c1 || row === rect.r0 || row === rect.r1;
  let cells;
  if (drawWith === 'char') {
    cells = rectCells(rect).filter(inGrid).filter(c => filled || isEdge(c)).map(c => ({ ...c, attrs: { char: workspace.activeChar, ...attrs } }));
  } else {
    cells = boxCells(rect, drawWith, project.cols, rows).map(({ col, row, char }) => ({ col, row, attrs: { char, ...attrs } }));
    if (filled) {
      const interior = rectCells(rect).filter(inGrid).filter(c => !isEdge(c));
      cells.push(...interior.map(c => ({ ...c, attrs: { char: ' ', ...attrs } })));
    }
  }
  project.editCells(cells, { clearPaint: true });
}

export default {
  id: 'shapes',
  title: 'Shapes',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M48 64h256v192H48zm40 40v112h176V104zm280 96a112 112 0 1 1 0 224 112 112 0 0 1 0-224zm0 40a72 72 0 1 0 0 144 72 72 0 0 0 0-144zM48 296h184v40H88v112H48z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  instant: true,
  options: [
    { key: 'shapeKind', label: 'Shape', type: 'segmented', choices: [{ value: 'rect', label: '▭ Rectangle' }, { value: 'ellipse', label: '◯ Ellipse' }] },
    { key: 'shapeFilled', label: 'Fill', type: 'segmented', choices: [{ value: false, label: 'Outline' }, { value: true, label: 'Filled' }] },
    {
      key: 'shapeDrawWith', label: 'Draw with', type: 'segmented', views: ['output'],
      choices: [{ value: 'single', label: '─ Single' }, { value: 'double', label: '═ Double' }, { value: 'half', label: '▀▄ Half-block' }, { value: 'char', label: 'Active char' }],
    },
  ],
  begin({ workspace }, pos) {
    start = pos;
    workspace.shapeDrag = { from: pos, to: pos };
    return true;
  },
  move({ workspace }, from, to) {
    if (start) workspace.shapeDrag = { from: start, to };
  },
  end(ctx) {
    const drag = ctx.workspace.shapeDrag;
    ctx.workspace.shapeDrag = null;
    if (start && drag) apply(ctx, drag.to);
    start = null;
    ctx.project.commitEdit();
  },
};
