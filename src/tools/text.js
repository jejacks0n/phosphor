// Types into cells: a click places the cursor; the keys are handled by useTextTool.
import { cellAt } from '@/lib/Cells';
import { snapCursor } from '@/document/wideChars';

export default {
  id: 'text',
  title: 'Edit Mode',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M64 64h384v112h-48l-16-56H288v296h56v32H168v-32h56V120H112l-16 56H48V64z"/></svg>`,
  views: ['output'],
  kind: 'paint',
  instant: true,
  section: 'cell',
  palette: true, // shows the F-key character palette in the toolbar
  preview: { shape: 'cell' },
  begin({ project, workspace }, pos) {
    const cell = cellAt(pos.x, pos.y, project.cols, project.rows);
    if (cell) workspace.textCursor = snapCursor(project.cells, project.cols, cell, 0); // a wide character's trail: its lead
    return false;
  },
};
