import { test, expect } from 'vitest';
import { gradientAt, blendColor, blendChar } from '../../src/lib/Gradient.js';

test('linear: FG before the press, BG past the release, evenly between, the bands square to the line', () => {
  const a = { x: 0, y: 0 }, b = { x: 10, y: 0 };
  expect(gradientAt('linear', a, b, -5, 3)).toBe(0);
  expect(gradientAt('linear', a, b, 5, 99)).toBe(0.5);
  expect(gradientAt('linear', a, b, 20, 0)).toBe(1);
  expect(gradientAt('linear', { x: 0, y: 0 }, { x: 10, y: 10 }, 10, 0)).toBe(0.5); // a diagonal drag: diagonal bands
});

test('spherical: by distance from the press, the line\'s length the radius', () => {
  const a = { x: 5, y: 5 }, b = { x: 5, y: 15 };
  expect(gradientAt('spherical', a, b, 5, 5)).toBe(0);
  expect(gradientAt('spherical', a, b, 10, 5)).toBe(0.5);
  expect(gradientAt('spherical', a, b, 30, 30)).toBe(1);
});

test('blendColor mixes in sRGB', () => {
  const black = { r: 0, g: 0, b: 0 }, white = { r: 255, g: 255, b: 255 };
  expect(blendColor(black, white, 0)).toEqual(black);
  expect(blendColor(black, white, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
  expect(blendColor(black, white, 1)).toEqual(white);
});

// A long drag left to right: cells (col, 0), the blend running from x = 0 to x = 40.
const across = (col) => blendChar('linear', { x: 0, y: 0 }, { x: 40, y: 0 }, col, 0);

test('blendChar: solid FG before the press, BG past the release, the shades between', () => {
  expect(blendChar('linear', { x: 10, y: 0 }, { x: 50, y: 0 }, 2, 0)).toBe('█');
  expect(blendChar('linear', { x: 0, y: 0 }, { x: 5, y: 0 }, 20, 0)).toBe(' ');
  const chars = Array.from({ length: 40 }, (_, col) => across(col)).join('');
  for (const ch of chars) expect('█▓▒░ ').toContain(ch);
  for (const ch of '▓▒░') expect(chars).toContain(ch);
});

test('blendChar dithers where two levels meet: an even mix in a 4×4 block, not a hard band', () => {
  // Every cell of the block at the same place on the blend, halfway between ▓ and ▒ (t = 0.375).
  const at = (col, row) => blendChar('linear', { x: -1000, y: 0 }, { x: 1000 / 0.375 - 1000, y: 0 }, col, row);
  const block = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) block.push(at(col, row));
  expect(block.filter((c) => c === '▓')).toHaveLength(8);
  expect(block.filter((c) => c === '▒')).toHaveLength(8);
});

test('blendChar uses a half-block where a cell spans the blend, and never on a long one', () => {
  expect(blendChar('linear', { x: 0.5, y: 6.5 }, { x: 0.5, y: 7.5 }, 0, 3)).toBe('▀'); // cell row 3's halves: y 6..7 and 7..8
  expect(blendChar('linear', { x: 0.5, y: 7.5 }, { x: 0.5, y: 6.5 }, 0, 3)).toBe('▄');
  expect(blendChar('linear', { x: 4.25, y: 1 }, { x: 4.75, y: 1 }, 4, 0)).toBe('▌');
  expect(blendChar('linear', { x: 4.75, y: 1 }, { x: 4.25, y: 1 }, 4, 0)).toBe('▐');
  for (let col = 0; col < 40; col++) expect('▀▄▌▐').not.toContain(across(col));
});
