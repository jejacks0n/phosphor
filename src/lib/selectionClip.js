// Whether a tool may change a cell or grid pixel: null when nothing limits it, else { cell(col, row),
// pixel(x, y) }. The Magic Wand's selection (a byte per unit: cells in the ANSI view, grid pixels in
// the pixel view) limits the tools of the view it was made in; the Select tool's rectangle (whole
// cells), both views'. A grid pixel is half a cell tall.
export function selectionClip(workspace, view) {
  const wand = workspace.wand;
  if (wand?.view === view) {
    const at = (x, y) => x >= 0 && y >= 0 && x < wand.width && y < wand.height && wand.mask[y * wand.width + x] === 1;
    if (view === 'output') return { cell: at, pixel: (x, y) => at(x, Math.floor(y / 2)) };
    return { pixel: at, cell: (col, row) => at(col, 2 * row) || at(col, 2 * row + 1) };
  }
  const sel = workspace.selection;
  if (!sel) return null;
  const cell = (col, row) => col >= sel.c0 && col <= sel.c1 && row >= sel.r0 && row <= sel.r1;
  return { cell, pixel: (x, y) => cell(x, Math.floor(y / 2)) };
}
