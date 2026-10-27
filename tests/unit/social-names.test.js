// A name's swatch color: the same name always gets the same CGA color, and names spread over them.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { nameColor, NAME_COLORS } from '../../src/social/names.js';
import { CGA_COLORS_STR } from '../../src/lib/ColorUtils.js';

test('A name\'s color is stable, one of the CGA colors (not black), and names spread over them', () => {
  assert.equal(nameColor('quiet-amber-fox'), nameColor('quiet-amber-fox'));
  const cga = CGA_COLORS_STR.split(' ');
  assert.ok(!NAME_COLORS.includes('#000000'));
  assert.ok(NAME_COLORS.every((c) => cga.includes(c)));
  const names = Array.from({ length: 200 }, (_, i) => `name-${i}`);
  assert.ok(names.every((n) => NAME_COLORS.includes(nameColor(n))));
  assert.equal(new Set(names.map(nameColor)).size, NAME_COLORS.length);   // every color gets used
  assert.notEqual(nameColor('ansi-fan'), nameColor('ansi-fan2'));
});
