// Selects a rectangle of cells, in either view (in the pixel view a cell is a grid pixel wide and two
// tall, so the rectangle's edges keep to whole cells there too). Dragging inside the selection moves its contents on
// the picked layer (or all visible layers when All layers is on: workspace.selectionIds, as every action on a selection), the block following the pointer cell by cell (a float:
// the whole drag is one undo step); dragging its border moves just the outline; dragging elsewhere
// draws a new one, and a click outside clears it. Its handles (the corners and the middles of its sides) resize what's
// in it, while that's pixels (no characters, as Rotate's rule): scaleSelection, Shift keeping its shape. With nothing
// selected, a click selects the cell under it. Shift
// (anywhere) draws a rectangle the selection gains, Alt (Option) one it loses, both one it's cut down to (selectOp), and
// a click so selects or leaves out its one cell. The actions are on the options row.
import { normalizeRect, selectionHit, clampOffset, keepOnGrid } from '@/document/editCells';
import { charRowsOf } from '@/lib/Cells';
import { combine, selects, shifted } from '@/lib/selectionMask';
import { t } from '@/i18n/index.js';


let drag = null; // { mode: 'select' | 'move' | 'outline' | 'scale', start: { col, row }, rect?, moved?: { dc, dr }, dragged?, op?, base?, handle?, box?, size? }

// A selection's handles: its corners and the middles of its sides, each [name, x, y] as shares of its box. They show
// while what's in it can scale (handlesShown): with the Select tool, and no characters in it, as Rotate's rule.
export const HANDLES = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
const HANDLE_REACH = 6, TOUCH_REACH = 16; // CSS px from a handle's middle that take it, for a pointer and a finger
const RESIZE_CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
export const handlesShown = (project, workspace) => workspace.activeTool === 'select' && !workspace.selectionOffset && project.selectionPixelsOnly;
// The selection's box in grid pixels.
export const boxOf = (sel, rows) => ({ x0: sel.c0, x1: sel.c1 + 1, y0: 2 * sel.r0, y1: Math.min(rows, 2 * sel.r1 + 2) });
// The handle under a position (grid pixels), within reach on screen (unit: CSS px a grid pixel), or null. Into the box a
// handle reaches at most a quarter of its side, so a small selection still moves from its middle.
function handleAt({ project, workspace, unit }, pos, event) {
  if (!handlesShown(project, workspace)) return null;
  const { x0, x1, y0, y1 } = boxOf(workspace.selection, project.rows);
  const reach = event?.touches || event?.pointerType === 'touch' ? TOUCH_REACH : HANDLE_REACH;
  const rx = unit ? reach / unit.x : 0.4, ry = unit ? reach / unit.y : 0.8;
  const near = (d, f, r, side) => Math.abs(d) <= ((f === 0 ? d > 0 : f === 1 ? d < 0 : true) ? Math.min(r, side / 4) : r);
  return HANDLES.find(([, fx, fy]) => near(pos.x - (x0 + fx * (x1 - x0)), fx, rx, x1 - x0) && near(pos.y - (y0 + fy * (y1 - y0)), fy, ry, y1 - y0))?.[0] ?? null;
}
// The box a handle dragged to (grid pixels) makes: whole cells across; down, whole cells in the ANSI view and pixel rows
// in the PIXEL view, its top on a cell's (a block lands at a cell). At least a cell across and a pixel row (a cell in the
// ANSI view) down, on the grid. Shift (shape) keeps the box's shape, from the corner or side across from the handle.
function draggedBox({ project, view }, { handle, box }, to, shape) {
  const step = view === 'input' ? 1 : 2, at = (v, k) => k * Math.round(v / k);
  let { x0, x1, y0, y1 } = box;
  if (handle.includes('w')) x0 = Math.max(0, Math.min(at(to.x, 1), x1 - 1));
  if (handle.includes('e')) x1 = Math.min(project.cols, Math.max(at(to.x, 1), x0 + 1));
  if (handle.includes('n')) y0 = Math.max(0, Math.min(at(to.y, 2), y1 - step));
  if (handle.includes('s')) y1 = Math.min(project.rows, Math.max(at(to.y, step), y0 + step));
  if (shape) {
    const W = box.x1 - box.x0, P = box.y1 - box.y0, across = handle.includes('w') || handle.includes('e'), down = handle.includes('n') || handle.includes('s');
    const k = across && down ? Math.max((x1 - x0) / W, (y1 - y0) / P) : across ? (x1 - x0) / W : (y1 - y0) / P;
    const w = Math.max(1, Math.round(W * k)), p = Math.max(step, at(P * k, step));
    if (handle.includes('w')) x0 = Math.max(0, x1 - w); else x1 = Math.min(project.cols, x0 + w);
    if (handle.includes('n')) y0 = Math.max(0, at(y1 - p, 2)); else y1 = Math.min(project.rows, y0 + p);
  }
  return { x0, x1, y0, y1 };
}

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
  begin(ctx, pos, event, before = { selection: ctx.workspace.selection }) {
    const { project, workspace } = ctx;
    const cell = cellOf(project, pos);
    const hit = hitOf(workspace, pos), op = selectOp(event), handle = handleAt(ctx, pos, event);
    if (handle) { // a handle wins over Shift, which keeps the shape there
      const box = boxOf(workspace.selection, project.rows);
      drag = { mode: 'scale', start: cell, handle, box, size: box };
    } else if (op) { // a rectangle put with the selection, wherever it starts: the selection shows as it will be while it's drawn
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
  move(ctx, from, to) {
    const { project, workspace } = ctx;
    if (!drag) return;
    if (drag.mode !== 'select' && !workspace.selection) return; // cleared mid-drag (Escape, a grid change)
    const cell = cellOf(project, to);
    const dc = cell.col - drag.start.col, dr = cell.row - drag.start.row;
    if (drag.mode === 'scale') {
      const box = draggedBox(ctx, drag, to, workspace.isShiftPressed), was = drag.size;
      if (box.x0 === was.x0 && box.x1 === was.x1 && box.y0 === was.y0 && box.y1 === was.y1) return;
      const landed = project.scaleSelection(workspace.selection, workspace.selectionIds, { c0: box.x0, r0: box.y0 / 2, w: box.x1 - box.x0, px: box.y1 - box.y0 });
      if (landed) {
        workspace.selection = landed;
        drag.size = box;
      }
    } else if (drag.mode === 'move') {
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
  cursor(ctx, pos) {
    const { workspace } = ctx;
    const held = selectOp(workspace); // read first, always: the pointer is computed, and must hear a key go down after a drag
    const handle = drag ? drag.handle : handleAt(ctx, pos);
    if (handle) return RESIZE_CURSORS[handle];
    const op = drag ? drag.op : held;
    if (op) return opCursor(op);
    const hit = drag ? { move: 'inside', outline: 'border' }[drag.mode] : hitOf(workspace, pos);
    if (hit === 'border') return 'move';
    if (hit === 'inside') return drag?.mode === 'move' ? 'grabbing' : 'grab';
    return 'crosshair';
  },
};
