// Whether a tool may change a cell or grid pixel: null when nothing limits it, else { cell(col, row),
// pixel(x, y) }. The Magic Wand's selection (a byte per unit: cells if made in the ANSI view, grid
// pixels if made in the pixel view) and the Select tool's rectangle (whole cells) limit both views'
// tools. A grid pixel is half a cell tall: a cell is in a pixel selection when either half is.
export function selectionClip(workspace) {
  const wand = workspace.wand;
  if (wand) {
    const at = (x, y) => x >= 0 && y >= 0 && x < wand.width && y < wand.height && wand.mask[y * wand.width + x] === 1;
    if (wand.view === 'output') return { cell: at, pixel: (x, y) => at(x, Math.floor(y / 2)) };
    return { pixel: at, cell: (col, row) => at(col, 2 * row) || at(col, 2 * row + 1) };
  }
  const sel = workspace.selection;
  if (!sel) return null;
  const cell = (col, row) => col >= sel.c0 && col <= sel.c1 && row >= sel.r0 && row <= sel.r1;
  return { cell, pixel: (x, y) => cell(x, Math.floor(y / 2)) };
}
