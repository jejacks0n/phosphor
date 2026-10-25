// Underlying colors come from the pipeline run with every color adjustment, effect and palette
// neutral: the image downsampled exactly as the pipeline does, before adjustments.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { baseParams } from '../../src/store/settings.js';
import { pickMode, pickTargetOf } from '../../src/lib/pickMode.js';
import { nearestColor, nearestIndex, paletteIndex, swatchSections, drawingColors, PALETTES } from '../../src/lib/ColorUtils.js';

test('Underlying colors come from the pipeline run with every color adjustment, effect and palette neutral: the image downsampled exactly as the pipeline does, before adjustments', async () => {
  const params = {
    cols: 80, rows: 50, smoothing: 'low', quantize: 'vga', renderStyle: 'ansi',
    brightness: 150, contrast: 80, saturation: 0, hue: 90, invert: 20, colorize: '#123456', colorizeStrength: 50,
    sharpen: 30, flatten: 4, edges: 2, edgeColor: '#ff0000', edgeThickness: 3,
  };
  const neutral = baseParams(params);
  assert.deepEqual(
    { brightness: neutral.brightness, contrast: neutral.contrast, saturation: neutral.saturation, hue: neutral.hue, invert: neutral.invert, colorizeStrength: neutral.colorizeStrength },
    { brightness: 100, contrast: 100, saturation: 100, hue: 0, invert: 0, colorizeStrength: 0 });
  // Effects (Flatten, Edges, Sharpen) work on neighboring pixels, so a cell can't re-apply them: the
  // source run keeps them, and baked/picked colors include the outline. Only per-pixel color
  // adjustments are neutral (they're re-applied per cell by effectiveColor).
  assert.deepEqual({ sharpen: neutral.sharpen, flatten: neutral.flatten, edges: neutral.edges, edgeColor: neutral.edgeColor, edgeThickness: neutral.edgeThickness },
    { sharpen: 30, flatten: 4, edges: 2, edgeColor: '#ff0000', edgeThickness: 3 });
  // CGA/VGA are applied per pixel inside the pipeline before downsampling, so the source run keeps
  // them (that's what makes picking up and putting back exact); other palettes are applied after.
  assert.equal(neutral.quantize, 'vga');
  assert.equal(baseParams({ ...params, quantize: 'count' }).quantize, 'none');
  assert.equal(baseParams({ ...params, quantize: 'palette' }).quantize, 'none');
  assert.deepEqual([neutral.cols, neutral.rows, neutral.smoothing], [80, 50, 'low']); // same grid and downsampling
  assert.equal(params.brightness, 150);                    // input untouched

  // One snapping rule everywhere: the exact nearest color (what the shader's CGA/VGA snap picks
  // too), remembered per color for palettes of 16+, so incremental updates, stored colors and a
  // moved block of the base snap like a full render.
  for (let i = 0; i < 4096; i++) {
    const r = (i * 97) & 255, g = (i * 61) & 255, b = (i * 151) & 255;
    assert.equal(nearestColor({ r, g, b }, PALETTES.vga).c, paletteIndex(r, g, b, PALETTES.vga));
    assert.equal(paletteIndex(r, g, b, PALETTES.vga), nearestIndex(r, g, b, PALETTES.vga));
    assert.equal(paletteIndex(r, g, b, PALETTES.cga), nearestIndex(r, g, b, PALETTES.cga));
  }
  const tiny = PALETTES.cga.slice(0, 3);                  // under 16 colors: exact search
  assert.equal(paletteIndex(200, 10, 10, tiny), nearestIndex(200, 10, 10, tiny));
  // The picker lays out the active palette by type; colors already used by edit cells come first.
  assert.deepEqual(swatchSections('cga', PALETTES.cga).map(s => [s.columns, s.colors.length]), [[8, 16]]);
  assert.deepEqual(swatchSections('vga', PALETTES.vga).map(s => [s.columns, s.colors.length]), [[16, 16], [36, 216], [24, 24]]);
  assert.deepEqual(swatchSections('none', null), []);
  assert.deepEqual(swatchSections('palette', PALETTES.cga.slice(0, 3)).map(s => s.columns), [3]);
  assert.deepEqual(swatchSections('count', []), []);
  const edits = new Map([['0,0', { fg: '#ff0000' }], ['1,0', { fg: '#ff0000', bg: '#0000ff' }], ['2,0', { char: 'x' }]]);
  assert.deepEqual(drawingColors(edits), ['#ff0000', '#0000ff']);
  assert.equal(drawingColors(edits, undefined, 1).length, 1);
  assert.deepEqual(drawingColors(edits, new Map([['#00ff00', 5], ['#0000ff', 2]])), ['#00ff00', '#0000ff', '#ff0000']); // paint counts add to the cells'
  // What an eyedropper click picks.
  const pm = (o) => pickMode({ view: 'output', renderStyle: 'ansi', shiftKey: false, altKey: false, swapped: false, ...o });
  assert.equal(pm({ view: 'input', altKey: true }), 'fg');             // pixel view: always the paint color
  assert.equal(pm({ altKey: true, swapped: true }), 'fg');             // Alt-swapped from a paint tool: the paint color
  assert.equal(pm({ altKey: true, shiftKey: true, swapped: true }), 'bg');                 // Alt+Shift: the background
  assert.equal(pm({ view: 'input', altKey: true, shiftKey: true, swapped: true }), 'bg');  // in the pixel view too
  assert.equal(pm({ renderStyle: 'ascii', shiftKey: true }), 'fg');    // only ever colors, in every art style
  assert.equal(pm({ shiftKey: true }), 'fg');
  assert.equal(pm({ altKey: true }), 'bg');
  assert.equal(pm({}), 'both');                                        // default: foreground and background
  // The ANSI view's picker option (FG, BG or Both) sets what a plain click picks; Shift/Alt override it.
  assert.equal(pm({ target: 'bg' }), 'bg');
  assert.equal(pm({ target: 'fg' }), 'fg');
  assert.equal(pm({ target: 'bg', shiftKey: true }), 'fg');
  assert.equal(pm({ target: 'fg', altKey: true }), 'bg');
  assert.equal(pm({ view: 'input', target: 'both' }), 'fg');           // the pixel view picks the paint color
  // The Picker's [FG][BG] toggles: both lit picks both.
  assert.equal(pickTargetOf({ fg: true, bg: true }), 'both');
  assert.equal(pickTargetOf({ fg: true, bg: false }), 'fg');
  assert.equal(pickTargetOf({ fg: false, bg: true }), 'bg');
});
