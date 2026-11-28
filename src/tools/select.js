// Selects a rectangle of cells, in either view (in the pixel view a cell is a grid pixel wide and two
// tall, so the rectangle's edges keep to whole cells there too). Dragging inside the selection moves its contents on
// the picked layer (or all visible layers when All layers is on: workspace.selectionIds, as every action on a selection), the block following the pointer cell by cell (a float:
// the whole drag is one undo step); dragging its border moves just the outline; dragging elsewhere
// draws a new one, and a click outside clears it. With nothing selected, a click selects the cell under it. Shift
// (anywhere) draws a rectangle the selection gains, Alt (Option) one it loses, both one it's cut down to (selectOp), and
// a click so selects or leaves out its one cell. The actions are on the options row.
import { normalizeRect, selectionHit, clampOffset, keepOnGrid } from '@/document/editCells';
import { charRowsOf } from '@/lib/Cells';
import { combine, selects, shifted } from '@/lib/selectionMask';
import { t } from '@/i18n/index.js';


let drag = null; // { mode: 'select' | 'move' | 'outline', start: { col, row }, rect?, moved?: { dc, dr }, dragged?, op?, base? }

// How a new rectangle or wand click puts itself with the selection there is: Shift adds to it, Alt (Option on a Mac)
// takes away from it, both keep only where they overlap, as in other editors; null replaces it. keys: a pointer event, or
// the workspace's held keys (isShiftPressed, isAltPressed), for the pointer shown before a press.
export function selectOp(keys) {
  const shift = !!(keys?.shiftKey ?? keys?.isShiftPressed), alt = !!(keys?.altKey ?? keys?.isAltPressed);
  return shift && alt ? 'intersect' : shift ? 'add' : alt ? 'subtract' : null;
}
// The pointer while a key puts a new selection with the old: a crosshair with a small +, − or ×.
const SIGNS = { add: 'M17 19h6M20 16v6', subtract: 'M17 19h6', intersect: 'M17.5 16.5l5 5M22.5 16.5l-5 5' };
export function opCursor(op) {
  const path = `M10 2v6M10 12v6M2 10h6M12 10h6${SIGNS[op]}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><g fill='none'><path d='${path}' stroke='white' stroke-width='3'/><path d='${path}' stroke='black'/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 10 10, crosshair`;
}

// The cell under a position, clamped to the grid (drags may leave it).
const cellOf = (project, pos) => ({
  col: Math.max(0, Math.min(project.cols - 1, Math.floor(pos.x))),
  row: Math.max(0, Math.min(charRowsOf(project.rows) - 1, Math.floor(pos.y / 2))),
});
// Where a position (grid pixels) is relative to the selection, in fractional cells: inside a mask is on one of its cells.
function hitOf(workspace, pos) {
  const sel = workspace.selection;
  if (!sel) return 'outside';
  const hit = selectionHit(sel, { col: pos.x, row: pos.y / 2 });
  return hit === 'inside' && !selects(sel, Math.floor(pos.x), Math.floor(pos.y / 2)) ? 'outside' : hit;
}

