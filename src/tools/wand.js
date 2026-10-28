// The Magic Wand (both views): a click selects what matches the unit clicked, a cell in the ANSI view
// (its FG, BG and/or character: workspace.wandMatch) or a grid pixel in the pixel view (its color),
// connected to it (Contiguous) or anywhere; Shift-click adds to the selection. Colors match within the
// Tolerance, characters exactly. A Select rectangle, when there is one, keeps the wand inside it (in
// the pixel view, its cells' pixels), and the wand's selection takes its place. The selection (workspace.wand), made in
// either view, shows in both, and both views' painting tools keep to it (selectionClip).
import { markRaw } from 'vue';
import { selectMatching, wandIn } from '@/lib/MagicWand';
import { colorDistance } from '@/lib/FloodFill';
import { ctx2d } from '@/lib/Canvas';
import { charRowsOf } from '@/lib/Cells';

// The units and whether unit i matches unit `seed`.
function matcher(project, workspace, view) {
  const tolerance = workspace.wandTolerance;
  const near = (a, b) => colorDistance(a.r, a.g, a.b, b.r, b.g, b.b) <= tolerance;
  if (view === 'input') {
    const output = project.renderer.outputCanvas;
    if (!output) return null;
    const { data } = ctx2d(output).getImageData(0, 0, project.cols, project.rows);
    const rgb = (i) => ({ r: data[4 * i], g: data[4 * i + 1], b: data[4 * i + 2] });
    return { width: project.cols, height: project.rows, same: (seed) => (i) => near(rgb(seed), rgb(i)) };
  }
  const { fg, bg, char } = workspace.wandMatch;
  if (!fg && !bg && !char) return null;
  const cells = project.cells;
  return {
    width: project.cols, height: charRowsOf(project.rows),
    same: (seed) => (i) => (!fg || near(cells[seed].fg, cells[i].fg)) && (!bg || near(cells[seed].bg, cells[i].bg)) && (!char || cells[seed].char === cells[i].char),
  };
}

export default {
  id: 'wand',
  title: 'Magic Wand',
  keys: ['W'],
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M496 64L512 112L560 128L512 144L496 192L480 144L432 128L480 112ZM272 80L284 116L320 128L284 140L272 176L260 140L224 128L260 116ZM528 304L540 340L576 352L540 364L528 400L516 364L480 352L516 340ZM400 192L448 240L144 544C130.7 557.3 109.3 557.3 96 544C82.7 530.7 82.7 509.3 96 496ZM376 216L320 272L368 320L424 264Z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  section: 'select',
  options: [
    { key: 'selectLayers', label: 'Layers', type: 'layers' }, // the Select tool's: what Delete takes away
    {
      key: 'wandMatch', label: 'Match', type: 'toggles', views: ['output'],
      options: [
        { key: 'fg', label: 'FG', title: 'Cells with the same foreground color' },
        { key: 'bg', label: 'BG', title: 'Cells with the same background color' },
        { key: 'char', label: 'Char', title: 'Cells with the same character' },
      ],
    },
    { key: 'wandTolerance', label: 'Tolerance', title: 'How far a color may be from the one clicked and still match', min: 0, max: 100 },
    { key: 'wandContiguous', label: 'Contiguous', type: 'checkbox', title: 'Only what touches the cell you click; off, everything that matches' },
  ],
  // One click selects; there's no stroke to continue.
  begin({ project, workspace, view }, pos, event) {
    const m = matcher(project, workspace, view);
    if (!m) return false;
    const start = { x: Math.floor(pos.x), y: view === 'input' ? Math.floor(pos.y) : Math.floor(pos.y / 2) };
    if (start.x < 0 || start.y < 0 || start.x >= m.width || start.y >= m.height) return false;
    const adding = event?.shiftKey && workspace.wand ? wandIn(workspace.wand, view, project.rows) : null;
    // The rectangle it searches inside: the Select tool's, or the one the selection Shift adds to began in.
    const within = workspace.selection ?? adding?.within ?? null;
    const allowed = within && ((i) => {
      const x = i % m.width, y = (i - x) / m.width, row = view === 'input' ? Math.floor(y / 2) : y;
      return x >= within.c0 && x <= within.c1 && row >= within.r0 && row <= within.r1;
    });
    const seed = start.y * m.width + start.x;
    if (allowed && !allowed(seed)) return false; // outside the rectangle: the rectangle stays
    const mask = selectMatching({ width: m.width, height: m.height, start, same: m.same(seed), contiguous: workspace.wandContiguous, allowed });
    if (adding) for (let i = 0; i < mask.length; i++) mask[i] |= adding.mask[i];
    project.changeSelection((w) => {
      w.selection = null;
      w.wand = markRaw({ view, width: m.width, height: m.height, mask, within });
    });
    return false;
  },
};
