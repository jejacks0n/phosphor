// The Paint Bucket's gradients: where a point sits on a blend from the foreground color (0) to the
// background color (1), the blended color, and the blend character a cell gets in Fill: Cells.
// Positions are grid pixels (a cell is one wide and two tall, about square on screen each).

// Linear: along the line from `from` to `to`, square to it, held at each end. Spherical: the distance
// from `from`, the line's length the radius. The line has length (a zero-length one is a click).
export function gradientAt(shape, from, to, x, y) {
  const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
  const t = shape === 'spherical'
    ? Math.hypot(x - from.x, y - from.y) / Math.sqrt(length2)
    : ((x - from.x) * dx + (y - from.y) * dy) / length2;
  return Math.min(1, Math.max(0, t));
}

// The blend in sRGB: its lightness steps look even between a dark color and a light one, as CSS
// gradients do (blending linear light brightens the dark end fast).
export const blendColor = (fg, bg, t) => ({
  r: Math.round(fg.r + (bg.r - fg.r) * t),
  g: Math.round(fg.g + (bg.g - fg.g) * t),
  b: Math.round(fg.b + (bg.b - fg.b) * t),
});

// The five levels, by how much foreground each shows (a quarter more each), and the 4×4 Bayer
// matrix: a cell between two levels takes one or the other in an ordered pattern anchored to the
// grid, so the bands mix instead of meeting in a hard line.
const LEVELS = ' ░▒▓█';
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

// A cell's blend character, foreground over background. Its level is read at its center and
// dithered; a half-block (▀▄ up and down, ▌▐ left and right) takes its place where the blend changes
// so fast across the cell that two solid halves are closer to it than any even shade.
export function blendChar(shape, from, to, col, row) {
  const cover = (x, y) => 1 - gradientAt(shape, from, to, x, y);
  const pairs = [
    [cover(col + 0.5, 2 * row + 0.5), cover(col + 0.5, 2 * row + 1.5), '▀', '▄'],
    [cover(col + 0.25, 2 * row + 1), cover(col + 0.75, 2 * row + 1), '▌', '▐'],
  ];
  const [a, b, first, second] = Math.abs(pairs[0][0] - pairs[0][1]) >= Math.abs(pairs[1][0] - pairs[1][1]) ? pairs[0] : pairs[1];
  const shadeError = (a - b) ** 2 / 2, firstError = (1 - a) ** 2 + b ** 2, secondError = a ** 2 + (1 - b) ** 2;
  if (Math.min(firstError, secondError) < shadeError) return firstError <= secondError ? first : second;
  const level = 4 * cover(col + 0.5, 2 * row + 1);
  return LEVELS[Math.min(4, Math.floor(level + (BAYER[row % 4][col % 4] + 0.5) / 16))];
}
