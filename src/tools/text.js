// Types into cells: a click places the cursor; the keys are handled by useTextTool. A drag that
// leaves the cell it started in becomes a selection: the Select tool takes over the drag from its
// start, as if it had begun there.
import { cellAt } from '@/lib/Cells';
import { snapCursor } from '@/document/wideChars';
import select from '@/tools/select';

let start = null; // { pos, cell } of the press while it might still become a drag

const text = {
  id: 'text',
  title: 'Edit Mode',
  keys: ['T', 'K'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 64h384v112h-48l-16-56H288v296h56v32H168v-32h56V120H112l-16 56H48V64z"/></svg>`,
  views: ['output'],
  kind: 'paint',
  section: 'cell',
  palette: true, // shows the F-key character palette in the toolbar
  preview: { shape: 'cell' },
  begin({ project, workspace }, pos) {
    const cell = cellAt(pos.x, pos.y, project.cols, project.rows);
    if (!cell) return false;
    project.commitPending(); // moving the cursor ends a run of typing
    workspace.textCursor = snapCursor(project.cells, project.cols, cell, 0); // a wide character's trail: its lead
    start = { pos, cell };
    return true; // follow the drag, in case it becomes a selection
  },
  move(ctx, from, to) {
    if (!start) return;
    const cell = cellAt(to.x, to.y, ctx.project.cols, ctx.project.rows);
    if (cell && cell.col === start.cell.col && cell.row === start.cell.row) return;
    // The rest of the drag (its moves and its end) goes to the Select tool, now the active one.
    const from0 = start.pos;
    start = null;
    ctx.workspace.setActiveTool('select');
    ctx.workspace.selection = null; // a selection kept from before isn't moved: this drag makes a new one
    select.begin(ctx, from0);
    select.move(ctx, from0, to);
  },
  end() {
    start = null;
  },
};

export default text;
