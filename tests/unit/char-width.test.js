// Character widths as a terminal lays them out (one or two columns, or none), and what a cell may
// hold: one grapheme cluster one or two columns wide.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { graphemes, cellWidth, usableChar } from '../../src/lib/CharWidth.js';

test('Character widths as a terminal lays them out (one or two columns, or none), and what a cell may hold: one grapheme cluster one or two columns wide', async () => {
  for (const [c, w] of [['a', 1], [' ', 1], ['﷽', 1], ['漢', 2], ['Ａ', 2], ['▀', 1], ['░', 1], ['█', 1], ['★', 1], ['☺', 1],
    ['☺️', 2], ['👍🏽', 2], ['👨‍👩‍👧', 2], ['🇯🇵', 2], ['가', 2], ['ｱ', 1], ['é', 1], ['́', 0], ['\t', 0], ['𝔸', 1]])
    assert.equal(cellWidth(c), w, JSON.stringify(c));
  assert.deepEqual(graphemes('é漢👨‍👩‍👧🇯🇵a'), ['é', '漢', '👨‍👩‍👧', '🇯🇵', 'a']);
  for (const ok of ['a', '漢', '﷽', '👍🏽', 'é', '🇯🇵']) assert.equal(usableChar(ok), true, ok);
  for (const bad of ['', 'ab', '漢字', '́', '\t', '‍', null, 5]) assert.equal(usableChar(bad), false, String(bad));
});
