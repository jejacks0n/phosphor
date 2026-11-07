// A shape's parts: what a key frame can set on its own.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { rectShape, transformed, translation, withShape } from '../../src/document/shapes.js';
import { ALL_PARTS, PARTS, PART_FIELDS, changedParts, withParts } from '../../src/document/parts.js';

const A = rectShape(0, 0, 4, 4, { fill: '#ff0000', stroke: '#000000' });
const GRADIENT = { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [1, 0, 0, 1, 0, 0] };

test('a shape has ten parts, each its own fields', () => {
  assert.deepEqual(PARTS, ['transform', 'along', 'outline', 'fill', 'stroke', 'width', 'style', 'start', 'end', 'z']);
  assert.deepEqual(PART_FIELDS.along, ['along']);
  assert.deepEqual([PART_FIELDS.start, PART_FIELDS.end], [['start'], ['end']]);
  assert.deepEqual(PART_FIELDS.outline, ['points', 'closed', 'more', 'rule']);
  assert.deepEqual(PART_FIELDS.style, ['cap', 'join', 'miter', 'align']);
  assert.deepEqual([...ALL_PARTS], PARTS);
});

test('the parts that differ between two versions of a shape', () => {
  assert.deepEqual([...changedParts(A, transformed(A, translation(1, 0)))], ['transform']);
  assert.deepEqual([...changedParts(A, withShape(A, { width: 3, cap: 'butt' }))], ['width', 'style']);
  assert.deepEqual([...changedParts(A, withShape(A, { fill: GRADIENT }))], ['fill']);
  assert.deepEqual([...changedParts(A, withShape(A, { end: 0.5 }))], ['end']);
  assert.deepEqual([...changedParts(A, withShape(A, { start: 0.25 }))], ['start']);
  assert.deepEqual([...changedParts(A, withShape(A, { along: 0.5 }))], ['along']);
  assert.deepEqual([...changedParts(A, withShape(A, { follow: { key: 'v:p' }, guide: true }))], []); // follow and guide belong to no part
  assert.deepEqual([...changedParts(A, A)], []);
});

test('a shape with some parts taken from another', () => {
  const other = withShape(transformed(A, translation(5, 5)), { fill: GRADIENT, cap: 'butt' });
  const mixed = withParts(A, other, new Set(['fill', 'style']));
  assert.deepEqual(mixed.fill, other.fill);
  assert.equal(mixed.cap, 'butt');
  assert.deepEqual([...mixed.m], [...A.m]);
  assert.equal(withParts(withShape(A, { cap: 'butt' }), A, new Set(['style'])).cap, undefined); // the default, absent
});
