// Levels, Posterize and Threshold in the shader give the colors their JavaScript twin gives (the colors
// cells keep, the chips, Bake), so a block moved into the base layer or a baked picture doesn't shift.
import { test, expect } from 'vitest';
import { adjustedPixels } from '@/lib/ImageProcessor.js';
import { applyTransforms } from '@/lib/PixelTransforms.js';
import { settingDefaults } from '@/store/settings.js';
import { ctx2d } from '@/lib/Canvas.js';

// Every gray, and a red, green and blue ramp: 256 x 4.
function ramps() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 4 });
  const ctx = ctx2d(canvas), image = ctx.createImageData(256, 4);
  for (let x = 0; x < 256; x++) {
    image.data.set([x, x, x, 255], x * 4);
    image.data.set([x, 255 - x, 60, 255], (256 + x) * 4);
    image.data.set([200, x, 255 - x, 255], (512 + x) * 4);
    image.data.set([x, 128, x, 255], (768 + x) * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const CASES = {
  levels: { levelsBlack: 30, levelsWhite: 220, levelsMid: 1.6 },
  posterize: { posterize: 5 },
  threshold: { threshold: 110, thresholdDark: '#2a1000', thresholdLight: '#ffb000' },
  'with the others': { brightness: 120, contrast: 130, hue: 40, saturation: 80, invert: 30, levelsBlack: 20, levelsMid: 0.7, posterize: 6 },
  'all three': { levelsWhite: 200, levelsMid: 1.3, posterize: 4, threshold: 90, thresholdLight: '#00ffcc' },
};

for (const [name, settings] of Object.entries(CASES)) {
  test(name, () => {
    const canvas = ramps(), params = { ...settingDefaults(), ...settings };
    const shader = adjustedPixels(canvas, params);
    const twin = ctx2d(canvas).getImageData(0, 0, 256, 4).data;
    applyTransforms(twin, params);
    // Off by one at most where a float lands on a rounding edge; a step or a threshold flipping would be far more.
    const off = [...shader].map((v, i) => Math.abs(v - twin[i])).filter((d) => d > 1);
    expect(off).toEqual([]);
  });
}
