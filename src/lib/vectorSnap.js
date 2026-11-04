// VECTOR's Snap to (workspace.vectorSnap): points placed or dragged land on cell corners ('cells') or on the
// halves of cells both ways ('half'), in grid pixels, where a cell is one pixel wide and two tall; 'none' leaves
// them. Cmd or Ctrl held turns it off for the drag.
const STEPS = { cells: { x: 1, y: 2 }, half: { x: 0.5, y: 1 } };

const to = (v, step) => Math.round(v / step) * step;

export function snapPoint(p, mode) {
  const step = STEPS[mode];
  return step ? { x: to(p.x, step.x), y: to(p.y, step.y) } : p;
}

// A point on Shift's straight line from anchor, snapped along it where it can: across, its x; up and down, its
// y; at 45° the line wins and it's left.
export function snapAlong(anchor, p, mode) {
  const step = STEPS[mode];
  if (!step) return p;
  if (p.y === anchor.y) return { x: to(p.x, step.x), y: p.y };
  if (p.x === anchor.x) return { x: p.x, y: to(p.y, step.y) };
  return p;
}

export const snapMode = (workspace) => (workspace.isCtrlPressed || workspace.isMetaPressed ? 'none' : workspace.vectorSnap);
