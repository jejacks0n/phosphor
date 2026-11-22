// Superformula, an example Phosphor plugin: a shape for the Shape tool, drawn by Johan Gielis's superformula. Copy this
// folder to start your own (docs/plugins.md, "Writing a shape").
//
// The superformula gives a radius for each angle φ:
//
//   r(φ) = (|cos(m φ / 4)|^n2 + |sin(m φ / 4)|^n3)^(-1 / n1)
//
// m is Points, n1 is Pinch (small values pull the sides in between the points) and n2 = n3 is Round (small values
// make the points sharp, larger ones blunt and bulging). With n2 = n3, r(φ) repeats every 2π / m, so the shape has m
// points and closes for any m. The outline is 120 corners, one every 3°, scaled by its own bounds into 0 to 1 on each
// axis, so it fills the box you drag as the built-in shapes do.

const CORNERS = 120;

function outline({ points: m, pinch: n1, round: n2 }) {
  const corners = [];
  for (let i = 0; i < CORNERS; i++) {
    const phi = (2 * Math.PI * i) / CORNERS, t = (m * phi) / 4;
    const r = (Math.abs(Math.cos(t)) ** n2 + Math.abs(Math.sin(t)) ** n2) ** (-1 / n1);
    corners.push([r * Math.cos(phi), -r * Math.sin(phi)]); // y down, as the canvas has it: the first point on the right
  }
  const xs = corners.map(([x]) => x), ys = corners.map(([, y]) => y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  return [{ closed: true, points: corners.map(([x, y]) => [(x - x0) / w, (y - y0) / h]) }];
}

export default {
  shapes: [{
    id: 'superformula',
    name: 'Superformula',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8 1.5L9.6 6.1 14.2 6 10.4 8.9 11.8 13.5 8 10.7 4.2 13.5 5.6 8.9 1.8 6 6.4 6.1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    options: [
      { id: 'points', kind: 'slider', name: 'Points', min: 1, max: 20, step: 1, default: 5 },
      { id: 'pinch', kind: 'slider', name: 'Pinch', min: 0.1, max: 1, step: 0.1, default: 0.3 },
      { id: 'round', kind: 'slider', name: 'Round', min: 0.1, max: 4, step: 0.1, default: 1.7 },
    ],
    outline,
  }],
};
