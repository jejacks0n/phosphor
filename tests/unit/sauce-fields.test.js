// The SAUCE tab's fields as the record counts them: one place a character (a code point, so an emoji is one), and
// what an edit that runs past a field's width leaves out, named rather than dropped.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { charCount, fitField } from '../../src/lib/Sauce.js';

test('a character is one place, an emoji included', () => {
  assert.equal(charCount('Café € 🎨'), 8);
  assert.equal(charCount(''), 0);
});

test('a paste past the width keeps the first characters and names what it left out', () => {
  const pasted = 'Café € 🎨 Restaurée par Walt, été 1996 xyz';
  assert.deepEqual(fitField('', pasted, pasted.length, 35), { text: 'Café € 🎨 Restaurée par Walt, été 19', caret: 'Café € 🎨 Restaurée par Walt, été 19'.length, left: '96 xyz', stripped: false });
});

test('a paste into the middle loses its own end, not the text after it', () => {
  const before = 'abcdefgh';
  const after = 'abcd123456efgh'; // 123456 pasted after the d
  assert.deepEqual(fitField(before, after, 10, 10), { text: 'abcd12efgh', caret: 6, left: '3456', stripped: false });
});

test('a key pressed in a full field doesn\'t go in, and is named', () => {
  const full = 'x'.repeat(20);
  assert.deepEqual(fitField(full, `${full}Q`, 21, 20), { text: full, caret: 20, left: 'Q', stripped: false });
  assert.deepEqual(fitField(full, `xxQ${full.slice(2)}`, 3, 20), { text: full, caret: 2, left: 'Q', stripped: false });
});

test('what fits, and a deletion, go through as they are', () => {
  assert.deepEqual(fitField('abc', 'abXc', 3, 35), { text: 'abXc', caret: 3, left: '', stripped: false });
  assert.deepEqual(fitField('abc', 'ac', 1, 35), { text: 'ac', caret: 1, left: '', stripped: false });
});

test('an emoji next to one that shares its first half isn\'t split', () => {
  // 🎨 and 🎭 share a high surrogate: the edit starts at the emoji, not inside it.
  assert.deepEqual(fitField('ab🎨', 'ab🎭🎨', 4, 3), { text: 'ab🎨', caret: 2, left: '🎭', stripped: false });
});
