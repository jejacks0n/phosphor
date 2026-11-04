// VECTOR's Add and Subtract, through paper.js, loaded the first time it's wanted (loadBooleans, before combined):
// the shapes as paper paths in the bottom shape's own space, under their fill rules, their union or the bottom
// one less the rest taken, and the outlines that come back made points again, curves kept (paper leaves no point
// where edges met exactly).
import { invert, outlinesIn, strokeOf, withOutlines, withShape } from '@/document/shapes.js';

let scope = null;

export async function loadBooleans() {
  if (scope) return;
  const { default: paper } = await import('paper/dist/paper-core.js');
  const next = new paper.PaperScope();
  next.setup(new next.Size(1, 1));
  scope = next;
}

const toPaper = (list, rule) => new scope.CompoundPath({
  insert: false,
  fillRule: rule,
  children: list.map(({ points }) => new scope.Path({
    insert: false, closed: true, segments: points.map(([x, y, ix, iy, ox, oy]) => [[x, y], [ix, iy], [ox, oy]]),
  })),
});

const EPS = 1e-6;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

// A point whose handles are in line, pointing apart, marked smooth.
function smoothed(p) {
  const inLong = Math.hypot(p[2], p[3]), outLong = Math.hypot(p[4], p[5]);
  const smooth = inLong > EPS && outLong > EPS && Math.abs(cross(p[2], p[3], p[4], p[5])) < 1e-3 * inLong * outLong && p[2] * p[4] + p[3] * p[5] < 0;
  return [p[0], p[1], p[2], p[3], p[4], p[5], smooth ? 1 : 0];
}

function fromPaper(item) {
  const paths = item instanceof scope.CompoundPath ? item.children : [item];
  return paths
    .filter((path) => Math.abs(path.area) > EPS)
    .map((path) => ({ closed: true, points: path.segments.map(({ point, handleIn, handleOut }) => smoothed([point.x, point.y, handleIn.x, handleIn.y, handleOut.x, handleOut.y])) }));
}

// Add ('add'): bottom and others made one. Subtract ('subtract'): bottom less others. The result is bottom (its
// style and transform) with the outlines that make it, filled evenodd (they don't cross); null when nothing's left.
export function combined(bottom, others, op) {
  const into = invert(bottom.m), path = (shape) => toPaper(outlinesIn(shape, into), strokeOf(shape).rule);
  const rest = others.map(path).reduce((a, b) => a.unite(b, { insert: false }));
  const list = fromPaper(path(bottom)[op === 'add' ? 'unite' : 'subtract'](rest, { insert: false }));
  return list.length ? withOutlines(withShape(bottom, { rule: 'evenodd' }), list) : null;
}
