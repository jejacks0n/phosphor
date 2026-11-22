// Smear, an example Phosphor plugin: a brush that drags the colors under it along the way it moves, as a finger in wet
// paint. Copy this folder to start your own (docs/plugins.md, "Writing a brush").
//
// The stroke goes a pixel at a time. At each step, every pixel under the Brush's own dab takes some of the color of the
// pixel one step back along the motion, as that pixel is by then: Strength's share of it, times the dab's falloff there.
// So a color rides along with the brush, thinning as it goes (at Strength 100 it goes the whole way).
//
// Phosphor reads every pixel as it was when the stroke began, and a later put to a pixel replaces an earlier one, so
// the stroke keeps its own account: for each pixel it has changed, the paint laid there so far, which with what the
// pixel began as is what it is now. Reads says what a pixel is: What shows (every layer up to this one, as you see
// them) or This layer (its own paint only, clear where it has none). A brush only lays paint, so This layer carries
// paint out over clear spots and other paint, and never thins the paint it came from.

let laid = new Map(); // a pixel's index to the paint laid there this stroke, { r, g, b, a }: its colors times a
let travel = 0;       // how far the stroke has moved since its last step, in pixels

function begin() {
  laid = new Map();
  travel = 0;
}

// A pixel as it is now: what it began as with the stroke's paint over it. { r, g, b, a }, a 0 for clear; null off the grid.
function now(paint, own, x, y) {
  if (x < 0 || y < 0 || x >= paint.cols || y >= paint.rows) return null;
  const start = own ? paint.own(x, y) : paint.shown(x, y), over = laid.get(y * paint.cols + x);
  const sa = start ? start.a ?? 1 : 0;
  if (!over) return start ? { r: start.r, g: start.g, b: start.b, a: sa } : { a: 0 };
  const a = over.a + sa * (1 - over.a), under = sa * (1 - over.a);
  if (a <= 0) return { a: 0 };
  return { r: (over.r + (start?.r ?? 0) * under) / a, g: (over.g + (start?.g ?? 0) * under) / a, b: (over.b + (start?.b ?? 0) * under) / a, a };
}

// The least paint over the color `from` that shows as the color `to`: { color, alpha }.
function thinnest(from, to) {
  let alpha = 0;
  for (const c of ['r', 'g', 'b']) {
    if (to[c] > from[c]) alpha = Math.max(alpha, (to[c] - from[c]) / (255 - from[c]));
    else if (to[c] < from[c]) alpha = Math.max(alpha, (from[c] - to[c]) / from[c]);
  }
  if (alpha <= 0) return { color: to, alpha: 0 };
  return { color: { r: from.r + (to.r - from.r) / alpha, g: from.g + (to.g - from.g) / alpha, b: from.b + (to.b - from.b) / alpha }, alpha: Math.min(1, alpha) };
}

function move(from, to, paint) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (length === 0 || !(paint.options.strength > 0)) return; // a press alone has no direction to smear in
  const ux = dx / length, uy = dy / length, own = paint.options.reads === 1, strength = paint.options.strength / 100;
  const touched = new Set();
  let at = 1 - travel; // how far into this move the next step is
  for (; at <= length; at++) {
    const here = { x: from.x + ux * at, y: from.y + uy * at };
    // Every pixel of the step is read before any is changed, so a color moves one pixel a step.
    const taken = [];
    for (const { x, y, alpha } of paint.dab(here, here, paint.options.size, 0.5)) {
      const back = now(paint, own, Math.floor(x + 0.5 - ux), Math.floor(y + 0.5 - uy)); // the pixel whose middle is one step back
      if (!back || !back.a) continue; // nothing there to carry
      const is = now(paint, own, x, y), share = strength * alpha;
      // The same color (or a clear spot): it only grows more solid, toward what's behind it and no further. Another
      // color: what's behind is laid over it.
      if (!is.a || (Math.abs(is.r - back.r) < 0.5 && Math.abs(is.g - back.g) < 0.5 && Math.abs(is.b - back.b) < 0.5)) {
        if (is.a < back.a) taken.push([y * paint.cols + x, back, share * (back.a - is.a) / (1 - is.a)]);
      } else taken.push([y * paint.cols + x, back, share * back.a]);
    }
    for (const [key, back, share] of taken) {
      const over = laid.get(key) ?? { r: 0, g: 0, b: 0, a: 0 };
      laid.set(key, { r: back.r * share + over.r * (1 - share), g: back.g * share + over.g * (1 - share), b: back.b * share + over.b * (1 - share), a: share + over.a * (1 - share) });
      touched.add(key);
    }
  }
  travel = length - (at - 1);
  for (const key of touched) {
    const x = key % paint.cols, y = (key - x) / paint.cols, over = laid.get(key);
    // This layer: the paint laid, over the layer's own. What shows: the least paint that shows as the pixel is now, so
    // a layer stays as clear as it can (a color dragged over a clear spot is that color, thin, not a mix with what's under).
    if (own) paint.put(x, y, { r: over.r / over.a, g: over.g / over.a, b: over.b / over.a }, over.a);
    else {
      const { color, alpha } = thinnest(paint.shown(x, y), now(paint, false, x, y));
      paint.put(x, y, color, alpha);
    }
  }
}

export default {
  brushes: [{
    id: 'smear',
    name: 'Smear',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 12C5 12 6 6 9 6S13 9 14 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="3" cy="12" r="2" fill="currentColor"/></svg>',
    key: 'J',
    size: 'size',
    options: [
      { id: 'size', kind: 'slider', name: 'Size', min: 1, max: 20, step: 1, default: 6 },
      { id: 'strength', kind: 'slider', name: 'Strength', min: 0, max: 100, step: 1, default: 60 },
      { id: 'reads', kind: 'choice', name: 'Reads', choices: ['What shows', 'This layer'], default: 0 },
    ],
    begin,
    move,
  }],
};
