// Blur: a Gaussian run across and then down before the other effects, so a hard edge goes soft, Blur 0
// leaves the picture as it was, and Edges read the blurred picture (noise draws no outlines).
import { test, expect } from 'vitest';
import { processedImage } from '@/lib/ImageProcessor.js';
import { settingDefaults } from '@/store/settings.js';
import { ctx2d } from '@/lib/Canvas.js';

const W = 160, H = 80;
const params = (over) => ({ ...settingDefaults(), cols: 80, rows: 40, ...over });
const red = (canvas) => [...ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data].filter((_, i) => i % 4 === 0);

// Black on the left, white on the right.
function halves() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = ctx2d(canvas);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(W / 2, 0, W / 2, H);
  return canvas;
}

// Gray with random speckles (seeded, so every run is alike): fine noise.
function noise() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = ctx2d(canvas), image = ctx.createImageData(W, H);
  let seed = 1;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < W * H; i++) image.data.set([64 + next() * 128, 128, 128, 255], i * 4);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

test('a hard edge goes soft, and Blur 0 leaves it hard', async () => {
  const image = halves();
  const sharp = new Set(red(await processedImage(image, params({ blur: 0 }))));
  expect([...sharp].sort((a, b) => a - b)).toEqual([0, 255]);
  const soft = red(await processedImage(image, params({ blur: 6 })));
  expect(soft.filter((v) => v > 20 && v < 235).length).toBeGreaterThan(0);
  expect(Math.min(...soft)).toBe(0);     // far from the edge it's as it was
  expect(Math.max(...soft)).toBe(255);
});

test('Edges read the blurred picture: noise draws outlines, blurred noise doesn\'t', async () => {
  const image = noise();
  const outlined = (blur) => processedImage(image, params({ blur, edges: 4, edgeColor: '#ff0000' }))
    .then((canvas) => red(canvas).filter((v) => v > 200).length);
  const raw = await outlined(0), blurred = await outlined(4);
  expect(raw).toBeGreaterThan(0);
  expect(blurred).toBeLessThan(raw / 10);
});
