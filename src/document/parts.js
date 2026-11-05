// A shape's parts: what a key frame can set on its own, leaving the rest to the key frames before it (tweens.js).
import { withShape } from './shapes.js';

export const PART_FIELDS = Object.freeze({
  transform: ['m'],
  outline: ['points', 'closed', 'more', 'rule'],
  fill: ['fill'],
  stroke: ['stroke'],
  width: ['width'],
  style: ['cap', 'join', 'miter', 'align'],
  z: ['z'],
});
export const PARTS = Object.freeze(Object.keys(PART_FIELDS));
export const ALL_PARTS = Object.freeze(new Set(PARTS));

const valueOf = (shape, name) => JSON.stringify(PART_FIELDS[name].map((field) => shape[field]));
export const samePart = (a, b, name) => valueOf(a, name) === valueOf(b, name);

// The parts that differ between two versions of a shape.
export const changedParts = (a, b) => new Set(PARTS.filter((name) => !samePart(a, b, name)));

// shape with the named parts' fields taken from `from` (an optional field `from` doesn't have goes too).
export function withParts(shape, from, names) {
  const fields = {};
  for (const name of names) for (const field of PART_FIELDS[name]) fields[field] = from[field];
  return withShape(shape, fields);
}
