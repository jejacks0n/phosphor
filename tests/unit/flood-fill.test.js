// The Paint Bucket's area (floodFill) and the Magic Wand's (selectMatching) give exactly what they gave before they were
// made faster (issue #231): the same pixels with the same alphas in the same order, and the same masks, on blocky,
// smooth and see-through pictures, with walls, every Tolerance and Feather, contiguous or not.
import { test, expect } from 'vitest';
import { floodFill, colorDistance } from '@/lib/FloodFill';
import { selectMatching } from '@/lib/MagicWand';

// floodFill and selectMatching as they were, the reference.
function floodFillBefore(imageData, startX, startY, tolerance, contiguous = true, feather = 2.0, walls = null, own = false) {
  const { width, height, data } = imageData;
  if (startX < 0 || startX >= width || startY < 0 || startY >= height || walls?.[startY * width + startX]) return [];
  const targetIdx = (startY * width + startX) * 4;
  const targetA = own ? data[targetIdx + 3] : 255, shown = targetA / 255;
  const targetR = data[targetIdx] * shown, targetG = data[targetIdx + 1] * shown, targetB = data[targetIdx + 2] * shown;
  const distanceAt = (offset) => {
    if (!own) return colorDistance(targetR, targetG, targetB, data[offset], data[offset + 1], data[offset + 2]);
    const a = data[offset + 3], k = a / 255;
    return Math.hypot(colorDistance(targetR, targetG, targetB, data[offset] * k, data[offset + 1] * k, data[offset + 2] * k), (targetA - a) / 4.4167);
  };
  const result = [];
  const falloff = Math.max(0.1, feather);
  if (!contiguous) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (walls?.[y * width + x]) continue;
        const dist = distanceAt((y * width + x) * 4);
        if (dist <= tolerance) result.push({ x, y, alpha: 1 });
        else if (dist <= tolerance + falloff) result.push({ x, y, alpha: 1.0 - (dist - tolerance) / falloff });
      }
    }
    return result;
  }
  const visited = new Float32Array(width * height).fill(-1);
  const queue = [startY * width + startX];
  let head = 0;
  visited[startY * width + startX] = 1;
  while (head < queue.length) {
    const idx = queue[head++], x = idx % width, y = (idx - x) / width;
    const currentAlpha = visited[idx];
    result.push({ x, y, alpha: currentAlpha });
    if (currentAlpha < 0.9) continue;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nidx = ny * width + nx;
      if (visited[nidx] !== -1 || walls?.[nidx]) continue;
      const dist = distanceAt(nidx * 4);
      if (dist <= tolerance) {
        visited[nidx] = 1.0;
        queue.push(nidx);
      } else if (dist <= tolerance + falloff) {
        visited[nidx] = 1.0 - (dist - tolerance) / falloff;
        queue.push(nidx);
      }
    }
  }
  return result;
}

function selectMatchingBefore({ width, height, start, same, contiguous = true, allowed = null }) {
  const mask = new Uint8Array(width * height);
  const ok = (i) => !allowed || allowed(i);
  const first = start.y * width + start.x;
  if (!ok(first)) return mask;
  if (!contiguous) {
    for (let i = 0; i < mask.length; i++) if (ok(i) && same(i)) mask[i] = 1;
    return mask;
  }
  const queue = [first];
  mask[first] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % width, y = (i - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (!mask[n] && ok(n) && same(n)) {
        mask[n] = 1;
        queue.push(n);
      }
    }
  }
  return mask;
}

// A seeded generator, so each fixture is the same every run.
const random = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const W = 37, H = 23;

// Blocky: a few colors in 3 x 3 blocks, so regions have ragged shapes; smooth: a gradient, so a fill feathers out;
// see-through: blocks at several alphas (a layer's own pixels).
function picture(kind, seed) {
  const next = random(seed), data = new Uint8ClampedArray(W * H * 4);
  const colors = [[0, 0, 0], [250, 10, 10], [10, 240, 20], [12, 12, 245], [128, 128, 128], [5, 3, 2]];
  const blocks = Array.from({ length: Math.ceil(W / 3) * Math.ceil(H / 3) }, () => [colors[Math.floor(next() * colors.length)], [0, 40, 120, 250, 255][Math.floor(next() * 5)]]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, [color, alpha] = blocks[Math.floor(y / 3) * Math.ceil(W / 3) + Math.floor(x / 3)];
      if (kind === 'smooth') data.set([x * 6, y * 9, (x + y) * 3, 255], o);
      else data.set([...color, kind === 'see-through' ? alpha : 255], o);
    }
  }
  return { width: W, height: H, data };
}
const wallsOf = (seed) => {
  const next = random(seed);
  return Uint8Array.from({ length: W * H }, () => (next() < 0.15 ? 1 : 0));
};

test('floodFill gives the same pixels, alphas and order as before', () => {
  let cases = 0, filled = 0;
  for (const [kind, seed] of [['blocky', 1], ['blocky', 7], ['smooth', 3], ['see-through', 5]]) {
    const image = picture(kind, seed);
    for (const walls of [null, wallsOf(seed + 100)]) {
      for (const [tolerance, feather] of [[0, 0], [10, 2], [30, 10], [100, 2]]) {
        for (const contiguous of [true, false]) {
          for (const own of kind === 'see-through' ? [false, true] : [false]) {
            for (const [x, y] of [[0, 0], [18, 11], [W - 1, H - 1], [5, 20], [-1, 3], [W, 0]]) {
              const before = floodFillBefore(image, x, y, tolerance, contiguous, feather, walls, own);
              expect(floodFill(image, x, y, tolerance, contiguous, feather, walls, own)).toEqual(before);
              cases++;
              filled += before.length;
            }
          }
        }
      }
    }
  }
  expect(cases).toBe(480);
  expect(filled).toBeGreaterThan(50_000); // they fill, not just refuse
});

test('selectMatching gives the same mask as before', () => {
  let cases = 0;
  for (const seed of [2, 9, 4]) {
    const image = picture('blocky', seed), walls = wallsOf(seed + 50);
    const colorAt = (i) => image.data.slice(i * 4, i * 4 + 3).join();
    for (const allowed of [null, (i) => !walls[i]]) {
      for (const contiguous of [true, false]) {
        for (const [x, y] of [[0, 0], [18, 11], [W - 1, H - 1], [30, 2]]) {
          const seedColor = colorAt(y * W + x), same = (i) => colorAt(i) === seedColor, options = { width: W, height: H, start: { x, y }, same, contiguous, allowed };
          expect(selectMatching(options)).toEqual(selectMatchingBefore(options));
          cases++;
        }
      }
    }
  }
  expect(cases).toBe(48);
});
