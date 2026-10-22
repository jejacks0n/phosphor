// Character palettes: the built-in sets, glyph lists, fork naming, the one-cell rule and the
// palette layer's find field. Run: node scripts/check-char-palettes.mjs
import assert from 'node:assert/strict';
import {
  BUILTIN_PALETTES, UNICODE_BLOCKS, normalizeGlyphs, forkName, fitsOneCell, parseFind,
} from '../src/lib/charPalettes.js';
import { isCp437 } from '../src/lib/Cp437.js';

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
const measure = (c) => (c === '中' ? 16 : 8);
assert.equal(fitsOneCell('╬', measure, 8), true);
assert.equal(fitsOneCell('中', measure, 8), false);
assert.equal(fitsOneCell('🙂', measure, 8), false);
assert.equal(fitsOneCell('', measure, 8), false);
assert.equal(fitsOneCell('́', measure, 8), false);                 // a combining mark alone
assert.equal(fitsOneCell('ab', measure, 8), false);                     // more than one character
assert.deepEqual(parseFind('U+2605'), { kind: 'code', chars: ['★'] });
assert.deepEqual(parseFind('u+1fb00'), { kind: 'code', chars: ['🬀'] });
assert.deepEqual(parseFind('box'), { kind: 'block', query: 'box' });
assert.deepEqual(parseFind('Misc symbols'), { kind: 'block', query: 'Misc symbols' });
assert.deepEqual(parseFind('★ ★◆'), { kind: 'paste', chars: ['★', '◆'] });
assert.equal(parseFind(''), null);
assert.equal(parseFind('   '), null);
assert.equal(parseFind('U+FFFFFF'), null);                              // beyond Unicode: nothing to offer
for (const invisible of ['\u200d', '\u00ad', '\ufeff', String.fromCharCode(0xd800)]) assert.equal(fitsOneCell(invisible, measure, 8), false, escape(invisible));
assert.equal(fitsOneCell('x', () => 0, 8), false);                       // zero advance: draws nothing
assert.equal(fitsOneCell('☺', measure, 8), true);                        // text-presentation symbols are fine
assert.deepEqual(parseFind('-'), { kind: 'paste', chars: ['-'] });        // not a block name: offered as typed
assert.deepEqual(parseFind('a'), { kind: 'paste', chars: ['a'] });
console.log('char palettes ok');
