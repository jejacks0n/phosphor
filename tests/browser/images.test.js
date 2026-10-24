// Images in: every kind the fixtures cover loads and converts to the same cells as its reference
// (software WebGL makes conversion the same on every machine). Plus one image across the colour
// palettes, art styles and adjustments.
import { describe, test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey } from '../support/app.js';
import { matchReference } from '../support/references.js';

const IMAGES = ['gradient.png', 'rgba.png', 'deep16.png', 'one.png', 'tall.png', 'tiny.gif', 'photo.jpg', 'photo.webp', 'p3.png'];

describe('each image type loads and converts', () => {
  for (const name of IMAGES) {
    test(name, async () => {
      const { project } = await createTestApp();
      await loadImage(project, `/tests/fixtures/images/${name}`, { cols: 40, rows: 40 });
      expect(project.cells).toHaveLength(40 * 20);
      await matchReference(`conversion/${name}-40x40.txt`, cellsKey(project).join('\n'));
    });
  }
});

describe('one image across settings', () => {
  const VARIANTS = {
    'count-16': { quantize: 'count', colorCount: 16 },
    cga: { quantize: 'cga' },
    vga: { quantize: 'vga' },
    'color-ascii': { renderStyle: 'colorAscii' },
    ascii: { renderStyle: 'ascii' },
    'brightness-edges': { brightness: 140, edges: 3 },
  };
  for (const [name, settings] of Object.entries(VARIANTS)) {
    test(name, async () => {
      const { project } = await createTestApp();
      await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
      Object.assign(project, settings);
      await settle(project);
      await matchReference(`conversion/gradient-40x40-${name}.txt`, cellsKey(project).join('\n'));
    });
  }
});
