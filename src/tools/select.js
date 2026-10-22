// Selects a rectangle of cells (ANSI view). Dragging inside the selection moves its contents;
// dragging elsewhere draws a new one; a click outside clears it. The actions are in SelectionBar.
import { normalizeRect } from '@/document/cellEdits';
import { charRowsOf } from '@/lib/Cells';

let drag = null; // { mode: 'select' | 'move', start: { col, row } }

// The cell under a position, clamped to the grid (drags may leave it).
const cellOf = (project, pos) => ({
  col: Math.max(0, Math.min(project.cols - 1, Math.floor(pos.x))),
  row: Math.max(0, Math.min(charRowsOf(project.rows) - 1, Math.floor(pos.y / 2))),
});
const inside = (rect, { col, row }) => rect && col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1;

export default {
  id: 'select',
  title: 'Select',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 64h80v40h-40v40H64zm120 0h64v40h-64zm104 0h64v40h-64zm104 0h56v80h-40v-40h-16zM64 184h40v64H64zm344 0h40v64h-40zM64 288h40v64H64zm344 0h40v64h-40zM64 392h40v16h40v40H64zm344 0h40v56h-80v-40h40zM184 408h64v40h-64zm104 0h64v40h-64z"/></svg>`,
  views: ['output'],
  kind: 'paint',
  instant: true,
  section: 'cell',
  begin({ project, workspace }, pos) {
    const cell = cellOf(project, pos);
    if (inside(workspace.selection, cell)) {
      drag = { mode: 'move', start: cell };
      workspace.selectionOffset = { dc: 0, dr: 0 };
    } else {
      drag = { mode: 'select', start: cell };
      workspace.selection = null;
    }
    return true;
  },
  move({ project, workspace }, from, to) {
    if (!drag) return;
    const cell = cellOf(project, to);
    if (drag.mode === 'move') {
      workspace.selectionOffset = { dc: cell.col - drag.start.col, dr: cell.row - drag.start.row };
    } else if (cell.col !== drag.start.col || cell.row !== drag.start.row || workspace.selection) {
      workspace.selection = normalizeRect(drag.start, cell);
    }
  },
  end({ project, workspace }) {
    if (drag?.mode === 'move') {
      const { dc, dr } = workspace.selectionOffset ?? { dc: 0, dr: 0 };
      const sel = workspace.selection;
      if (dc || dr) {
        project.moveCells(sel, dc, dr);
        const rows = charRowsOf(project.rows);
        const moved = { c0: Math.max(0, sel.c0 + dc), r0: Math.max(0, sel.r0 + dr), c1: Math.min(project.cols - 1, sel.c1 + dc), r1: Math.min(rows - 1, sel.r1 + dr) };
        workspace.selection = moved.c0 <= moved.c1 && moved.r0 <= moved.r1 ? moved : null;
      }
      workspace.selectionOffset = null;
    }
    drag = null;
  },
};
