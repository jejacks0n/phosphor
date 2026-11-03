import { test } from 'vitest';
import assert from 'node:assert/strict';
import { charModeOf, snapsLate, carriesError } from '../../src/lib/CharResolver.js';

test('charModeOf: each style\'s choices, and anything unknown falls back to today\'s way', () => {
  assert.equal(charModeOf('ansi', 'random', 'weight'), 'random');
  assert.equal(charModeOf('ansi', 'best', 'weight'), 'best');
  assert.equal(charModeOf('ansi', 'shape', 'weight'), 'shape');
  assert.equal(charModeOf('ansi', 'bogus', 'weight'), 'random');
  assert.equal(charModeOf('colorAscii', 'best', 'weight'), 'intensity');
  assert.equal(charModeOf('colorAscii', 'random', 'shape'), 'shape');
  assert.equal(charModeOf('ascii', 'shape', 'weight'), 'brightness');
  assert.equal(charModeOf('ascii', 'random', 'bogus'), 'brightness');
  assert.equal(charModeOf('ascii', 'random', 'best'), 'brightness'); // Best match is ANSI's only
});

test('snapsLate and carriesError', () => {
  assert.equal(snapsLate({ charMode: 'random', dither: 0 }), false);
  assert.equal(snapsLate({ charMode: 'best', dither: 0 }), true);
  assert.equal(snapsLate({ charMode: 'random', dither: 10 }), true);
  assert.equal(carriesError({ charMode: 'shape', dither: 50, ditherStyle: 'floyd' }), true);
  assert.equal(carriesError({ charMode: 'shape', dither: 50, ditherStyle: 'bayer' }), false);
  assert.equal(carriesError({ charMode: 'random', dither: 50, ditherStyle: 'floyd' }), false);
});
