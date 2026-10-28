// Whether a tool may change a cell or a grid pixel (two per cell down), from the selection in the view
// it's drawing in: the painting tools change only what's inside it. Null when nothing limits them:
// no selection, or the pixel view (the Select tool's rectangle is the ANSI view's).
export function selectionClip(workspace, view) {
  const sel = workspace.selection;
  if (!sel || view !== 'output') return null;
  const cell = (col, row) => col >= sel.c0 && col <= sel.c1 && row >= sel.r0 && row <= sel.r1;
  return { cell, pixel: (x, y) => cell(x, Math.floor(y / 2)) };
}
