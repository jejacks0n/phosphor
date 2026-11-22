// Smear, an example Phosphor plugin: a brush that drags the colors under it along the way it moves, as a finger in wet
// paint. Copy this folder to start your own (docs/plugins.md, "Writing a brush").
//
// The stroke goes a pixel at a time. At each step, every pixel under the Brush's own dab goes part of the way to the
// pixel one step back along the motion, as that pixel is by then: Strength's share of the way, times the dab's falloff
// there. So a color rides along with the brush, thinning as it goes (at Strength 100 it goes the whole way).
//
// Phosphor reads every pixel as it was when the stroke began, so the stroke keeps its own account of what each pixel
// it has changed is now. Reads says what a pixel is: All layers (every layer up to this one, as you see them) or This
// layer (its own paint only, clear where it has none, so clear is dragged into paint as paint is into clear). What
// it writes differs with it: for All layers a put, the least paint that shows as the pixel now is; for This layer a
// set, the layer's paint made exactly what the pixel now is.

let state = new Map(); // a pixel's index to what it is now, { r, g, b, a }, for each the stroke has changed
let travel = 0;        // how far the stroke has moved since its last step, in pixels

function begin() {
  state = new Map();
  travel = 0;
}

// A pixel as it is now, { r, g, b, a } (a 0 for clear; with All layers, or on the base, always 1); null off the grid.
function now(paint, own, x, y) {
  if (x < 0 || y < 0 || x >= paint.cols || y >= paint.rows) return null;
  const changed = state.get(y * paint.cols + x);
  if (changed) return changed;
  const start = own ? paint.own(x, y) : paint.shown(x, y);
  return start ? { r: start.r, g: start.g, b: start.b, a: start.a ?? 1 } : { r: 0, g: 0, b: 0, a: 0 };
}

// Paint k of the way from one pixel to another, a clear one adding clearness and no color.
function toward(from, to, k) {
  const a = from.a + (to.a - from.a) * k;
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const part = (c) => (from[c] * from.a * (1 - k) + to[c] * to.a * k) / a;
  return { r: part('r'), g: part('g'), b: part('b'), a };
}

const same = (p, q) => Math.abs(p.a - q.a) < 0.002 && (!p.a || (Math.abs(p.r - q.r) < 0.5 && Math.abs(p.g - q.g) < 0.5 && Math.abs(p.b - q.b) < 0.5));

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
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy), strength = paint.options.strength / 100;
  if (length === 0 || !(strength > 0)) return; // a press alone has no direction to smear in
  const ux = dx / length, uy = dy / length;
  const own = paint.options.reads === 1 && typeof paint.set === 'function'; // a Phosphor from before set: All layers
  const touched = new Set();
  let at = 1 - travel; // how far into this move the next step is
  for (; at <= length; at++) {
    const here = { x: from.x + ux * at, y: from.y + uy * at };
    // Every pixel of the step is read before any is changed, so a color moves one pixel a step.
    const next = [];
    for (const { x, y, alpha } of paint.dab(here, here, paint.options.size, 0.5)) {
      const back = now(paint, own, Math.floor(x + 0.5 - ux), Math.floor(y + 0.5 - uy)); // the pixel whose middle is one step back
      if (!back) continue;
      const is = now(paint, own, x, y), becomes = toward(is, back, strength * alpha);
      if (!same(is, becomes)) next.push([y * paint.cols + x, becomes]);
    }
    for (const [key, becomes] of next) {
      state.set(key, becomes);
      touched.add(key);
    }
  }
  travel = length - (at - 1);
  for (const key of touched) {
    const x = key % paint.cols, y = (key - x) / paint.cols, is = state.get(key);
    if (own) paint.set(x, y, is, is.a);
    else {
      // So a layer stays as clear as it can: a color dragged over a clear spot is that color, thin, not a mix with what's under.
      const { color, alpha } = thinnest(paint.shown(x, y), is);
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
      { id: 'reads', kind: 'choice', name: 'Reads', choices: ['All layers', 'This layer'], default: 0 },
    ],
    begin,
    move,
  }],
};
