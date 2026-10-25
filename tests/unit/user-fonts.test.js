// Fonts you load from your computer: the monospace check's sample, its comparison and what it says.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MONOSPACE_SAMPLE, widthMismatch, notMonospacedMessage } from '../../src/lib/userFonts.js';

test('User fonts: ten sample characters, one width or a refusal naming the narrowest and widest', () => {
  assert.equal(MONOSPACE_SAMPLE.length, 10);
  assert.deepEqual(MONOSPACE_SAMPLE.slice(0, 5), ['i', 'l', '.', '\'', ' ']);
  const mono = Object.fromEntries(MONOSPACE_SAMPLE.map((c) => [c, 9.6]));
  assert.equal(widthMismatch(mono), null);
  assert.equal(widthMismatch({ ...mono, M: 9.62 }), null); // a hair: rounding
  const proportional = { ...mono, i: 4.1, W: 12.5 };
  const mismatch = widthMismatch(proportional);
  assert.deepEqual(mismatch, { narrow: 'i', wide: 'W' });
  assert.equal(notMonospacedMessage('Comic Sans MS', proportional, mismatch),
    '“Comic Sans MS” isn\'t monospaced: “i” is 4.1px wide and “W” is 12.5px. Every character has to be the same width, as in a terminal, so it can\'t be used.');
  assert.match(notMonospacedMessage('X', { ...mono, ' ': 3 }, widthMismatch({ ...mono, ' ': 3 })), /a space is 3\.0px wide/);
});
