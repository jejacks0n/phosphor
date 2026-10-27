import { pencilPixels } from '@/lib/Brushes';
import lines from '@/tools/lines';

// Single and Double draw box-drawing lines from cell to cell (lines.js); they're the ANSI view's.
const drawsLines = ({ view, workspace }) => view === 'output' && ['single', 'double'].includes(workspace.pencilDrawWith);

const pencil = {
  id: 'pencil',
  title: 'Pencil (1px)',
  keys: ['P'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M100.4 417.2C104.5 402.6 112.2 389.3 123 378.5L304.2 197.3L338.1 163.4C354.7 180 389.4 214.7 442.1 267.4L476 301.3L442.1 335.2L260.9 516.4C250.2 527.1 236.8 534.9 222.2 539L94.4 574.6C86.1 576.9 77.1 574.6 71 568.4C64.9 562.2 62.6 553.3 64.9 545L100.4 417.2zM156 413.5C151.6 418.2 148.4 423.9 146.7 430.1L122.6 517L209.5 492.9C215.9 491.1 221.7 487.8 226.5 483.2L155.9 413.5zM510 267.4C493.4 250.8 458.7 216.1 406 163.4L372 129.5C398.5 103 413.4 88.1 416.9 84.6C430.4 71 448.8 63.4 468 63.4C487.2 63.4 505.6 71 519.1 84.6L554.8 120.3C568.4 133.9 576 152.3 576 171.4C576 190.5 568.4 209 554.8 222.5C551.3 226 536.4 240.9 509.9 267.4z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  options: [
    {
      key: 'pencilDrawWith', label: 'Draw with', type: 'dropdown', views: ['output'],
      choices: [
        { value: 'normal', label: 'Normal mode', glyph: '' }, // paint over each cell's own character, which shows through
        { value: 'single', label: 'Single', glyph: '┌─' },
        { value: 'double', label: 'Double', glyph: '╔═' },
        { value: 'half', label: 'Half-block', glyph: '▀▄' },
      ],
    },
    {
      key: 'pencilConnect', label: 'Connect', type: 'checkbox', views: ['output'],
      when: (ws) => ['single', 'double'].includes(ws.pencilDrawWith),
      title: 'Join the lines it crosses or lands on',
    },
  ],
  shiftLines: true, // Shift-click: a straight line from where the last stroke ended
  // no preview: the crosshair cursor is enough for 1px
  begin(ctx, pos, event) {
    const from = (event?.shiftKey && ctx.workspace.strokeEnd) || pos;
    if (drawsLines(ctx)) lines.begin(ctx, from);
    pencil.move(ctx, from, pos);
    return true;
  },
  move(ctx, from, to) {
    const { project, workspace, view } = ctx;
    if (drawsLines(ctx)) lines.move(ctx, from, to);
    else project.paintStroke(pencilPixels(from, to, project.cols, project.rows), undefined, { blockChars: view === 'output' && workspace.pencilDrawWith === 'half' });
    workspace.strokeEnd = to;
  },
  end({ project }) {
    lines.end();
    project.commitEdit();
  },
};

export default pencil;
