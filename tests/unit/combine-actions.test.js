// The project store's actions come from groups (store/project/), merged by combineActions, which
// refuses a name defined twice (one would silently replace the other).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { combineActions } from '../../src/store/project/combineActions.js';

test('Store action groups merge, and a name in two groups is an error', () => {
  const merged = combineActions({ a() { return 1; } }, { b() { return 2; } });
  assert.deepEqual(Object.keys(merged), ['a', 'b']);
  assert.equal(merged.b(), 2);
  assert.throws(() => combineActions({ x() {} }, { y() {} }, { x() {} }), /Duplicate store action: x/);
});
