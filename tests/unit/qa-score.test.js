// The keyboard score: how much of what a person does can be done from the keys.
import { test, expect } from 'vitest';
import { keyboardScore, eventCheck } from '../qa/score.js';

test('keys count 1, keysLong and mouse 0; the costs are the worst first', () => {
  const steps = [
    { name: 'a', rated: true, how: 'keys', want: 'one key' },
    { name: 'b', rated: true, how: 'keysLong', want: 'a shorter way' },
    { name: 'c', rated: true, how: 'mouse', want: 'a key for it' },
    { name: 'd', rated: false },
  ];
  const result = keyboardScore(steps);
  expect(result).toMatchObject({ score: 33, rated: 3 });
  expect(result.costs).toEqual([
    { step: 'c', how: 'mouse', want: 'a key for it' },
    { step: 'b', how: 'keysLong', want: 'a shorter way' },
  ]);
});

test('no rated steps is not rated, never 100 or NaN', () => {
  expect(keyboardScore([])).toEqual({ score: null, rated: 0, costs: [] });
  expect(keyboardScore([{ name: 'a', rated: false }])).toEqual({ score: null, rated: 0, costs: [] });
});

test('a rating that is not one of the marks throws, even an inherited name', () => {
  expect(() => keyboardScore([{ name: 'Y', rated: true, how: 'constructor' }])).toThrow('step "Y" is rated but has no rating');
});

test('a rated step with no rating throws', () => {
  expect(() => keyboardScore([{ name: 'X', rated: true }])).toThrow('step "X" is rated but has no rating');
});

test('a step rated for the keys with no key events earns a warning; pointers alongside keys are fine', () => {
  expect(eventCheck({ how: 'keys', events: { keys: 0, pointers: 2 } })).toEqual(expect.any(String));
  expect(eventCheck({ how: 'keys', events: { keys: 1, pointers: 0 } })).toBeNull();
  expect(eventCheck({ how: 'keys', events: { keys: 1, pointers: 2 } })).toBeNull();
  expect(eventCheck({ how: 'mouse', events: { keys: 0, pointers: 0 } })).toBeNull();
  expect(eventCheck({ events: { keys: 0, pointers: 0 } })).toBeNull();
});
