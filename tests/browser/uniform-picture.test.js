// A blank canvas's picture is black all over, said so where it's made (markUniform): processImage puts one pixel of it
// through the pipeline and fills the grid with that. It comes out as the whole picture through the pipeline would.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';
import { processImage } from '@/lib/ImageProcessor.js';
import { loadImage } from '@/document/projectIO.js';
import { blackPicture } from '@/store/project/shared.js';

const SETTINGS = [
  {},
  { brightness: 180, contrast: 40 },
  { invert: 100, hue: 120, saturation: 200 },
  { colorize: '#33cc66', colorizeStrength: 70, brightness: 150 },
  { levelsBlack: 0, levelsWhite: 40, levelsMid: 2.5, invert: 30 },
  { posterize: 3, brightness: 160, invert: 60 },
  { threshold: 1, thresholdDark: '#ff0000', thresholdLight: '#00ff00' },
  { threshold: 200, thresholdDark: '#123456', thresholdLight: '#abcdef', invert: 100 },
  { blur: 6, invert: 100 },
  { sharpen: 80, invert: 70 },
  { flatten: 7, brightness: 200, contrast: 200 },
  { edges: 20, edgeColor: '#ff00ff', edgeThickness: 3 },
  { quantize: 'cga', invert: 45 },
  { quantize: 'vga', colorize: '#ff8800', colorizeStrength: 100, brightness: 250, flatten: 5 },
  { smoothing: 'low', invert: 100 },
  { smoothing: 'medium', hue: 40, invert: 80, saturation: 0 },
  { charChoice: 'shape', invert: 50 },
];

const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;

for (const [cols, rows] of [[24, 30], [24, 12], [10, 40]]) { // the picture fills the grid, or a letterbox beside or above it
  test(`a blank picture's one pixel comes out as the whole picture through the pipeline (${cols} x ${rows} grid)`, async () => {
    const { project } = await createTestApp();
    await project.setBlankCanvas({ cols: 24, rows: 30 });
    const { image, imageBuffer } = await blackPicture(24, 30, 10), whole = await loadImage(imageBuffer); // the same picture, unmarked
    const keys = [...new Set(SETTINGS.flatMap(Object.keys))], defaults = Object.fromEntries(keys.map((key) => [key, project[key]]));
    for (const settings of SETTINGS) {
      Object.assign(project, defaults, settings);
      const params = { ...project.processParams, cols, rows, fit: null, workScale: null };
      const one = await processImage(image, params), all = await processImage(whole, params);
      expect(pixels(one.canvas.canvas), JSON.stringify(settings)).toEqual(pixels(all.canvas.canvas));
      expect(one.samples?.data, JSON.stringify(settings)).toEqual(all.samples?.data);
      expect(!!one.samples).toBe(!!settings.charChoice);
    }
  });
}
