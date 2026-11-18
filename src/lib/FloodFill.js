/**
 * Iterative BFS Flood Fill algorithm for finding contiguous pixels within a tolerance.
 * Also supports non-contiguous global replacement if contiguous = false. walls (a byte per pixel,
 * optional): pixels the fill neither paints nor crosses.
 */

export function colorDistance(r1, g1, b1, r2, g2, b2) {
  // Euclidean distance in RGB space
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Map 0-255 RGB range to 0-100 percentage for tolerance matching
  return Math.sqrt(dr * dr + dg * dg + db * db) / 4.4167;
}

// own: the pixels are one layer's own, so how see-through they are counts: clear is a color of its own, far from any
// paint, and faint paint is near it (colors compared as they'd show over nothing, with the alpha beside them).
export function floodFill(imageData, startX, startY, tolerance, contiguous = true, feather = 2.0, walls = null, own = false) {
  const { width, height, data } = imageData;

  if (startX < 0 || startX >= width || startY < 0 || startY >= height || walls?.[startY * width + startX]) {
    return [];
  }

  const targetIdx = (startY * width + startX) * 4;
  const targetA = own ? data[targetIdx + 3] : 255, shown = targetA / 255;
  const targetR = data[targetIdx] * shown;
  const targetG = data[targetIdx + 1] * shown;
  const targetB = data[targetIdx + 2] * shown;
  // How far the pixel at a data offset is from the one clicked.
  const distanceAt = (offset) => {
    if (!own) return colorDistance(targetR, targetG, targetB, data[offset], data[offset + 1], data[offset + 2]);
    const a = data[offset + 3], k = a / 255;
    return Math.hypot(colorDistance(targetR, targetG, targetB, data[offset] * k, data[offset + 1] * k, data[offset + 2] * k), (targetA - a) / 4.4167);
  };

  const result = [];
  const falloff = Math.max(0.1, feather); // Ensure a tiny falloff even if feather is 0 to avoid div by zero

  if (!contiguous) {
    // Global replacement mode with smoothing
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (walls?.[y * width + x]) continue;
        const dist = distanceAt((y * width + x) * 4);
        if (dist <= tolerance) {
          result.push({ x, y, alpha: 1 });
        } else if (dist <= tolerance + falloff) {
          const alpha = 1.0 - (dist - tolerance) / falloff;
          result.push({ x, y, alpha });
        }
      }
    }
    return result;
  }

  // Iterative BFS for contiguous fill with smoothing
  const visited = new Float32Array(width * height).fill(-1);
  const queue = [startY * width + startX]; // pixel indexes, read from `head` on (shift() moves the rest every time)
  let head = 0;

  visited[startY * width + startX] = 1;

  while (head < queue.length) {
    const idx = queue[head++], x = idx % width, y = (idx - x) / width;
    const currentAlpha = visited[idx];

    result.push({ x, y, alpha: currentAlpha });

    // Only expand from pixels that are mostly within the core tolerance
    if (currentAlpha < 0.9) continue;

    const neighbors = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nidx = ny * width + nx;
      if (visited[nidx] !== -1 || walls?.[nidx]) continue;

      const dist = distanceAt(nidx * 4);

      if (dist <= tolerance) {
        visited[nidx] = 1.0;
        queue.push(nidx);
      } else if (dist <= tolerance + falloff) {
        const alpha = 1.0 - (dist - tolerance) / falloff;
        visited[nidx] = alpha;
        queue.push(nidx);
      }
    }
  }

  return result;
}
