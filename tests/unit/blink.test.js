// Blink without iCE colors: which bright backgrounds blink, and a cell as the ANSI view draws it at each half.
import { test, expect } from 'vitest';
import { blinkCell, blinkingBackgrounds } from '../../src/lib/blink.js';
import { PALETTES, parseColorList } from '../../src/lib/ColorUtils.js';

const cga = PALETTES.cga;

test('in CGA each bright background blinks on the color 8 below it', () => {
  const under = blinkingBackgrounds(cga);
  expect(under.size).toBe(8);
  for (let i = 0; i < 8; i++) expect(under.get(cga[i + 8].hex)).toBe(cga[i]);
  expect(under.has(cga[4].hex)).toBe(false);
});

test('a list\'s bright color that\'s also one of its first eight is that one, so it doesn\'t blink; a hex is any case', () => {
  const list = parseColorList('#000000 #111111 #222222 #333333 #444444 #555555 #666666 #777777 #111111 #99AAbb #aaaaaa #bbbbbb #cccccc #dddddd #eeeeee #ffffff');
  const under = blinkingBackgrounds(list);
  expect(under.has('#111111')).toBe(false); // index 1 as an export writes it
  expect(under.get('#99aabb')).toBe(list[1]);
});

test('a blinking cell is drawn on the dark color, its letter there while lit and the background\'s color while not', () => {
  const under = blinkingBackgrounds(cga);
  const cell = { char: 'A', fg: cga[15], bg: cga[12] };
  expect(blinkCell(cell, under, true)).toEqual({ char: 'A', fg: cga[15], bg: cga[4] });
  expect(blinkCell(cell, under, false)).toEqual({ char: 'A', fg: cga[4], bg: cga[4] });
  const steady = { char: 'B', fg: cga[15], bg: cga[4] };
  expect(blinkCell(steady, under, false)).toBe(steady);
  expect(blinkCell(undefined, under, false)).toBe(undefined); // a missing cell stays missing
});