export default {
  id: 'select',
  get title() { return t('tools.select.title'); },
  keys: ['M'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 64h80v40h-40v40H64zm120 0h64v40h-64zm104 0h64v40h-64zm104 0h56v80h-40v-40h-16zM64 184h40v64H64zm344 0h40v64h-40zM64 288h40v64H64zm344 0h40v64h-40zM64 392h40v16h40v40H64zm344 0h40v56h-80v-40h40zM184 408h64v40h-64zm104 0h64v40h-64z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  section: 'select',
  autoScroll: true,
  options: [ // All layers: what every action on the selection reaches (workspace.selectionIds), not only a drag
    { key: 'selectAllLayers', get label() { return t('tools.select.allLayers'); }, get title() { return t('tools.select.allLayersTitle'); }, type: 'checkbox' },
  ],
  // before: the selection to undo back to, when the caller changed it already (Edit Mode's drag).
  begin({ project, workspace }, pos, event, before = { selection: workspace.selection }) {
    const cell = cellOf(project, pos);
    const hit = hitOf(workspace, pos), op = selectOp(event);
    if (op) { // a rectangle put with the selection, wherever it starts: the selection shows as it will be while it's drawn
      drag = { mode: 'select', start: cell, before, op, base: workspace.selection };
    } else if (hit === 'outside') {
      drag = { mode: 'select', start: cell, before };
      workspace.selection = null;
    } else if (hit === 'border') {
      drag = { mode: 'outline', start: cell, before };
      workspace.selectionOffset = { dc: 0, dr: 0 };
    } else {
      drag = { mode: 'move', start: cell, rect: workspace.selection, moved: { dc: 0, dr: 0 } };
    }
    return true;
  },
  move({ project, workspace }, from, to) {
    if (!drag) return;
    if (drag.mode !== 'select' && !workspace.selection) return; // cleared mid-drag (Escape, a grid change)
    const cell = cellOf(project, to);
    const dc = cell.col - drag.start.col, dr = cell.row - drag.start.row;
    if (drag.mode === 'move') {
      const { rect, moved } = drag;
      const offset = keepOnGrid(rect, dc, dr, project.cols, charRowsOf(project.rows));
      if (offset.dc === moved.dc && offset.dr === moved.dr) return;
      const landed = project.floatSelection(workspace.selection, workspace.selectionIds, offset.dc - moved.dc, offset.dr - moved.dr);
      if (landed) {
        workspace.selection = landed;
        drag.moved = offset;
      }
    } else if (drag.mode === 'outline') {
      workspace.selectionOffset = clampOffset(workspace.selection, dc, dr, project.cols, charRowsOf(project.rows)); // the outline stays on the grid
    } else if (drag.op) {
      const rect = normalizeRect(drag.start, cell);
      if (drag.dragged && rect.c0 === drag.rect.c0 && rect.r0 === drag.rect.r0 && rect.c1 === drag.rect.c1 && rect.r1 === drag.rect.r1) return;
      workspace.selection = combine(drag.base, rect, drag.op, project.cols, project.rows);
      Object.assign(drag, { rect, dragged: true });
    } else if (dc || dr || workspace.selection) {
      workspace.selection = normalizeRect(drag.start, cell);
      drag.dragged = true;
    }
  },
  end({ project, workspace }) {
    const sel = workspace.selection;
    const { dc, dr } = workspace.selectionOffset ?? { dc: 0, dr: 0 };
    if (drag?.op && !drag.dragged) {
      workspace.selection = combine(drag.base, normalizeRect(drag.start, drag.start), drag.op, project.cols, project.rows); // a click: its one cell
    } else if (drag?.mode === 'select' && !drag.dragged && !drag.before.selection) {
      workspace.selection = normalizeRect(drag.start, drag.start); // a tap with nothing selected selects its cell
    } else if (!sel) {
      // cleared mid-drag: nothing to move
    } else if (drag?.mode === 'outline' && (dc || dr)) {
      workspace.selection = shifted(sel, dc, dr);
    }
    workspace.selectionOffset = null;
    if (drag?.before) project.changeSelection(null, drag.before); // a new rectangle, or the outline moved: an undo step
    drag = null;
  },
  // The border moves the outline, the inside the contents; elsewhere a crosshair draws a new one, with a sign while
  // Shift or Alt puts it with the selection.
  cursor({ workspace }, pos) {
    const held = selectOp(workspace); // read first, always: the pointer is computed, and must hear a key go down after a drag
    const op = drag ? drag.op : held;
    if (op) return opCursor(op);
    const hit = drag ? { move: 'inside', outline: 'border' }[drag.mode] : hitOf(workspace, pos);
    if (hit === 'border') return 'move';
    if (hit === 'inside') return drag?.mode === 'move' ? 'grabbing' : 'grab';
    return 'crosshair';
  },
};
