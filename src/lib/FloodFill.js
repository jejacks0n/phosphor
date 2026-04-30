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

export function floodFill(imageData, startX, startY, tolerance, contiguous = true, feather = 2.0) {
  const { width, height, data } = imageData;

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return [];
  }

  const targetIdx = (startY * width + startX) * 4;
  const targetR = data[targetIdx];
  const targetG = data[targetIdx + 1];
  const targetB = data[targetIdx + 2];

  const result = [];
  const falloff = Math.max(0.1, feather); // Ensure a tiny falloff even if feather is 0 to avoid div by zero

  if (!contiguous) {
    // Global replacement mode with smoothing
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];

        const dist = colorDistance(targetR, targetG, targetB, r, g, b);
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
  const queue = [[startX, startY]];

  visited[startY * width + startX] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const idx = y * width + x;
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
      if (visited[nidx] !== -1) continue;

      const offset = nidx * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      const dist = colorDistance(targetR, targetG, targetB, r, g, b);
      
      if (dist <= tolerance) {
        visited[nidx] = 1.0;
        queue.push([nx, ny]);
      } else if (dist <= tolerance + falloff) {
        const alpha = 1.0 - (dist - tolerance) / falloff;
        visited[nidx] = alpha;
        queue.push([nx, ny]);
      }
    }
  }

  return result;
}
