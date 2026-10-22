// Picks a character for one cell; the ANSI editor shows the picker.
import { cellAt } from '@/lib/Cells';

export default {
  id: 'char',
  title: 'Character swap',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="144" y="42" width="60" height="60" rx="8"/><rect x="226" y="42" width="60" height="60" rx="8"/><rect x="308" y="42" width="60" height="60" rx="8"/><rect x="144" y="154" width="60" height="60" rx="8"/><rect x="226" y="154" width="60" height="60" rx="8"/><rect x="308" y="154" width="60" height="60" rx="8"/><rect x="144" y="266" width="60" height="60" rx="8"/><rect x="226" y="266" width="60" height="60" rx="8"/><rect x="308" y="266" width="60" height="60" rx="8"/><rect x="144" y="377" width="60" height="60" rx="8"/><rect x="226" y="377" width="60" height="60" rx="8"/><rect x="308" y="377" width="60" height="60" rx="8"/></svg>`,
  views: ['output'],
  kind: 'paint',
  instant: true,
  section: 'cell',
  preview: { shape: 'cell' },
  begin({ project, openCharPicker }, pos, event) {
    event.stopPropagation();
    const cell = cellAt(pos.x, pos.y, project.cols, project.rows);
    if (cell) openCharPicker?.(cell.col, cell.row);
    return false;
  },
};
