/**
 * Iterative BFS Flood Fill algorithm for finding contiguous pixels within a tolerance.
 * Also supports non-contiguous global replacement if contiguous = false.
 */

function colorDistance(r1, g1, b1, r2, g2, b2) {
  // Euclidean distance in RGB space
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Map 0-255 RGB range to 0-100 percentage for tolerance matching
  return Math.sqrt(dr * dr + dg * dg + db * db) / 4.4167; 
}

export function floodFill(imageData, startX, startY, tolerance, contiguous = true) {
  const { width, height, data } = imageData;
  const targetIdx = (startY * width + startX) * 4;
  const targetR = data[targetIdx];
  const targetG = data[targetIdx + 1];
  const targetB = data[targetIdx + 2];

  const result = [];

  if (!contiguous) {
    // Global replacement mode
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];

        if (colorDistance(targetR, targetG, targetB, r, g, b) <= tolerance) {
          result.push({ x, y, alpha: 1 });
        }
      }
    }
    return result;
  }

  // Iterative BFS for contiguous fill
  const visited = new Uint8Array(width * height);
  const queue = [[startX, startY]];

  visited[startY * width + startX] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    result.push({ x, y, alpha: 1 });

    const neighbors = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const idx = ny * width + nx;
      if (visited[idx]) continue;

      const offset = idx * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      if (colorDistance(targetR, targetG, targetB, r, g, b) <= tolerance) {
        visited[idx] = 1;
        queue.push([nx, ny]);
      }
    }
  }

  return result;
}
