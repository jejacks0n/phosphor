// Bake: the picture as it shows becomes the image and the sliders go back to neutral, with nothing on
// the canvas changing (docs/layers.md, Baking). Under CGA and VGA, keeping full color can tip
// cells to the neighboring palette color (the baked image is rounded to 8 bits, the shader snapped
// at full precision; with many sliders on a gradient that's ~13% of cells), so that test pins only
// what's guaranteed; locking to the palette bakes it in, and nothing moves.
import { describe, test, expect, vi } from 'vitest';
import { makeArt } from '@/document/artLayers.js';
import { rectShape } from '@/document/shapes.js';
import { toastMessage } from '@/composables/useToast.js';
import { getEffectiveColor } from '@/lib/PixelTransforms.js';
import { createTestApp, loadImage, settle, cellsKey, halves } from '../support/app.js';
import { drawnDocument, outputKey } from '../support/scenes.js';

const SLIDERS = { brightness: 140, contrast: 160, saturation: 130, hue: 40, colorizeStrength: 30, levelsBlack: 20, levelsMid: 1.3, posterize: 8, blur: 2, sharpen: 40, edges: 2 };
// A copied block holds the picture's colors before effects (Sharpen, Edges), and pasted base pixels
// sit outside the effects, so a block pasted back under effects loses them, bake or not. The
// paste-back check uses the color sliders only.
const COLOR_SLIDERS = { brightness: 140, contrast: 160, saturation: 130, hue: 40, colorizeStrength: 30 };

