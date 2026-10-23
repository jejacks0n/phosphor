// Joining box-drawing characters (the Shapes tool's Connect).
// Run: node scripts/check-box-join.mjs
import assert from 'node:assert/strict';
import { armsOf, joinBox, inwardArms } from '../src/lib/BoxJoin.js';

assert.deepEqual(armsOf('╒'), [0, 2, 1, 0]);
assert.deepEqual(armsOf('╫'), [2, 1, 2, 1]);
assert.equal(armsOf('A'), null);

assert.equal(joinBox('═', '│'), '╪');   // a double line crossing a single one
assert.equal(joinBox('│', '═'), '╪');
assert.equal(joinBox('║', '─'), '╫');
assert.equal(joinBox('═', '║'), '╬');
assert.equal(joinBox('╔', '│'), '╠');   // the corner's double vertical wins over the single
assert.equal(joinBox('╔', '─'), '╦');
assert.equal(joinBox('┌', '┘'), '┼');
assert.equal(joinBox('─', '═'), '─');   // same axis: the new line's weight wins
assert.equal(joinBox('─', 'A'), '─');   // nothing to join
assert.equal(joinBox('A', '│'), 'A');   // not a box piece
assert.equal(joinBox('║', ' ', inwardArms(['', '─', '', ''])), '╟'); // a single line ending against a double edge
assert.equal(joinBox('═', ' ', inwardArms(['│', '', '', ''])), '╧');
assert.equal(joinBox('─', ' ', inwardArms(['║', '', '║', ''])), '╫');
console.log('box join ok');
