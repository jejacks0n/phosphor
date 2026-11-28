// Whether a tool may change a cell or grid pixel: null when nothing limits it, else { cell(col, row),
// pixel(x, y) }. The selection (selectionMask.js) limits both views' tools: its mask (a byte per unit: cells if made in
// the ANSI view, grid pixels if made in the pixel view), or a plain rectangle's whole cells. A grid pixel is half a cell
// tall: a cell is in a pixel mask when either half is.
// The selection's fields are read once, not through the store at every unit: a fill asks of each of a million pixels.
export function selectionClip(workspace) {
  const wand = workspace.selection?.mask;
  if (wand) {
    const { width, height, mask, view } = wand;
    const at = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
    if (view === 'output') return { cell: at, pixel: (x, y) => at(x, Math.floor(y / 2)) };
    return { pixel: at, cell: (col, row) => at(col, 2 * row) || at(col, 2 * row + 1) };
  }
  if (!workspace.selection) return null;
  const { c0, r0, c1, r1 } = workspace.selection;
  const cell = (col, row) => col >= c0 && col <= c1 && row >= r0 && row <= r1;
  return { cell, pixel: (x, y) => cell(x, Math.floor(y / 2)) };
}