describe('nothing on the canvas changes', () => {
  test('a picture that can\'t be encoded says so and bakes nothing', async () => {
    const { project, workspace } = await createTestApp();
    await drawnDocument(project, workspace);
    Object.assign(project, SLIDERS);
    await settle(project);
    const cells = cellsKey(project), image = project.image;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const encoding = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null));
    try {
      await project.bake();
      expect(alert).toHaveBeenCalledWith("Couldn't bake the image.");
    } finally {
      encoding.mockRestore();
      alert.mockRestore();
      error.mockRestore();
    }
    expect(project.image).toBe(image);
    expect(project.brightness).toBe(SLIDERS.brightness);
    expect(cellsKey(project)).toEqual(cells);
  });

  // Dithered or with Best match, CGA and VGA snap on the grid as the other palettes do, so they bake exactly too.
  const BEST = { charChoice: 'best', chars: '▄░▒▓█' };
  for (const [quantize, dithering = {}] of [['none'], ['count'], ['palette'], ['cga', { dither: 100 }], ['vga', { dither: 60, ditherStyle: 'bayer' }], ['count', { dither: 100 }],
    ['cga', BEST], ['vga', { ...BEST, dither: 100 }], ['cga', { charChoice: 'shape' }]]) {
    test(`color palette: ${quantize}${dithering.dither ? `, dithered (${dithering.ditherStyle ?? 'floyd'})` : ''}${dithering.charChoice ? `, ${dithering.charChoice === 'best' ? 'Best match' : 'By shape'}` : ''}`, async () => {
      const { project, workspace } = await createTestApp();
      await drawnDocument(project, workspace, { quantize, clipboard: true });
      Object.assign(project, SLIDERS, dithering);
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
    test(`color palette: ${quantize} (cells stay palette colors; some may tip to a neighbor)`, async () => {
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

    test(`color palette: ${quantize}, locked to it: nothing changes, and the picture is palette colors only`, async () => {
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
      for (let o = 0; o < data.length; o += 4) if (!palette.has(hex(o))) throw new Error(`baked pixel ${o / 4} is ${hex(o)}, not a ${quantize} color`);
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

test('the color pair and a copied block keep their look', async () => {
  const { project, workspace } = await createTestApp();
  await drawnDocument(project, workspace, { clipboard: true });
  workspace.editFgColor = '#33cc66';
  Object.assign(project, COLOR_SLIDERS);
  await settle(project);
  const { getEffectiveColor } = await import('@/lib/PixelTransforms');
  const swatch = getEffectiveColor(workspace.editFgColor, project, project.activePalette);
  await project.bake();
  await settle(project);
  expect(getEffectiveColor(workspace.editFgColor, project, project.activePalette)).toBe(swatch);
  // Pasting the pre-bake block back over itself: the same look, within a level (the block's colors
  // are baked in JavaScript, the picture by the shader; they round differently by at most one).
  const shown = halves(project);
  project.pasteSelection(workspace.clipboard, 10, 6);
  await settle(project);
  const after = halves(project);
  expect(Math.max(...shown.flatMap((h, i) => h.map((v, k) => Math.abs(v - after[i][k]))))).toBeLessThanOrEqual(1);
});

test('undo and redo', async () => {
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
  expect(project.brightness).toBe(100); // slider moves after a bake are steps of their own (slider-history.test.js)
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

// A block of art cells: A on blue over yellow, and C with only its bottom half colored.
const BLOCK = () => makeArt({ z: 0, m: [1, 0, 0, 1, 5, 6], art: { cols: 3, rows: 1, cells: [[0, 'A', '#2040a0', '#a0a040'], [2, 'C', null, '#40a040']] } });

test('Bake in an animation keeps an art layer, its colors through the sliders', async () => {
  const { project } = await createTestApp();
  await project.setBlankCanvas({ cols: 20, rows: 20 });
  await settle(project);
  const art = project.addShape(BLOCK());
  project.setAnimate(true);
  project.addFrame('blank');
  project.addFrame('wipe');
  project.showFrame(0);
  project.brightness = 140;
  const params = project.processParams;
  await settle(project);
  const looks = [];
  for (let i = 0; i < project.frames.length; i++) {
    project.showFrame(i);
    await settle(project);
    looks.push(cellsKey(project));
  }
  await project.bake();
  project.showFrame(0);
  await settle(project);
  const { cells } = project.shapes.get(art).art;
  expect(cells.map(([i, char]) => [i, char])).toEqual([[0, 'A'], [2, 'C']]);
  expect(cells[0].slice(2)).toEqual(['#2040a0', '#a0a040'].map((c) => getEffectiveColor(c, params)));
  expect(cells[0][2]).not.toBe('#2040a0');
  expect(cells[1].slice(2)).toEqual([null, getEffectiveColor('#40a040', params)]);
  expect(project.brightness).toBe(100);
  for (let i = 0; i < project.frames.length; i++) {
    project.showFrame(i);
    await settle(project);
    expect(cellsKey(project)).toEqual(looks[i]);
  }
  project.undo();
  project.showFrame(0);
  expect(project.shapes.get(art).art.cells[0][2]).toBe('#2040a0');
});

test('Bake on a still presses an art layer into the base, its characters pinned, and nothing changes', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  project.addShape(BLOCK());
  project.brightness = 140;
  await settle(project);
  const cells = cellsKey(project);
  await project.bake();
  await settle(project);
  expect(project.shapes.size).toBe(0);
  expect([...project.baseRecords.pins]).toEqual(expect.arrayContaining([['5,3', 'A'], ['7,3', 'C']]));
  expect(cellsKey(project)).toEqual(cells);
});

// The bottom with a shape on its vector layer, Layer 1, a vector layer above Layer 1 with a shape, and Layer 2 on top
// with a letter and paint, waiting while Layer 1 is in use.
async function stack() {
  const app = await createTestApp(), { project, workspace } = app;
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  const pressed = project.addShape(rectShape(2, 2, 10, 10, { fill: '#ff0000' }));
  project.commitEdit();
  const upper = project.addLayer('vector', 'edit');
  workspace.pickLayer(upper);
  const kept = project.addShape(rectShape(12, 12, 22, 24, { fill: '#00ff00' }));
  project.commitEdit();
  const top = project.addLayer('cells', upper);
  workspace.pickLayer(top);
  project.typeAt(20, 3, 'Z', { fg: '#ffee00', bg: '#0044aa' });
  project.commitEdit();
  project.paintStroke(Array.from({ length: 8 }, (_, k) => ({ x: 18 + k, y: 20, alpha: 1 })), '#ff3300');
  project.commitEdit();
  workspace.pickLayer('edit');
  await settle(project);
  return { ...app, pressed, kept, upper, top };
}

test('Bake presses only the vector layers on the bottom: a vector layer above Layer 1 keeps its shapes, and every layer keeps its look', async () => {
  const { project, pressed, kept } = await stack();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', 'edit', 'L1', 'L2']);
  Object.assign(project, COLOR_SLIDERS);
  await settle(project);
  const cells = cellsKey(project);
  await project.bake();
  await settle(project);
  expect(project.shapes.has(pressed)).toBe(false);
  expect(project.shapes.has(kept)).toBe(true);
  expect(project.brightness).toBe(100);
  expect(cellsKey(project)).toEqual(cells);
  project.render();
  await settle(project);
  expect(cellsKey(project)).toEqual(cells);
});

test('a vector layer on the bottom with its own character settings stays shapes through Bake, and Merge down says why it can\'t', async () => {
  const { project } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  const key = project.addShape(rectShape(2, 2, 10, 10, { fill: '#ff0000' }));
  project.commitEdit();
  project.setLayerChars('vector', { chars: '░▒' });
  project.brightness = 140;
  await settle(project);
  const cells = cellsKey(project);
  await project.bake();
  await settle(project);
  expect(project.shapes.has(key)).toBe(true);
  expect(cellsKey(project)).toEqual(cells);
  const version = project.history.version;
  for (const merge of [() => project.mergeDown('vector'), () => project.mergeShapes([key])]) {
    toastMessage.value = null;
    merge();
    expect(toastMessage.value).toBe('Vector 1 has its own character settings, so its shapes can\'t be pressed into the layer under it.');
    expect(project.shapes.has(key)).toBe(true);
    expect(project.history.version).toBe(version);
  }
});

test('a hidden vector layer on the bottom is never lost to Bake: it\'s refused until it shows', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 30, rows: 30 });
  project.addShape(rectShape(2, 2, 10, 10, { fill: '#ff0000' }));
  project.commitEdit();
  const second = project.addLayer('vector', 'vector');
  workspace.pickLayer(second);
  const key = project.addShape(rectShape(12, 4, 20, 12, { fill: '#0000ff' }));
  project.commitEdit();
  expect(project.layers.map((l) => l.id)).toEqual(['base', 'vector', second, 'edit']);
  project.setLayerHidden(second, true);
  project.brightness = 140;
  await settle(project);
  toastMessage.value = null;
  await project.bake();
  expect(toastMessage.value).toBe('Show the layer to merge it');
  expect(project.shapes.has(key)).toBe(true);
  expect(project.brightness).toBe(140);
});

test('Bake leaves a vector layer over a hidden cells layer: it isn\'t on the bottom', async () => {
  const { project, workspace } = await createTestApp();
  await loadImage(project, '/tests/fixtures/images/gradient.png', { cols: 20, rows: 20 });
  project.typeAt(4, 4, 'A', { fg: '#ffee00' });
  project.commitEdit();
  const vector = project.addLayer('vector', 'edit');
  workspace.pickLayer(vector);
  const key = project.addShape(rectShape(2, 2, 12, 12, { fill: '#ff0000' }));
  project.setLayerHidden('edit', true); // shown, the vector layer looks like it's on the bottom
  project.brightness = 140;
  await settle(project);
  await project.bake();
  await settle(project);
  expect([...project.shapes.keys()]).toEqual([key]);
});
