// Handles on top of each other, with no zooming in to part them (the Node tool's and Vector select's): a press
// takes one with first set (a gradient's, small and easily covered) over any other in reach, then the nearest (a
// whole CSS px nearer; else the first given), and a click again in the same place takes the next one there, which
// a drag after it then moves. A tool keeps one picker; candidates are { id, d (CSS px), first?, take (starts the
// drag, true), picked (shows it picked: what a click again selects) }.
const MOVED = 2; // CSS px a press goes before it's a drag, not a click
export const DOUBLE_MS = 400, DOUBLE_PX = 4; // a second click this soon and this near (CSS px) is a double-click

const near = (a, b, unit) => Math.hypot((a.x - b.x) * unit.x, (a.y - b.y) * unit.y) <= MOVED;

export function handlePicker() {
  let pick = null; // the last press on handles: { at, ids, i, all, again, moved }
  return {
    // The candidates in reach of pos, in order on a tie: the one taken started, or false (none).
    press(candidates, pos, unit) {
      if (!candidates.length) return (pick = null), false;
      const all = candidates.map((c, n) => [c, n]).sort(([a, i], [b, j]) => !!b.first - !!a.first || Math.round(a.d) - Math.round(b.d) || i - j).map(([c]) => c);
      const ids = all.map((c) => c.id).join(), again = !!pick && pick.ids === ids && near(pos, pick.at, unit);
      pick = { at: pos, ids, i: again ? pick.i : 0, all, again, moved: false };
      return all[pick.i].take();
    },
    move(to, unit) {
      if (pick && !pick.moved && !near(pick.at, to, unit)) pick.moved = true;
    },
    // After the press's own end: a drag starts over; a click again picks the next one there.
    end() {
      if (pick?.moved) pick = null;
      else if (pick?.again) {
        pick.i = (pick.i + 1) % pick.all.length;
        pick.all[pick.i].picked?.();
      }
    },
    reset() {
      pick = null;
    },
  };
}
