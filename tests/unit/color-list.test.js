// The Color list as typed: every color in it is a palette color, however it's written (commas,
// tabs, #RGB shorthand, no #), and anything that isn't a color is left out instead of being black.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseColorList } from '../../src/lib/ColorUtils.js';
import { listColors, writeList, firstColors, withColor, withCopy, without, moved, sameColors, hexFile } from '../../src/lib/colorList.js';

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

test('a list as colors: lowercase #rrggbb whatever was typed, and written back with single spaces', () => {
  assert.deepEqual(listColors('#FFF, #a50;000\n1A1C2C'), ['#ffffff', '#aa5500', '#000000', '#1a1c2c']);
  assert.equal(writeList(['#ffffff', '#000000']), '#ffffff #000000');
  assert.deepEqual(listColors('nope'), []);
});
test('a color changed, copied, removed and moved by its place, so a repeated color is no trouble', () => {
  const list = ['#111111', '#222222', '#111111'];
  assert.deepEqual(withColor(list, 2, '#ABCDEF'), ['#111111', '#222222', '#abcdef']);
  assert.deepEqual(withCopy(list, 1), ['#111111', '#222222', '#111111', '#222222']);
  assert.deepEqual(without(list, 0), ['#222222', '#111111']);
  assert.deepEqual(moved(list, 2, 0), ['#111111', '#111111', '#222222']);
  assert.deepEqual(moved(list, 0, 9), ['#222222', '#111111', '#111111']);
  assert.equal(without(['#111111'], 0), null);
  assert.equal(withCopy(Array(256).fill('#000000'), 0), null);
  assert.deepEqual(list, ['#111111', '#222222', '#111111']); // none of them changes the list given
});
test('a list past 256 is its first 256, with how many there were; the same colors in the same order are the same list', () => {
  const long = Array.from({ length: 300 }, (_, i) => `#0000${i.toString(16).padStart(2, '0').slice(-2)}`);
  assert.deepEqual([firstColors(long).colors.length, firstColors(long).of], [256, 300]);
  assert.equal(firstColors(['#000000']).of, null);
  assert.equal(sameColors(['#AABBCC', '#000000'], ['#aabbcc', '#000000']), true);
  assert.equal(sameColors(['#000000', '#aabbcc'], ['#aabbcc', '#000000']), false);
});
test('a .hex file is Lospec\'s: six digits a line, no #, and reads back as the list', () => {
  assert.equal(hexFile(['#1a1c2c', '#f4f4f4']), '1a1c2c\nf4f4f4\n');
  assert.deepEqual(listColors('1a1c2c\r\n5d275d\r\n'), ['#1a1c2c', '#5d275d']);
});
