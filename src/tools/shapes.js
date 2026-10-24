// Rectangles and ellipses: the outline in the foreground color, the inside in the background color
// (BG None: no fill). The pixel view paints them; the ANSI view draws rectangles as single/double line
// boxes (Connect joins them to the lines they cross), shapes in full blocks or the active character as
// cells, and anything else (line-drawn ellipses, or "Half-block") as paint at grid resolution, which
// is half-block drawing. Anti-aliased ellipses paint edge pixels by coverage, or shade cells ░▒▓█.
// Block shapes paint over the cells, each keeping its own character; Block characters (off by
// default) makes them real ▄/█ cells instead. Character mode is the character in FG, with its own
// Fill option, and leaves the cells' backgrounds as they were.
import { rectPixels, ellipsePixels, ellipseCoverage, boxCells } from '@/lib/Brushes';
import { rectCells } from '@/document/editCells';
import { charRowsOf, cellsOfPixels } from '@/lib/Cells';
import { joinBox, inwardArms } from '@/lib/BoxJoin';

let start = null; // the drag's first grid position

const cellRect = (a, b) => ({
  c0: Math.floor(Math.min(a.x, b.x)), c1: Math.floor(Math.max(a.x, b.x)),
  r0: Math.floor(Math.min(a.y, b.y) / 2), r1: Math.floor(Math.max(a.y, b.y) / 2),
});

const SHADES = [[7 / 8, '█'], [5 / 8, '▓'], [3 / 8, '▒'], [1 / 8, '░']];

// Whether the ANSI view draws this shape as cells (rather than paint).
export const drawsCells = ({ shapeKind, shapeDrawWith }) =>
  shapeDrawWith === 'full' || shapeDrawWith === 'char' || (shapeKind === 'rect' && shapeDrawWith !== 'half');

// Whether the ANSI view draws this shape in blocks (half or full), so Block characters applies.
const drawsBlocks = ({ shapeKind, shapeDrawWith }) =>
  shapeDrawWith === 'half' || shapeDrawWith === 'full' || (shapeKind === 'ellipse' && shapeDrawWith !== 'char');

// A shape's inside: its whole coverage (field: alpha or cover) minus its outline's, by key. For an
// anti-aliased ellipse the two then add up to the filled shape's coverage, pixel by pixel.
const insideOf = (all, outline, keyOf, field) => {
  const ring = new Map(outline.map(p => [keyOf(p), p[field]]));
  return all.map(p => ({ ...p, [field]: p[field] - (ring.get(keyOf(p)) ?? 0) })).filter(p => p[field] > 0);
};
const pixelKey = ({ x, y }) => `${x},${y}`;
const cellKey = ({ col, row }) => `${col},${row}`;

function apply({ project, workspace, view }, end) {
  const { shapeKind: kind, shapeDrawWith: drawWith, shapeBlockChars: blockChars } = workspace;
  const antialias = workspace.shapeAntialias && kind === 'ellipse' && drawWith !== 'char';
  const charMode = view === 'output' && drawWith === 'char';
  // Filled when there's a background to fill with; Character mode fills with its character instead.
  const fill = charMode ? workspace.shapeCharFill : !workspace.editBgNone;
  const fg = workspace.editFgColor, bg = workspace.editBgColor;
  // Pixels for a paint shape: the whole shape, or just its outline.
  const pixelsOf = (filled) => (kind === 'ellipse'
    ? ellipsePixels(start, end, filled, project.cols, project.rows, antialias)
    : rectPixels(start, end, filled, project.cols, project.rows));
  // Paint: the inside in BG, then the outline in FG (one stroke, one undo step).
  const paintShape = () => {
    const outline = pixelsOf(false);
    if (fill) project.paintStroke(insideOf(pixelsOf(true), outline, pixelKey, 'alpha'), bg);
    project.paintStroke(outline, fg);
  };
  if (view === 'input') {
    paintShape();
    return;
  }

  // Half-block: paint at grid resolution. Block characters makes each touched cell a ▄, so the
  // paint colors its halves; without it the paint shows through the cell's own character.
  if (!drawsCells(workspace)) {
    if (blockChars) project.writeEditCells(cellsOfPixels(pixelsOf(fill), project.cols, project.rows).map(c => ({ ...c, attrs: { char: '▄' } })));
    paintShape();
    return;
  }

  const rows = charRowsOf(project.rows);
  const rect = cellRect(start, end);
  const inGrid = ({ col, row }) => col >= 0 && row >= 0 && col < project.cols && row < rows;
  const isEdge = ({ col, row }) => col === rect.c0 || col === rect.c1 || row === rect.r0 || row === rect.r1;
  // A block or character shape's cells, with how much of each it covers: the whole shape or its outline.
  const shapeOf = (filled) => {
    if (kind === 'ellipse' && antialias) {
      const cover = ellipseCoverage(rect.c0, rect.r0, rect.c1, rect.r1, filled);
      return rectCells(rect).filter(inGrid).map(c => ({ ...c, cover: cover(c.col, c.row) })).filter(c => c.cover > 0);
    }
    if (kind === 'ellipse') {
      return ellipsePixels({ x: rect.c0, y: rect.r0 }, { x: rect.c1, y: rect.r1 }, filled, project.cols, rows).map(({ x, y }) => ({ col: x, row: y, cover: 1 }));
    }
    return rectCells(rect).filter(inGrid).filter(c => filled || isEdge(c)).map(c => ({ ...c, cover: 1 }));
  };
  const lines = drawWith === 'single' || drawWith === 'double';
  const outline = lines ? null : shapeOf(false);
  const inside = lines || !fill ? [] : insideOf(shapeOf(true), outline, cellKey, 'cover');

  // Full block without Block characters: paint whole cells (inside in BG, outline in FG), showing
  // through their characters.
  if (drawWith === 'full' && !blockChars) {
    const both = (list) => list.flatMap(({ col, row, cover }) => [{ x: col, y: 2 * row, alpha: cover }, { x: col, y: 2 * row + 1, alpha: cover }]);
    project.paintStroke(both(inside), bg);
    project.paintStroke(both(outline), fg);
    return;
  }

  const attrs = workspace.typingAttrs();
  let cells;
  if (charMode) {
    // The character in FG, backgrounds untouched.
    const ink = { char: workspace.activeChar, fg: attrs.fg };
    cells = [...outline, ...inside].map(({ col, row }) => ({ col, row, attrs: ink }));
  } else if (!lines) {
    // Full block: the outline in shades of FG (on BG when there is one); the rest of the shape's
    // cells, BG spaces.
    const charOf = (cover) => SHADES.find(([min]) => cover >= min)?.[1];
    cells = outline.map(c => ({ ...c, char: charOf(c.cover) })).filter(c => c.char).map(({ col, row, char }) => ({ col, row, attrs: { char, ...attrs } }));
    if (fill) {
      const shaded = new Set(cells.map(cellKey));
      cells.push(...shapeOf(true).filter(c => charOf(c.cover) && !shaded.has(cellKey(c))).map(({ col, row }) => ({ col, row, attrs: { char: ' ', bg } })));
    }
  } else {
    // Connect joins the frame to the line characters it crosses or meets. A fill erases the inside,
    // so lines crossing a filled box's frame end there.
    const shown = (col, row) => (inGrid({ col, row }) ? project.cells[row * project.cols + col]?.char : undefined);
    const erased = (col, row) => fill && col > rect.c0 && col < rect.c1 && row > rect.r0 && row < rect.r1;
    const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const join = (col, row, char) => {
      if (!workspace.shapeConnect) return char;
      const closed = STEPS.map(([dc, dr]) => erased(col + dc, row + dr));
      return joinBox(char, shown(col, row), inwardArms(STEPS.map(([dc, dr]) => shown(col + dc, row + dr))), closed);
    };
    cells = boxCells(rect, drawWith, project.cols, rows).map(({ col, row, char }) => ({ col, row, attrs: { char: join(col, row, char), ...attrs } }));
    if (fill) {
      const interior = rectCells(rect).filter(inGrid).filter(c => !isEdge(c));
      cells.push(...interior.map(c => ({ ...c, attrs: { char: ' ', bg } })));
    }
  }
  project.writeEditCells(cells, { clearPaint: true });
}

