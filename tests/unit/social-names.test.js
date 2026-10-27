// A name's swatch color: the same name always gets the same CGA color, and names spread over them.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { nameColor, NAME_COLORS, usernameProblem, cleanUsername, suggestedUsername } from '../../src/social/names.js';
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

// The server's own rule, case by case: length, then characters, then reserved.
test('usernameProblem matches the server\'s rules', () => {
  const cases = [
    ['ab', 'length'], ['a'.repeat(25), 'length'], ['pixel wren', 'characters'], ['pixel.wren', 'characters'],
    ['quiet-amber-fox', 'reserved'], ['Admin', 'reserved'], ['phosphor', 'reserved'],
    ['pixel_wren', null], ['wren-42', null], ['two-words', null], ['a-b-c-d', null],
    ['Quiet-Amber-Fox', 'reserved'], ['GUEST', 'reserved'], ['host', 'reserved'], ['system', 'reserved'],
    ['a-', 'length'], ['a b c d e', 'characters'], ['wren-42-fox', null], ['a'.repeat(24), null], ['', 'length'],
  ];
  for (const [name, problem] of cases) assert.equal(usernameProblem(name), problem, name);
});

test('a provider\'s name cleaned to a username: lowercase, spaces to hyphens, the rest dropped, 24 at most', () => {
  assert.equal(cleanUsername('Pixel Wren!'), 'pixel-wren');
  assert.equal(cleanUsername('  Ansi  Fan_99 '), 'ansi-fan_99');
  assert.equal(cleanUsername('Zoë (she/her)'), 'zo-sheher');
  assert.equal(cleanUsername('x'.repeat(30)), 'x'.repeat(24));
  assert.equal(cleanUsername(null), '');
});

test('the onboarding suggestion is the cleaned name when it would do, else its first word, else nothing', () => {
  assert.equal(suggestedUsername('Pixel Wren!'), 'pixel-wren');
  assert.equal(suggestedUsername('Quiet Amber Fox'), 'quiet');   // guest-shaped
  assert.equal(suggestedUsername('quiet-amber-fox'), 'quiet');
  assert.equal(suggestedUsername('Wren Q'), 'wren-q');
  assert.equal(suggestedUsername('Admin'), '');   // reserved, and so is its first word
  assert.equal(suggestedUsername('Al'), '');   // too short
  assert.equal(suggestedUsername('Al Bo Cy'), '');
  assert.equal(suggestedUsername(null), '');
});
