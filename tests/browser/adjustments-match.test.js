// The color adjustments in the shader and in their JavaScript twin (PixelTransforms: the colors cells keep, paint
// as it shows, the chips, Bake) give the same colors, however far Brightness and Contrast push a color past full or
// below zero before Colorize, Saturation and Hue read it.
import { test, expect } from 'vitest';
import { adjustedPixels } from '@/lib/ImageProcessor.js';
import { applyTransforms } from '@/lib/PixelTransforms.js';
import { settingDefaults } from '@/store/settings.js';
import { ctx2d } from '@/lib/Canvas.js';

// Every gray, and three color ramps: 256 x 4.
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
  'Hue after Brightness and Contrast': { brightness: 120, contrast: 130, hue: 40 },
  'Saturation after a strong Contrast': { contrast: 300, saturation: 60 },
  'Saturation boosted after Brightness': { brightness: 180, saturation: 250 },
  'Colorize after a strong Contrast': { contrast: 250, colorizeStrength: 60, colorize: '#22aa77' },
  'everything, with Levels and Posterize': { brightness: 140, contrast: 160, saturation: 130, hue: 200, colorizeStrength: 30, invert: 20, levelsBlack: 15, levelsMid: 1.4, posterize: 6 },
  'Brightness and Contrast down': { brightness: 30, contrast: 40, hue: 120, saturation: 140 },
};

for (const [name, settings] of Object.entries(CASES)) {
  test(name, () => {
    const canvas = ramps(), params = { ...settingDefaults(), ...settings };
    const shader = adjustedPixels(canvas, params);
    const twin = ctx2d(canvas).getImageData(0, 0, 256, 4).data;
    applyTransforms(twin, params);
    // Off by one at most, where a float lands on a rounding edge.
    const worst = Math.max(...[...shader].map((v, i) => Math.abs(v - twin[i])));
    expect(worst).toBeLessThanOrEqual(1);
  });
}
