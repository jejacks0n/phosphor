// Bake: the picture as it shows becomes the image and the sliders go back to neutral, with nothing on
// the canvas changing (docs/layers.md, Baking). Under CGA and VGA, keeping full colour can tip
// cells to the neighbouring palette colour (the baked image is rounded to 8 bits, the shader snapped
// at full precision; with many sliders on a gradient that's ~13% of cells), so that test pins only
// what's guaranteed; locking to the palette bakes it in, and nothing moves.
import { describe, test, expect } from 'vitest';
import { createTestApp, loadImage, settle, cellsKey, halves } from '../support/app.js';
import { drawnDocument, outputKey } from '../support/scenes.js';

const SLIDERS = { brightness: 140, contrast: 160, saturation: 130, hue: 40, colorizeStrength: 30, sharpen: 40, edges: 2 };
// A copied block holds the picture's colours before effects (Sharpen, Edges), and pasted base pixels
// sit outside the effects, so a block pasted back under effects loses them, bake or not. The
// paste-back check uses the colour sliders only.
const COLOUR_SLIDERS = { brightness: 140, contrast: 160, saturation: 130, hue: 40, colorizeStrength: 30 };

describe('nothing on the canvas changes', () => {
  for (const quantize of ['none', 'count', 'palette']) {
    test(`colour palette: ${quantize}`, async () => {
      const { project, workspace } = await createTestApp();
      await drawnDocument(project, workspace, { quantize, clipboard: true });
      Object.assign(project, SLIDERS);
      await settle(project);
      const cells = cellsKey(project), output = outputKey(project);
      await project.bake();
      await settle(project);
      expect(cellsKey(project)).toEqual(cells);
      expect(outputKey(project)).toBe(output);
      expect(project.canBake).toBe(false);
      expect(project.brightness).toBe(100);
    });
  }

  for (const quantize of ['cga', 'vga']) {
    test(`colour palette: ${quantize} (cells stay palette colours; some may tip to a neighbour)`, async () => {
      const { project, workspace } = await createTestApp();
      await drawnDocument(project, workspace, { quantize });
      Object.assign(project, SLIDERS);
      await settle(project);
      await project.bake();
      await settle(project);
      const palette = new Set(project.activePalette.map((p) => p.hex.toLowerCase()));
      for (const cell of project.cells) {
        expect(palette.has(cell.fg.hex.toLowerCase()) && palette.has(cell.bg.hex.toLowerCase())).toBe(true);
      }
      expect(project.canBake).toBe(false);
    });

    test(`colour palette: ${quantize}, locked to it: nothing changes, and the picture is palette colours only`, async () => {
      const { project, workspace } = await createTestApp();
      await drawnDocument(project, workspace, { quantize, clipboard: true });
      Object.assign(project, SLIDERS);
      await settle(project);
      const cells = cellsKey(project), output = outputKey(project);
      await project.bake({ lockPalette: true });
      await settle(project);
      expect(cellsKey(project)).toEqual(cells);
      expect(outputKey(project)).toBe(output);
      const palette = new Set(project.activePalette.map((p) => p.hex.toLowerCase()));
      const { naturalWidth: w, naturalHeight: h } = project.image;
      const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
      ctx.drawImage(project.image, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data, hex = (o) => `#${[0, 1, 2].map((k) => data[o + k].toString(16).padStart(2, '0')).join('')}`;
      for (let o = 0; o < data.length; o += 4) if (!palette.has(hex(o))) throw new Error(`baked pixel ${o / 4} is ${hex(o)}, not a ${quantize} colour`);
    });
  }

  test('in a canvas-resized grid (the fit frozen)', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    project.cols = 64;
    Object.assign(project, SLIDERS);
    await settle(project);
    const cells = cellsKey(project), fit = JSON.stringify(project.fit);
    await project.bake();
    await settle(project);
    expect(cellsKey(project)).toEqual(cells);
    expect(JSON.stringify(project.fit)).toBe(fit);
  });
});

test('the colour pair and a copied block keep their look', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { clipboard: true });
  workspace.editFgColor = '#33cc66';
  Object.assign(project, COLOUR_SLIDERS);
  await settle(project);
  const { getEffectiveColor } = await import('@/lib/PixelTransforms');
  const swatch = getEffectiveColor(workspace.editFgColor, project, project.activePalette);
  await project.bake();
  await settle(project);
  expect(getEffectiveColor(workspace.editFgColor, project, project.activePalette)).toBe(swatch);
  // Pasting the pre-bake block back over itself: the same look, within a level (the block's colours
  // are baked in JavaScript, the picture by the shader; they round differently by at most one).
  const shown = halves(project);
  project.pasteSelection(workspace.clipboard, 10, 6);
  await settle(project);
  const after = halves(project);
  expect(Math.max(...shown.flatMap((h, i) => h.map((v, k) => Math.abs(v - after[i][k]))))).toBeLessThanOrEqual(1);
});

test('undo and redo, and a second round of sliders kept for redo', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace);
  Object.assign(project, SLIDERS);
  await settle(project);
  const before = cellsKey(project), image = project.image;
  await project.bake();
  await settle(project);
  const after = cellsKey(project);
  project.undo();
  await settle(project);
  expect(cellsKey(project)).toEqual(before);
  expect(project.image).toBe(image);
  expect(project.brightness).toBe(140);
  project.redo();
  await settle(project);
  expect(cellsKey(project)).toEqual(after);
  project.contrast = 150;
  await settle(project);
  project.undo();
  project.redo();
  await settle(project);
  expect(project.contrast).toBe(150);
});

test('another image loaded while baking is left alone', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 40, rows: 40 });
  project.brightness = 130;
  await settle(project);
  const baking = project.bake();
  const blob = await (await fetch('/tests/fixtures/images/rgba.png')).blob();
  await project.setImageFromFile(new File([blob], 'rgba.png', { type: 'image/png' }));
  const loaded = project.image;
  await baking;
  await settle(project);
  expect(project.image).toBe(loaded);
  expect(project.canUndo).toBe(false);
});
