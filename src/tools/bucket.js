import { floodFill } from '@/lib/FloodFill';
import { ctx2d } from '@/lib/Canvas';
import { parseKey } from '@/document/editCells';
import { cellIndex, isSolidGlyph } from '@/lib/Cells';

// Grid pixels the fill stops at: edit cells showing a character with something to see through (text,
// box lines), so a fill stays inside a drawn box and never covers typed text.
function wallsOf(project) {
  const walls = new Uint8Array(project.cols * project.rows);
  for (const key of project.editCells.keys()) {
    const { col, row } = parseKey(key);
    const cell = project.cells[cellIndex(col, row, project.cols)];
    if (!cell || isSolidGlyph(cell.char)) continue;
    for (const c of cell.wide === 'lead' ? [col, col + 1] : [col]) {
      if (c < project.cols) walls[2 * row * project.cols + c] = walls[(2 * row + 1) * project.cols + c] = 1;
    }
  }
  return walls;
}

export default {
  id: 'bucket',
  title: 'Paint Bucket (fill)',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M341.7 135.6L277.3 200L310.7 233.4C323.2 245.9 323.2 266.2 310.7 278.7C298.2 291.2 277.9 291.2 265.4 278.7L232 245.3L135.6 341.7C132.7 344.6 130.5 348.2 129.3 352L450.8 352L504.5 298.3C509.4 293.4 512.1 286.8 512.1 280C512.1 273.2 509.4 266.5 504.5 261.7L378.3 135.6C373.5 130.7 366.9 128 360 128C353.1 128 346.5 130.7 341.7 135.6zM90.3 296.4L186.7 200L137.3 150.6C124.8 138.1 124.8 117.8 137.3 105.3C149.8 92.8 170.1 92.8 182.6 105.3L232 154.7L296.4 90.3C313.3 73.5 336.1 64 360 64C383.9 64 406.7 73.5 423.6 90.3L549.7 216.4C566.5 233.3 576 256.1 576 280C576 303.9 566.5 326.7 549.7 343.6L343.6 549.7C326.7 566.5 303.9 576 280 576C256.1 576 233.3 566.5 216.4 549.7L90.3 423.6C73.5 406.7 64 383.9 64 360C64 336.1 73.5 313.3 90.3 296.4zM544 608C508.7 608 480 579.3 480 544C480 518.8 512.6 464.4 531.2 435.3C537.2 425.9 550.7 425.9 556.7 435.3C575.4 464.4 607.9 518.8 607.9 544C607.9 579.3 579.2 608 543.9 608z"/></svg>`,
  views: ['input', 'output'],
  kind: 'paint',
  altPicks: true,
  options: [
    { key: 'editFillTolerance', label: 'Tolerance', title: 'Fill tolerance', min: 0, max: 100 },
    { key: 'editFillContiguous', label: 'Contiguous', type: 'checkbox' },
    { key: 'editFillFeather', label: 'Feathering', title: 'Fill feathering', min: 0, max: 100 },
  ],
  // One click fills; there's no stroke to continue.
  begin({ project, workspace }, pos, event) {
    const output = project.renderer.outputCanvas;
    if (!output) return false;
    event.stopPropagation();
    const imageData = ctx2d(output).getImageData(0, 0, project.cols, project.rows);
    const pixels = floodFill(imageData, Math.floor(pos.x), Math.floor(pos.y), workspace.editFillTolerance, workspace.editFillContiguous, workspace.editFillFeather, wallsOf(project));
    project.paintStroke(pixels);
    project.commitEdit();
    return false;
  },
};
