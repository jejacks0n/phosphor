// Character palettes: the built-in sets, glyph lists, fork naming, what a cell may hold and the
// palette layer's find field.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  BUILTIN_PALETTES, UNICODE_BLOCKS, normalizeGlyphs, forkName, fitsGrid, parseFind,
} from '../../src/lib/charPalettes.js';
import { isCp437 } from '../../src/lib/Cp437.js';

test("Character palettes: the built-in sets, glyph lists, fork naming, what a cell may hold and the palette layer's find field", async () => {
  assert.equal(BUILTIN_PALETTES.length, 9);
  assert.ok(BUILTIN_PALETTES.every(p => p.glyphs.length === 12 && p.builtin));
  assert.ok(BUILTIN_PALETTES.filter(p => p.id !== 'quadrants').every(p => p.glyphs.every(isCp437)));
  assert.deepEqual(BUILTIN_PALETTES.map(p => p.id), ['shades', 'single', 'double', 'single-double', 'double-single', 'faces', 'arrows', 'greek', 'quadrants']);
  assert.equal(new Set(BUILTIN_PALETTES.map(p => p.name)).size, 9);
  assert.equal(BUILTIN_PALETTES[2].glyphs.join(''), '╔╗╚╝═║╦╩╠╣╬·');
  assert.ok(Object.isFrozen(BUILTIN_PALETTES[0].glyphs));
  assert.equal(UNICODE_BLOCKS.length, 12);
  assert.deepEqual(UNICODE_BLOCKS[0], ['Box drawing', 0x2500, 0x257F]);
  assert.deepEqual(normalizeGlyphs('🬀ab'), ['🬀', 'a', 'b', '', '', '', '', '', '', '', '', '']);
  assert.equal(normalizeGlyphs('abcdefghijklmnop').length, 12);
  assert.deepEqual(normalizeGlyphs(['x', undefined]).slice(0, 2), ['x', '']);
  assert.equal(forkName('Double lines', ['Double lines']), 'Double lines (mine)');
  assert.equal(forkName('Double lines', ['Double lines (mine)']), 'Double lines (mine 2)');
  assert.equal(forkName('Double lines', ['Double lines (mine)', 'Double lines (mine 2)']), 'Double lines (mine 3)');
  // What a cell may hold: one character, one or two columns wide (a terminal's width, not the
  // display font's advance), assigned and not private use.
  for (const ok of ['╬', '中', '🙂', '﷽', '☺', '👍🏽']) assert.equal(fitsGrid(ok), true, ok);
  for (const bad of ['', '\u0301', 'ab', '\u200d', '\u00ad', '\ufeff', String.fromCharCode(0xd800), '\uE000', '\u0378']) assert.equal(fitsGrid(bad), false, escape(bad));
  assert.deepEqual(parseFind('U+2605'), { kind: 'code', chars: ['★'] });
  assert.deepEqual(parseFind('u+1fb00'), { kind: 'code', chars: ['🬀'] });
  assert.deepEqual(parseFind('box'), { kind: 'block', query: 'box' });
  assert.deepEqual(parseFind('Misc symbols'), { kind: 'block', query: 'Misc symbols' });
  assert.deepEqual(parseFind('★ ★◆'), { kind: 'paste', chars: ['★', '◆'] });
  assert.equal(parseFind(''), null);
  assert.equal(parseFind('   '), null);
  assert.equal(parseFind('U+FFFFFF'), null);                              // beyond Unicode: nothing to offer
  assert.deepEqual(parseFind('-'), { kind: 'paste', chars: ['-'] });        // not a block name: offered as typed
  assert.deepEqual(parseFind('a'), { kind: 'paste', chars: ['a'] });
  assert.deepEqual(parseFind('👍🏽漢'), { kind: 'paste', chars: ['👍🏽', '漢'] }); // pasted characters are whole clusters
});
