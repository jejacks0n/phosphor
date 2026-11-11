// Joining box-drawing characters (the Shapes tool's Connect).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { armsOf, joinBox, inwardArms, pieceOf } from '../../src/lib/BoxJoin.js';
import { cellSteps } from '../../src/lib/Brushes.js';

test("Joining box-drawing characters (the Shapes tool's Connect)", async () => {
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
  assert.equal(joinBox('═', '│', [0, 0, 0, 0], [false, false, true, false]), '╧'); // a filled box's top edge: the line ends there
  assert.equal(joinBox('║', '─', [0, 0, 0, 0], [false, true, false, false]), '╢');  // its left edge
  assert.equal(joinBox('─', ' ', inwardArms(['', '', '│', '']), [false, false, true, false]), '─'); // nothing joins from inside
});

test("A line's end (a lone arm) that lands on a line joins it as a T, in its own weight across its axis", () => {
  // [own arms, the character under, the piece]: [up, right, down, left], each 0, 1 (single) or 2 (double)
  const cases = [
    [[0, 1, 0, 0], '║', '╟'], [[0, 0, 0, 1], '║', '╢'], // the triage's repro: a single line across a double box
    [[1, 0, 0, 0], '═', '╧'], [[0, 0, 1, 0], '═', '╤'], // single into a double box's bottom and top edges, from inside
    [[0, 2, 0, 0], '│', '╞'], [[0, 0, 0, 2], '│', '╡'], // double into single
    [[2, 0, 0, 0], '─', '╨'], [[0, 0, 2, 0], '─', '╥'],
    [[0, 1, 0, 0], '│', '├'], [[0, 0, 0, 1], '│', '┤'], [[1, 0, 0, 0], '─', '┴'], [[0, 0, 1, 0], '─', '┬'], // single into single
    [[0, 2, 0, 0], '║', '╠'], [[0, 0, 0, 2], '║', '╣'], [[2, 0, 0, 0], '═', '╩'], [[0, 0, 2, 0], '═', '╦'], // double into double
    [[0, 1, 0, 0], '╗', '╥'], [[1, 0, 0, 0], '╗', '╡'], [[0, 0, 0, 2], '┌', '╤'], // at a corner
    [[0, 1, 0, 0], ' ', '─'], [[2, 0, 0, 0], 'A', '║'], // nothing to join: it runs on straight
    [[0, 1, 0, 0], '─', '─'], // the same axis: no T
  ];
  for (const [own, under, piece] of cases) assert.equal(joinBox(own, under), piece, `${own} over ${under}`);
  assert.equal(joinBox([0, 1, 0, 0], ' ', inwardArms(['║', '', '║', ''])), '╟'); // the line it ends on points in
  assert.equal(joinBox([0, 1, 0, 0], ' ', inwardArms(['│', '', '', ''])), '└');
});

test('The Lines tool: the piece for a cell\'s arms, and the cells a drag passes through, never diagonally', () => {
  // [up, right, down, left], each 0 (none), 1 (single) or 2 (double)
  assert.equal(pieceOf([0, 1, 0, 1]), '─');
  assert.equal(pieceOf([0, 1, 0, 0]), '─'); // a line's end runs on straight
  assert.equal(pieceOf([1, 0, 0, 0]), '│');
  assert.equal(pieceOf([0, 1, 1, 0]), '┌');
  assert.equal(pieceOf([1, 0, 0, 1]), '┘');
  assert.equal(pieceOf([1, 1, 1, 0]), '├');
  assert.equal(pieceOf([1, 1, 1, 1]), '┼');
  assert.equal(pieceOf([0, 2, 2, 0]), '╔');
  assert.equal(pieceOf([2, 1, 2, 1]), '╫'); // double down, single across
  assert.equal(pieceOf([0, 0, 0, 0]), null);

  const steps = cellSteps({ col: 0, row: 0 }, { col: 3, row: 2 });
  assert.equal(steps.length, 5);                                            // each step one cell across or down
  assert.deepEqual(steps.at(-1), { col: 3, row: 2 });
  let at = { col: 0, row: 0 };
  for (const step of steps) {
    assert.equal(Math.abs(step.col - at.col) + Math.abs(step.row - at.row), 1);
    at = step;
  }
  assert.deepEqual(cellSteps({ col: 4, row: 1 }, { col: 1, row: 1 }), [{ col: 3, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 1 }]);
  assert.deepEqual(cellSteps({ col: 2, row: 2 }, { col: 2, row: 2 }), []);
});
