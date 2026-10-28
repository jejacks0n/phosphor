// The Color list as typed: every color in it is a palette color, however it's written (commas,
// tabs, #RGB shorthand, no #), and anything that isn't a color is left out instead of being black.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseColorList } from '../../src/lib/ColorUtils.js';

const hexes = (str) => parseColorList(str).map(p => p.hex);

test('Color list: commas, tabs, #RGB and a missing # all give the colors typed', () => {
  assert.deepEqual(hexes('#FFFFFF #AA5601 #000000'), ['#FFFFFF', '#AA5601', '#000000']);
  assert.deepEqual(hexes('#ffffff, #aa5601, #000000'), ['#ffffff', '#aa5601', '#000000']);
  assert.deepEqual(hexes('#FFFFFF\t#AA5601\n#000000'), ['#FFFFFF', '#AA5601', '#000000']);
  assert.deepEqual(hexes('#FFF #A50 #000'), ['#FFFFFF', '#AA5500', '#000000']);
  assert.deepEqual(hexes('ffffff aa5601 000'), ['#ffffff', '#aa5601', '#000000']);
  assert.deepEqual(parseColorList('#a50')[0], { r: 170, g: 85, b: 0, c: 0, hex: '#aa5500' });
});

test('Color list: what isn\'t a color is left out, and the rest keep their places', () => {
  assert.deepEqual(hexes('#FFFFFFF #AA5601 red #12 #000000'), ['#AA5601', '#000000']);
  assert.deepEqual(parseColorList('nope #fff #000').map(p => p.c), [0, 1]);
  assert.deepEqual(parseColorList(''), []);
});
