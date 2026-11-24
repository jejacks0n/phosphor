// Blink without iCE colors: which bright backgrounds blink, and a cell as the ANSI view draws it at each half.
import { test, expect } from 'vitest';
import { blinkCell, blinkingBackgrounds, paintCell } from '../../src/lib/blink.js';
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

// docs/model.md R14: paint and the converter's cells never blink.
test('R14: a painted half block with one bright half turns over, so the bright color is the foreground', () => {
  const under = blinkingBackgrounds(cga);
  expect(paintCell({ char: '▄', fg: cga[1], bg: cga[12] }, under)).toEqual({ char: '▀', fg: cga[12], bg: cga[1] });
  expect(paintCell({ char: '▀', fg: cga[1], bg: cga[12] }, under)).toEqual({ char: '▄', fg: cga[12], bg: cga[1] });
});

test('R14: a cell all in one bright color, whatever its character, or a space on one, is a full block in it', () => {
  const under = blinkingBackgrounds(cga);
  expect(paintCell({ char: '▄', fg: cga[12], bg: cga[12] }, under)).toEqual({ char: '█', fg: cga[12], bg: cga[4] });
  expect(paintCell({ char: ' ', fg: cga[7], bg: cga[12] }, under)).toEqual({ char: '█', fg: cga[12], bg: cga[4] });
  expect(paintCell({ char: '░', fg: cga[12], bg: cga[12] }, under)).toEqual({ char: '█', fg: cga[12], bg: cga[4] }); // any character in its own color shows none
});

test('R14: two different bright halves, a converter\'s character on a bright background, and any cell where the font has no ▀ or █ keep their shape on the dark color', () => {
  const under = blinkingBackgrounds(cga);
  expect(paintCell({ char: '▄', fg: cga[14], bg: cga[12] }, under)).toEqual({ char: '▄', fg: cga[14], bg: cga[4] });
  expect(paintCell({ char: '%', fg: cga[1], bg: cga[12] }, under)).toEqual({ char: '%', fg: cga[1], bg: cga[4] });
  expect(paintCell({ char: '▄', fg: cga[1], bg: cga[12] }, under, false)).toEqual({ char: '▄', fg: cga[1], bg: cga[4] });
});

test('R14: a cell with no bright background is left as it is', () => {
  const under = blinkingBackgrounds(cga);
  const cell = { char: '▄', fg: cga[12], bg: cga[1] };
  expect(paintCell(cell, under)).toBe(cell);
  expect(paintCell(undefined, under)).toBe(undefined);
});