export default {
  id: 'shapes',
  title: 'Shapes',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M112 64H336A48 48 0 0 1 384 112V168.1A224 224 0 0 0 328 177.3V120H120V328H177.3A224 224 0 0 0 168.1 384H112A48 48 0 0 1 64 336V112A48 48 0 0 1 112 64ZM208 392A184 184 0 1 0 576 392A184 184 0 1 0 208 392Z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  instant: true,
  options: [
    {
      key: 'shapeKind', label: 'Shape', type: 'segmented',
      choices: [
        { value: 'rect', label: 'Rectangle', icon: '<svg viewBox="0 0 16 16"><path d="M1 3h14v10H1zM3 5v6h10V5z"/></svg>' },
        { value: 'ellipse', label: 'Ellipse', icon: '<svg viewBox="0 0 16 16"><path d="M8 2.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11zM8 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z"/></svg>' },
      ],
    },
    {
      key: 'shapeDrawWith', label: 'Draw with', type: 'dropdown', views: ['output'],
      choices: [
        // Line boxes are rectangles only; an ellipse set to them draws (and shows) half-blocks.
        { value: 'single', label: 'Single', glyph: '┌─', when: (ws) => ws.shapeKind === 'rect', instead: 'half' },
        { value: 'double', label: 'Double', glyph: '╔═', when: (ws) => ws.shapeKind === 'rect', instead: 'half' },
        { value: 'half', label: 'Half-block', glyph: '▀▄' },
        { value: 'full', label: 'Full block', glyph: '██' },
        // Offered unless the active character is a block the other choices already draw.
        { value: 'char', label: 'Character', glyph: (workspace) => workspace.activeChar.repeat(2), when: (ws) => !'▀▄█'.includes(ws.activeChar) },
      ],
    },
    {
      key: 'shapeCharFill', label: 'Fill', type: 'checkbox', views: ['output'], when: (ws) => ws.shapeDrawWith === 'char',
      title: 'Fill the inside with the character too',
    },
    {
      key: 'shapeConnect', label: 'Connect', type: 'checkbox', views: ['output'],
      when: (ws) => ws.shapeKind === 'rect' && (ws.shapeDrawWith === 'single' || ws.shapeDrawWith === 'double'),
      title: 'Join the frame to the line characters it crosses or meets',
    },
    {
      key: 'shapeAntialias', label: 'Anti-aliased', type: 'checkbox',
      when: (ws) => ws.shapeKind === 'ellipse' && (ws.editorTab === 'input' || ws.shapeDrawWith !== 'char'),
    },
    {
      key: 'shapeBlockChars', label: 'Block characters', type: 'checkbox', views: ['output'], when: drawsBlocks,
      title: "Draw with real block characters; off, the paint shows through each cell's own character",
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
