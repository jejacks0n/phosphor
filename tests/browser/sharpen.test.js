// Sharpen sharpens the adjusted picture: it sets each pixel against its adjusted neighbors, so where the picture is
// flat it stays as the adjustments make it, and every color it shows there is one the picker can paint with.
import { test, expect } from 'vitest';
import { processedImage } from '@/lib/ImageProcessor.js';
import { applyTransforms, effectiveColor, paletteChoices } from '@/lib/PixelTransforms.js';
import { createTestApp, settle } from '../support/app.js';
import { settingDefaults } from '@/store/settings.js';
import { ctx2d } from '@/lib/Canvas.js';

const W = 160, H = 80;
const params = (over) => ({ ...settingDefaults(), cols: 80, rows: 40, ...over });

function flat(hex) {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = ctx2d(canvas);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

// The settings of a bug report's file: a skin tone colorized red, with its saturation brought down.
const ADJUSTED = { brightness: 129, contrast: 121, saturation: 39, levelsMid: 0.4, colorize: '#e32400', colorizeStrength: 100 };

test('a flat picture comes out as the adjustments alone make it, however strong Sharpen is', async () => {
  const image = flat('#c89070');
  const expected = new Uint8ClampedArray([0xc8, 0x90, 0x70, 255]);
  applyTransforms(expected, params(ADJUSTED));
  for (const sharpen of [50, 100]) {
    const out = ctx2d(await processedImage(image, params({ ...ADJUSTED, sharpen }))).getImageData(W / 2, H / 2, 1, 1).data;
    for (let c = 0; c < 3; c++) expect(Math.abs(out[c] - expected[c])).toBeLessThanOrEqual(1);
  }
});

test('Sharpen still sharpens an adjusted edge: the bright side gets brighter beside the dark', async () => {
  const canvas = flat('#303030');
  ctx2d(canvas).fillStyle = '#909090';
  ctx2d(canvas).fillRect(W / 2, 0, W / 2, H);
  const red = async (sharpen) => ctx2d(await processedImage(canvas, params({ brightness: 120, sharpen }))).getImageData(0, H / 2, W, 1).data;
  const soft = await red(0), sharp = await red(100);
  const edge = (W / 2) * 4; // the first bright pixel
  expect(sharp[edge]).toBeGreaterThan(soft[edge]);
  expect(sharp[edge - 4]).toBeLessThan(soft[edge - 4]);
  expect(sharp[20 * 4]).toBe(soft[20 * 4]); // far from the edge, as it was
});

// The report: a face sharpened and colorized red showed CGA red, which no swatch could paint with (the picker offers
// a stored color for each palette color that shows as it, and none showed as red: raw neighbors made the red).
test('every color the reporter\'s drawing shows under Colorize is one a swatch paints with', async () => {
  const { project } = await createTestApp();
  const url = '/tests/fixtures/projects/colorize-sharpen.phosphor';
  await project.loadProject(new File([await (await fetch(url)).blob()], 'colorize-sharpen.phosphor'));
  await settle(project);
  project.setSlider('colorizeStrength', 100);
  project.commitSliders();
  await settle(project);
  const palette = project.activePalette, choices = paletteChoices(project, palette);
  const paints = new Set(choices.map((hex) => effectiveColor(hex, project, palette).hex));
  const shown = new Set(project.cells.flatMap((cell) => [cell?.fg?.hex, cell?.bg?.hex]).filter(Boolean));
  expect([...shown].filter((hex) => !paints.has(hex))).toEqual([]);
});
