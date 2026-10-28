// Selects a rectangle of cells (ANSI view). Dragging inside the selection moves its contents on
// the chosen layers (workspace.selectLayers), the block following the pointer cell by cell (a float:
// the whole drag is one undo step); dragging its border moves just the outline; dragging elsewhere
// draws a new one, and a click outside clears it. The actions are on the options row.
import { normalizeRect, selectionHit, clampOffset } from '@/document/editCells';
import { charRowsOf } from '@/lib/Cells';

let drag = null; // { mode: 'select' | 'move' | 'outline', start: { col, row }, rect?, moved?: { dc, dr } }

// The cell under a position, clamped to the grid (drags may leave it).
const cellOf = (project, pos) => ({
  col: Math.max(0, Math.min(project.cols - 1, Math.floor(pos.x))),
  row: Math.max(0, Math.min(charRowsOf(project.rows) - 1, Math.floor(pos.y / 2))),
});
// Where a position (grid pixels) is relative to the selection, in fractional cells.
const hitOf = (workspace, pos) => (workspace.selection ? selectionHit(workspace.selection, { col: pos.x, row: pos.y / 2 }) : 'outside');

export default {
  id: 'select',
  title: 'Select',
  keys: ['M'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 64h80v40h-40v40H64zm120 0h64v40h-64zm104 0h64v40h-64zm104 0h56v80h-40v-40h-16zM64 184h40v64H64zm344 0h40v64h-40zM64 288h40v64H64zm344 0h40v64h-40zM64 392h40v16h40v40H64zm344 0h40v56h-80v-40h40zM184 408h64v40h-64zm104 0h64v40h-64z"/></svg>`,
  views: ['output'],
  kind: 'paint',
  section: 'cell',
  autoScroll: true,
  begin({ project, workspace }, pos) {
    const cell = cellOf(project, pos);
    const hit = hitOf(workspace, pos);
    if (hit === 'outside') {
      drag = { mode: 'select', start: cell };
      workspace.selection = null;
      workspace.wand = null; // a rectangle replaces the Magic Wand's selection
    } else if (hit === 'border') {
      drag = { mode: 'outline', start: cell };
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
      // The block keeps a cell on the grid (a float pushed off it entirely would be lost).
      const { rect, moved } = drag;
      const offset = {
        dc: Math.max(-rect.c1, Math.min(project.cols - 1 - rect.c0, dc)),
        dr: Math.max(-rect.r1, Math.min(charRowsOf(project.rows) - 1 - rect.r0, dr)),
      };
      if (offset.dc === moved.dc && offset.dr === moved.dr) return;
      const landed = project.floatSelection(workspace.selection, workspace.selectLayers, offset.dc - moved.dc, offset.dr - moved.dr);
      if (landed) {
        workspace.selection = landed;
        drag.moved = offset;
      }
    } else if (drag.mode === 'outline') {
      workspace.selectionOffset = clampOffset(workspace.selection, dc, dr, project.cols, charRowsOf(project.rows)); // the outline stays on the grid
    } else if (dc || dr || workspace.selection) {
      workspace.selection = normalizeRect(drag.start, cell);
    }
  },
  end({ workspace }) {
    const sel = workspace.selection;
    const { dc, dr } = workspace.selectionOffset ?? { dc: 0, dr: 0 };
    if (!sel) {
      // cleared mid-drag: nothing to move
    } else if (drag?.mode === 'outline' && (dc || dr)) {
      workspace.selection = { c0: sel.c0 + dc, r0: sel.r0 + dr, c1: sel.c1 + dc, r1: sel.r1 + dr };
    }
    workspace.selectionOffset = null;
    drag = null;
  },
  // The border moves the outline, the inside the contents; elsewhere a crosshair draws a new one.
  cursor({ workspace }, pos) {
    const hit = drag ? { move: 'inside', outline: 'border' }[drag.mode] : hitOf(workspace, pos);
    if (hit === 'border') return 'move';
    if (hit === 'inside') return drag?.mode === 'move' ? 'grabbing' : 'grab';
    return 'crosshair';
  },
};
