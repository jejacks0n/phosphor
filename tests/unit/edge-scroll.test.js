// A drag at the edge of a view scrolls it by time, not by frame: as fast on a slow machine or a
// 120 Hz display as at 60 frames a second.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { edgeStep } from '../../src/composables/useEditorInteractions.js';

test('A drag at the edge scrolls as far in the same time at any frame rate, faster the further past the edge', () => {
  const [lo, hi] = [0, 600];
  assert.equal(edgeStep(300, lo, hi, 1000 / 60), 0);                             // nowhere near an edge
  const near = edgeStep(hi - 12, lo, hi, 1000 / 60), far = edgeStep(hi + 100, lo, hi, 1000 / 60);
  assert.ok(near > 0 && far > near * 3);                                          // further past, faster
  assert.ok(edgeStep(lo + 12, lo, hi, 1000 / 60) < 0);                            // the top edge scrolls up

  const per = (ms, frames) => Array.from({ length: frames }, () => edgeStep(hi - 12, lo, hi, ms)).reduce((a, b) => a + b);
  assert.equal(per(50, 2), per(1000 / 60, 6));                                    // 100 ms at 20 or at 60 frames a second
  assert.ok(Math.abs(per(1000 / 120, 12) - per(1000 / 60, 6)) <= 6);              // and at 120, within rounding
  assert.ok(edgeStep(hi - 1, lo, hi, 1000 / 240) > 0);                            // a quick frame still moves
  assert.equal(edgeStep(hi + 100, lo, hi, 5000), edgeStep(hi + 100, lo, hi, 100)); // a stall doesn't jump: at most 100 ms a step
});
