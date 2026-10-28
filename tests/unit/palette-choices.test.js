// The color picker's swatches with the color adjustments moved: each palette color's swatch stores a
// color that displays as that palette color, so every color in the palette can be painted with.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { paletteChoices, effectiveColor } from '../../src/lib/PixelTransforms.js';
import { parseColorList, PALETTES } from '../../src/lib/ColorUtils.js';

const neutral = { brightness: 100, contrast: 100, saturation: 100, hue: 0, invert: 0, colorize: '#ff00ff', colorizeStrength: 0 };
const shows = (hex, params, palette) => effectiveColor(hex, params, palette).hex;

test('Swatches: with the adjustments neutral, each palette color is its own swatch', () => {
  const palette = parseColorList('#FFFFFF #AA5601 #E03020 #000000 #4A4A4A');
  assert.deepEqual(paletteChoices(neutral, palette), palette.map(p => p.hex));
});

test('Swatches: with the adjustments moved, each swatch still paints its palette color', () => {
  const palette = parseColorList('#FFFFFF #AA5601 #E03020 #000000 #4A4A4A');
  for (const moved of [{ contrast: 250 }, { brightness: 160, saturation: 200 }, { hue: 120 }, { invert: 100 }]) {
    const params = { ...neutral, ...moved };
    paletteChoices(params, palette).forEach((hex, i) =>
      assert.equal(shows(hex, params, palette), palette[i].hex.toLowerCase(), `${palette[i].hex} with ${JSON.stringify(moved)}`));
  }
  const params = { ...neutral, contrast: 250 };
  paletteChoices(params, PALETTES.cga).forEach((hex, i) => assert.equal(shows(hex, params, PALETTES.cga), PALETTES.cga[i].hex));
});

test('Swatches: a palette color no color can display as is offered as itself', () => {
  const palette = parseColorList('#FFFFFF #E03020 #808080 #000000');
  const params = { ...neutral, saturation: 0 }; // gray only: red is out of reach
  assert.equal(paletteChoices(params, palette)[1], '#E03020');
});
