// The color picker's swatches with the color adjustments moved: each palette color's swatch stores a
// color that displays as that palette color, so every color in the palette can be painted with.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { paletteChoices, stepChoice, effectiveColor, storedShowingAs } from '../../src/lib/PixelTransforms.js';
import { parseColorList, PALETTES, hex2rgb, rgb2hex } from '../../src/lib/ColorUtils.js';

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

test('Swatches: a palette color no color can display as has no swatch color, and Alt+arrows step past it', () => {
  const palette = parseColorList('#FFFFFF #E03020 #808080 #000000');
  const params = { ...neutral, saturation: 0 }; // gray only: red is out of reach
  const choices = paletteChoices(params, palette);
  assert.equal(choices[1], null);
  assert.equal(stepChoice(choices, 0, 1), 2); // from white, down past red to gray
  assert.equal(stepChoice(choices, 2, -1), 0); // and back up past it
  assert.equal(stepChoice([null, null], 0, 1), null); // nothing to step to
});

// A merge under Color ASCII with a slider off its default asks for a stored color that shows as the halves' average.
test('A stored color showing as a target: found where one exists, under clipping and hue-turning sliders alike', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const randomHex = () => rgb2hex({ r: (random() * 256) | 0, g: (random() * 256) | 0, b: (random() * 256) | 0 });
  const offBy = (hex, target, params) => { const s = effectiveColor(hex, params), g = hex2rgb(target); return Math.max(Math.abs(s.r - g.r), Math.abs(s.g - g.g), Math.abs(s.b - g.b)); };
  for (const moved of [{ brightness: 140, hue: 40 }, { contrast: 250 }, { invert: 100, saturation: 150 }, { hue: 180, brightness: 70 }]) {
    const params = { ...neutral, ...moved }, offs = [];
    for (let i = 0; i < 300; i++) {
      const target = effectiveColor(randomHex(), params).hex; // a shown color some stored color does show as
      offs.push(offBy(storedShowingAs(params, target), target, params));
    }
    assert.ok(offs.every((off) => off <= 2), `${JSON.stringify(moved)}: ${offs.filter((off) => off > 2).length} targets more than 2 off`);
    assert.ok(offs.filter((off) => off > 1).length <= 2, `${JSON.stringify(moved)}: ${offs.filter((off) => off > 1).length} targets more than 1 off`);
  }
});

test('A stored color showing as a target: the nearest shown when none shows as it, and the palette\'s own under a palette', () => {
  const gray = { ...neutral, saturation: 0 }; // red is out of reach: the stored color is one showing as the nearest gray
  const shown = effectiveColor(storedShowingAs(gray, '#e03020'), gray);
  assert.equal(shown.r, shown.g);
  assert.ok(Math.abs(shown.r - 0x60) <= 8, `${shown.hex} isn't red's gray`);
  const palette = parseColorList('#FFFFFF #AA5601 #E03020 #000000 #4A4A4A'), params = { ...neutral, brightness: 160 };
  for (const p of palette) assert.equal(effectiveColor(storedShowingAs(params, p.hex, palette), params, palette).hex, p.hex.toLowerCase());
});
