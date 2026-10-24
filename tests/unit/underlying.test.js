// Underlying colours come from the pipeline run with every colour adjustment, effect and palette
// neutral: the image downsampled exactly as the pipeline does, before adjustments.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { baseParams } from '../../src/store/settings.js';
import { pickMode, pickTargetOf } from '../../src/lib/pickMode.js';
import { nearestColor, nearestIndex, paletteIndex, swatchSections, drawingColors, PALETTES } from '../../src/lib/ColorUtils.js';

test('Underlying colours come from the pipeline run with every colour adjustment, effect and palette neutral: the image downsampled exactly as the pipeline does, before adjustments', async () => {
  const params = {
    cols: 80, rows: 50, smoothing: 'low', quantize: 'vga', renderStyle: 'ansi',
    brightness: 150, contrast: 80, saturation: 0, hue: 90, invert: 20, colorize: '#123456', colorizeStrength: 50,
    sharpen: 30, flatten: 4, edges: 2, edgeColor: '#ff0000', edgeThickness: 3,
  };
  const neutral = baseParams(params);
  assert.deepEqual(
    { brightness: neutral.brightness, contrast: neutral.contrast, saturation: neutral.saturation, hue: neutral.hue, invert: neutral.invert, colorizeStrength: neutral.colorizeStrength },
    { brightness: 100, contrast: 100, saturation: 100, hue: 0, invert: 0, colorizeStrength: 0 });
  // Effects (Flatten, Edges, Sharpen) work on neighbouring pixels, so a cell can't re-apply them: the
  // source run keeps them, and baked/picked colours include the outline. Only per-pixel colour
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

  // One snapping rule everywhere: nearestColor uses the same 5-bit lookup the full render quantizes
  // with (palettes of 16+), so incremental updates and stored colours snap like a full render.
  let lutDiffersFromExact = 0;
  for (let i = 0; i < 4096; i++) {
    const r = (i * 97) & 255, g = (i * 61) & 255, b = (i * 151) & 255;
    assert.equal(nearestColor({ r, g, b }, PALETTES.vga).c, paletteIndex(r, g, b, PALETTES.vga));
    if (paletteIndex(r, g, b, PALETTES.vga) !== nearestIndex(r, g, b, PALETTES.vga)) lutDiffersFromExact++;
  }
  assert.ok(lutDiffersFromExact > 0);                     // the lookup really is coarser than exact search
  const tiny = PALETTES.cga.slice(0, 3);                  // under 16 colours: exact search
  assert.equal(paletteIndex(200, 10, 10, tiny), nearestIndex(200, 10, 10, tiny));
  // Snapping a full 300 x 300 grid must stay cheap: composite() requantizes on every paint move.
  const t0 = performance.now();
  for (let i = 0; i < 90000; i++) paletteIndex(i & 255, (i >> 3) & 255, (i >> 7) & 255, PALETTES.vga);
  assert.ok(performance.now() - t0 < 60, `90k snaps took ${Math.round(performance.now() - t0)}ms`);
  // The picker lays out the active palette by type; colours already used by edit cells come first.
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
  assert.equal(pm({ view: 'input', altKey: true }), 'fg');             // pixel view: always the paint colour
  assert.equal(pm({ altKey: true, swapped: true }), 'fg');             // Alt-swapped from a paint tool: the paint colour
  assert.equal(pm({ renderStyle: 'ascii', shiftKey: true }), 'fg');    // only ever colours, in every art style
  assert.equal(pm({ shiftKey: true }), 'fg');
  assert.equal(pm({ altKey: true }), 'bg');
  assert.equal(pm({}), 'both');                                        // default: foreground and background
  // The ANSI view's picker option (FG, BG or Both) sets what a plain click picks; Shift/Alt override it.
  assert.equal(pm({ target: 'bg' }), 'bg');
  assert.equal(pm({ target: 'fg' }), 'fg');
  assert.equal(pm({ target: 'bg', shiftKey: true }), 'fg');
  assert.equal(pm({ target: 'fg', altKey: true }), 'bg');
  assert.equal(pm({ view: 'input', target: 'both' }), 'fg');           // the pixel view picks the paint colour
  // The Picker's [FG][BG] toggles: both lit picks both.
  assert.equal(pickTargetOf({ fg: true, bg: true }), 'both');
  assert.equal(pickTargetOf({ fg: true, bg: false }), 'fg');
  assert.equal(pickTargetOf({ fg: false, bg: true }), 'bg');
});
