/**
 * The window of cells a view draws: the cells under the viewport plus a margin on each side, so a
 * little scrolling doesn't show an empty edge before the next draw. A grid bigger than the screen
 * is drawn in windows like this, not whole.
 *
 * A window's size depends only on the viewport's size, the cell size and the grid, not on where
 * the viewport is. That's on purpose: resizing a canvas clears it, and a clear costs more than a
 * redraw, so the window only changes size when the viewport or the grid does. Scrolling moves the
 * window's origin instead, clamped so the window stays whole at the grid's edges.
 */
export const VIEW_MARGIN = 160; // CSS px

/**
 * `view` is the viewport's top-left in the sizer's content box (negative when the sizer sits
 * inside the viewport) and the viewport's client size. `unit` is CSS px per column and per row.
 */
export function viewWindow(view, unit, cols, rows, margin = VIEW_MARGIN) {
  const windowCols = Math.min(cols, Math.ceil((view.width + 2 * margin) / unit.x) + 1);
  const windowRows = Math.min(rows, Math.ceil((view.height + 2 * margin) / unit.y) + 1);
  return {
    col: Math.min(Math.max(Math.floor((view.x - margin) / unit.x), 0), cols - windowCols),
    row: Math.min(Math.max(Math.floor((view.y - margin) / unit.y), 0), rows - windowRows),
    cols: windowCols,
    rows: windowRows,
  };
}

/**
 * Reads the `view` for `viewWindow` from the two elements. The borders are left out of the
 * positions, and the scrollbars out of the size (clientWidth and clientHeight).
 */
export function viewIn(sizer, viewport) {
  const s = sizer.getBoundingClientRect();
  const v = viewport.getBoundingClientRect();
  return {
    x: v.left + viewport.clientLeft - (s.left + sizer.clientLeft),
    y: v.top + viewport.clientTop - (s.top + sizer.clientTop),
    width: viewport.clientWidth,
    height: viewport.clientHeight,
  };
}

/**
 * The whole cells on screen: the first, and how many across and down. `view` as for `viewWindow`,
 * `cell` the cell in CSS px ({ cellWidth, lineHeight }). A cell hidden by under a pixel still counts.
 */
export function wholeCellsIn(view, cell, cols, lines) {
  const clamp = (n, max) => Math.max(0, Math.min(max, n));
  const col = clamp(Math.ceil((view.x - 1) / cell.cellWidth), cols - 1);
  const row = clamp(Math.ceil((view.y - 1) / cell.lineHeight), lines - 1);
  return {
    col,
    row,
    cols: clamp(Math.floor((view.x + view.width + 1) / cell.cellWidth) - col, cols - col),
    rows: clamp(Math.floor((view.y + view.height + 1) / cell.lineHeight) - row, lines - row),
  };
}
