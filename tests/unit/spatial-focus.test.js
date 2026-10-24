// Arrow-key focus by position (the color box's swatches): the nearest control in the arrow's
// direction, preferring the same row (left/right) or column (up/down); none past the edge.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { nearestInDirection } from '../../src/lib/spatialFocus.js';

test('Arrow-key focus by position', () => {
  // A 4 x 2 grid of 10px swatches, 2px apart, and a wide row under it (a single "None" swatch at the left).
  const cell = (c, r) => ({ left: c * 12, top: r * 12, width: 10, height: 10 });
  const rects = [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => cell(c, r))).slice(0, 8); // indexes 0..7
  rects.push({ left: 0, top: 30, width: 10, height: 10 });                                    // 8: None
  const go = (from, key) => nearestInDirection(rects[from], rects, key);
  assert.equal(go(0, 'ArrowRight'), 1);
  assert.equal(go(1, 'ArrowLeft'), 0);
  assert.equal(go(1, 'ArrowDown'), 5);
  assert.equal(go(5, 'ArrowUp'), 1);
  assert.equal(go(3, 'ArrowRight'), -1);   // the row's end: stays
  assert.equal(go(0, 'ArrowUp'), -1);
  assert.equal(go(6, 'ArrowDown'), 8);     // nothing straight below: the nearest below
  assert.equal(go(8, 'ArrowUp'), 4);       // back up: the one above it, not one off to the side
  assert.equal(go(4, 'ArrowRight'), 5);    // same row beats a closer-looking diagonal
});
