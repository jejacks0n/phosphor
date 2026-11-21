// Aberration, an example Phosphor plugin: a filter that splits the picture's colors sideways, as a cheap lens does.
// Copy this folder to start your own (docs/plugins.md, "Writing a filter").
//
// One pass reads three pixels: L, Distance to the left, R, Distance to the right, and C, this one. Each channel is
//
//   left · L + right · R + (1 - left - right) · C
//
// where left and right are that channel of Left color and Right color: so with red and cyan, red comes from the left
// and green and blue from the right, the classic RGB split. Where the two colors' channels add past 1 they're scaled
// down together until they add to 1. It's written as C plus the two differences, so at Distance 0 (L and R are C) the
// pixel is C exactly. Distance 0 is the default: the filter is off until you move it.

const PASS = `
  vec3 C = pixel(vec2(0.0));
  vec3 L = pixel(vec2(-opt_distance, 0.0));
  vec3 R = pixel(vec2(opt_distance, 0.0));
  vec3 scale = 1.0 / max(vec3(1.0), opt_left_color + opt_right_color);
  return C + opt_left_color * scale * (L - C) + opt_right_color * scale * (R - C);`;

export default {
  filters: [{
    id: 'aberration',
    name: 'Aberration',
    options: [
      { id: 'distance', kind: 'slider', name: 'Distance', min: 0, max: 10, step: 1, default: 0 },
      { id: 'left_color', kind: 'color', name: 'Left color', default: '#ff0000' },
      { id: 'right_color', kind: 'color', name: 'Right color', default: '#00ffff' },
    ],
    passes: [PASS],
  }],
};
