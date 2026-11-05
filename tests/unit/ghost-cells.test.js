import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ghostCell, ghostedCells, veilPixels } from '../../src/lib/ghostCells.js';
import { frameDuration } from '../../src/document/frames.js';

const color = (r, g, b) => ({ r, g, b, hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, c: [r, g, b] });
const cell = (char, fg, bg) => ({ char, fg, bg });

test('frameDuration: a hold wins, else one tick at the fps', () => {
  assert.equal(frameDuration({ hold: 0 }, 8), 125);
  assert.equal(frameDuration({ hold: 2.5 }, 8), 2500);
});

test('ghostCell at strength 0.35 mixes toward the base colors', () => {
  const ghost = ghostCell(cell('A', color(200, 100, 0), color(0, 0, 100)), cell(' ', color(0, 0, 0), color(100, 100, 100)));
  assert.equal(ghost.char, 'A');
  assert.deepEqual([ghost.fg.r, ghost.fg.g, ghost.fg.b], [70, 35, 0]);
  assert.deepEqual([ghost.bg.r, ghost.bg.g, ghost.bg.b], [65, 65, 100]);
  assert.equal(ghost.fg.hex, '#462300');
});

test('a ghost of a wide character stays that half', () => {
  const ghost = ghostCell({ ...cell('漢', color(9, 9, 9), color(9, 9, 9)), wide: 'trail' }, cell(' ', color(0, 0, 0), color(0, 0, 0)));
  assert.equal(ghost.wide, 'trail');
});

test('ghostedCells gives the same array when nothing is a ghost', () => {
  const cells = [cell('A', color(1, 1, 1), color(2, 2, 2))];
  assert.equal(ghostedCells(cells, () => cells[0], () => false), cells);
});

test('ghostedCells ghosts only what isGhost says, and keeps a ghost the same object between calls', () => {
  const base = cell(' ', color(0, 0, 0), color(0, 0, 0));
  const cells = [cell('A', color(100, 100, 100), color(0, 0, 0)), cell('B', color(100, 100, 100), color(0, 0, 0))];
  const memo = new WeakMap();
  const first = ghostedCells(cells, () => base, (i) => i === 1, memo);
  assert.equal(first[0], cells[0]);
  assert.notEqual(first[1], cells[1]);
  assert.equal(first[1].fg.r, 35);
  assert.equal(ghostedCells(cells, () => base, (i) => i === 1, memo)[1], first[1]);
});

test('a cell with no base to sit on shows solid', () => {
  const cells = [cell('A', color(100, 100, 100), color(0, 0, 0))];
  assert.equal(ghostedCells(cells, () => null, () => true), cells);
});

test('veilPixels covers both halves of a ghost cell in what’s under it, enough to leave the ghost’s strength showing', () => {
  const base = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]); // 2 x 2
  const veil = new Uint8ClampedArray(16);
  veilPixels(veil, base, [1], 2, 0.35);
  assert.deepEqual([...veil], [0, 0, 0, 0, 40, 50, 60, 166, 0, 0, 0, 0, 100, 110, 120, 166]);
});

test('a ghost at strength 0 is the cell under it, character and all', () => {
  const under = cell('▄', color(0, 0, 0), color(100, 100, 100));
  assert.equal(ghostCell(cell('A', color(200, 100, 0), color(0, 0, 100)), under, 0), under);
});
