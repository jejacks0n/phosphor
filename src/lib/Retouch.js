// Dodge, Burn and Blur (tools/retouch.js) as colors: what one full-strength pass makes of a color. The tool mixes it in
// by its Strength and the brush's falloff.
import { mix } from '@/lib/Cells.js';
import { rgb2gray } from '@/lib/ColorUtils.js';

const WHITE = { r: 255, g: 255, b: 255 }, BLACK = { r: 0, g: 0, b: 0 };
const PASS = 0.5; // a full pass goes halfway to white (Dodge) or black (Burn), for a color right in the range

// How much a color of lightness l (0..1) is in the range: Shadows the dark ones, Highlights the light, Midtones those
// between (none at black or white).
export function rangeWeight(l, range) {
  if (range === 'shadows') return 1 - l;
  if (range === 'highlights') return l;
  return 1 - Math.abs(2 * l - 1);
}

export const dodged = (rgb, range) => mix(rgb, WHITE, PASS * rangeWeight(rgb2gray(rgb), range));
export const burned = (rgb, range) => mix(rgb, BLACK, PASS * rangeWeight(rgb2gray(rgb), range));

// Blur's: the colors around a spot and the spot's own, evenly.
export function averaged(colors) {
  const sum = colors.reduce((s, c) => ({ r: s.r + c.r, g: s.g + c.g, b: s.b + c.b }), { r: 0, g: 0, b: 0 });
  return { r: Math.round(sum.r / colors.length), g: Math.round(sum.g / colors.length), b: Math.round(sum.b / colors.length) };
}
