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
  if (drawWith === 'full' || drawWith === 'char') {
    const char = drawWith === 'full' ? '█' : workspace.activeChar;
    cells = rectCells(rect).filter(inGrid).filter(c => filled || isEdge(c)).map(c => ({ ...c, attrs: { char, ...attrs } }));
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
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M112 64H336A48 48 0 0 1 384 112V168.1A224 224 0 0 0 328 177.3V120H120V328H177.3A224 224 0 0 0 168.1 384H112A48 48 0 0 1 64 336V112A48 48 0 0 1 112 64ZM208 392A184 184 0 1 0 576 392A184 184 0 1 0 208 392Z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  instant: true,
  options: [
    {
      key: 'shapeKind', label: 'Shape', type: 'segmented',
      choices: [
        { value: 'rect', label: 'Rectangle', icon: '<svg viewBox="0 0 16 16"><path d="M1 3h14v10H1zM3 5v6h10V5z"/></svg>' },
        { value: 'ellipse', label: 'Ellipse', icon: '<svg viewBox="0 0 16 16"><path d="M8 2.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11zM8 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z"/></svg>' },
      ],
    },
    { key: 'shapeFilled', label: 'Filled', type: 'toggle' },
    {
      key: 'shapeDrawWith', label: 'Draw with', type: 'dropdown', views: ['output'],
      choices: [
        { value: 'single', label: 'Single', glyph: '┌─' },
        { value: 'double', label: 'Double', glyph: '╔═' },
        { value: 'half', label: 'Half-block', glyph: '▀▄' },
        { value: 'full', label: 'Full block', glyph: '██' },
        { value: 'char', label: 'Active character', glyph: (workspace) => workspace.activeChar.repeat(2) },
      ],
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
