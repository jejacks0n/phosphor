// Smear, an example Phosphor plugin: a brush that smudges the colors under it along the way it moves. Copy this folder to
// start your own (docs/plugins.md, "Writing a brush").
//
// Each move takes the Brush's own dab between where it was and where it is, and every pixel of the dab takes some of
// the color one step back along the motion: Strength's share of it, times the dab's falloff there. Reads says where the
// colors come from: What shows (every layer up to this one, as you see them) or This layer (its own paint only, so a
// pixel this layer has nothing at, or nothing one step back of, is left alone).
//
// Phosphor reads every pixel as it was when the stroke began, and a later put to a pixel replaces an earlier one, so
// a pixel keeps the strongest share the stroke gave it: the dab's soft edge passing over it later doesn't undo it.

let strongest = new Map(); // "x,y" to the largest share put there this stroke

function begin() {
  strongest = new Map();
}

function move(from, to, paint) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (length === 0) return; // a press alone has no direction to smear in
  const ux = dx / length, uy = dy / length;
  const read = paint.options.reads === 1 ? paint.own : paint.shown;
  // A dab pixel can come once for each step along the move: its largest alpha is the one it has.
  const dab = new Map();
  for (const { x, y, alpha } of paint.dab(from, to, paint.options.size, 0.5)) {
    const key = `${x},${y}`;
    if (!(dab.get(key)?.alpha >= alpha)) dab.set(key, { x, y, alpha });
  }
  for (const [key, { x, y, alpha }] of dab) {
    const share = (paint.options.strength / 100) * alpha;
    if (!(share > (strongest.get(key) ?? 0))) continue;
    const here = read(x, y), back = read(x + 0.5 - ux, y + 0.5 - uy); // the pixel whose middle is one step back
    if (!here || !back || (here.r === back.r && here.g === back.g && here.b === back.b)) continue;
    strongest.set(key, share);
    // The color a step back laid at that share over what this layer had: on the base, or over this layer's own paint,
    // that's the two colors mixed; over what shows through a clear spot, it's the same mix as you see it, and the layer
    // stays as clear as it can.
    paint.put(x, y, back, share);
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
