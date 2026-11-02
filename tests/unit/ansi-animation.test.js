import { test, expect } from 'vitest';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { cp437Substitute } from '../../src/lib/Cp437.js';
import { replay } from '../support/terminal.js';
import { readSauce } from '../support/sauce.js';

const color = (hex) => ({ hex, r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const cell = (char, fg = '#ffffff', bg = '#000000', wide) => ({ char, fg: color(fg), bg: color(bg), ...(wide && { wide }) });
const COLS = 4, ROWS = 2;
const grid = (...chars) => chars.map((c) => (typeof c === 'string' ? cell(c) : c));
const code = ({ r, g, b }, at) => `${at};2;${r};${g};${b}`;
const art = (bytes) => { const end = bytes.indexOf(0x1a); return end < 0 ? bytes : bytes.subarray(0, end); };
const stream = (frames, opts = { utf8: true }) => AnsiFile.animationBytes(COLS, ROWS, frames, opts);
const text = (bytes) => new TextDecoder().decode(art(bytes));

const FRAMES = [
  grid('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
  grid('a', 'X', 'c', 'd', 'e', 'f', 'g', 'Y'),
  grid('a', 'X', 'c', 'd', 'e', 'f', 'g', 'Y'),
  grid(cell('a', '#ff0000'), 'X', cell('c', '#ffffff', '#0000ff'), 'd', ' ', ' ', ' ', ' '),
  grid('p', 'q', 'r', 's', 't', 'u', 'v', 'w'),
];

function expectShows(frame, shown) {
  frame.forEach((c, i) => {
    expect(shown[i].char).toBe(c.char);
    expect(shown[i].fg).toBe(code(c.fg, 38));
    expect(shown[i].bg).toBe(code(c.bg, 48));
  });
}

test('replaying the stream in a terminal model gives every frame’s cells, at any point', () => {
  for (let upTo = 1; upTo <= FRAMES.length; upTo++) {
    const { grid: shown } = replay(stream(FRAMES.slice(0, upTo)), COLS, ROWS);
    expectShows(FRAMES[upTo - 1], shown);
  }
});

test('an unchanged frame writes no cells', () => {
  const once = stream([FRAMES[1]]), twice = stream([FRAMES[1], FRAMES[2]]);
  expect(text(twice)).toBe(text(once));
});

test('only the cells that changed are written, each run after a move', () => {
  const one = text(stream(FRAMES.slice(0, 1)));
  const two = text(stream(FRAMES.slice(0, 2)));
  // The last SGR 0 closes the stream, so what the second frame added comes just before it.
  const added = two.slice(one.length - '\x1b[0m'.length, -'\x1b[0m'.length);
  expect(added).toBe('\x1b[1;2HX\x1b[2;4HY');
});

test('a Wipe over a picture repaints from the base, with no ESC[2J after the first', () => {
  const picture = grid('1', '2', '3', '4', '5', '6', '7', '8');
  const drawn = grid('1', '2', 'A', 'B', '5', '6', '7', '8');
  const bytes = stream([drawn, picture]);
  const { grid: shown, clears } = replay(bytes, COLS, ROWS);
  expect(clears).toBe(1);
  expectShows(picture, shown);
  expect(text(bytes).split('\x1b[2J')).toHaveLength(2);
});

test('the last column and last row never scroll: everything is a cursor move', () => {
  const bytes = stream(FRAMES);
  expect(art(bytes).includes(10)).toBe(false);
  expect(art(bytes).includes(13)).toBe(false);
  expect(() => replay(bytes, COLS, ROWS)).not.toThrow();
});

test('a wide character’s trail writes nothing in UTF-8, and a change to either half rewrites both', () => {
  const wide = (char, fg) => [cell(char, fg, '#000000', 'lead'), cell(char, fg, '#000000', 'trail')];
  const first = grid(...wide('漢'), 'c', 'd', 'e', 'f', 'g', 'h');
  const second = grid(...wide('字'), 'c', 'd', 'e', 'f', 'g', 'h');
  const third = grid('x', 'y', 'c', 'd', 'e', 'f', 'g', 'h');
  const { grid: shown } = replay(stream([first, second, third].slice(0, 2)), COLS, ROWS);
  expect(shown.slice(0, 3).map((c) => c.char)).toEqual(['字', '', 'c']);
  expect(replay(stream([first, second, third]), COLS, ROWS).grid.slice(0, 2).map((c) => c.char)).toEqual(['x', 'y']);
  expect(text(stream([first, second]))).toContain('\x1b[1;1H字');
});

test('a wide lead whose colors match is two spaces, as in a still', () => {
  const lead = cell('漢', '#000000', '#000000', 'lead'), trail = cell('漢', '#000000', '#000000', 'trail');
  const { grid: shown } = replay(stream([grid(lead, trail, 'c', 'd', 'e', 'f', 'g', 'h')]), COLS, ROWS);
  expect(shown.slice(0, 2).map((c) => c.char)).toEqual([' ', ' ']);
});

test('in CP437 a wide character is its stand-in and a space', () => {
  const lead = cell('漢', '#ffffff', '#000000', 'lead'), trail = cell('漢', '#ffffff', '#000000', 'trail');
  const { grid: shown } = replay(stream([grid(lead, trail, 'c', 'd', 'e', 'f', 'g', 'h')], { utf8: false }), COLS, ROWS, { utf8: false });
  expect(shown[0].char).toBe(AnsiFile.unicodeToCP437('漢'));
  expect(shown[1].char).toBe(32);
});

test('SAUCE says FileType 2 with the grid size', () => {
  const sauce = readSauce(AnsiFile.animationBytes(COLS, ROWS, FRAMES, { sauce: { title: 'Boat' } }));
  expect(sauce.fileType).toBe(2);
  expect(sauce.dataType).toBe(1);
  expect([sauce.width, sauce.height]).toEqual([COLS, ROWS]);
});

test('CP437: unmappable characters use the same substitutes as a still export', () => {
  const char = '→', frames = [grid(char, 'b', 'c', 'd', 'e', 'f', 'g', 'h')];
  const { grid: shown } = replay(AnsiFile.animationBytes(COLS, ROWS, frames, {}), COLS, ROWS, { utf8: false });
  expect(shown[0].char).toBe(AnsiFile.unicodeToCP437(cp437Substitute(char)));
  const unmappable = '漢';
  const still = new AnsiFile(1, 1, [cell(unmappable)]);
  expect(AnsiFile.unmappable(still.cells).get(unmappable).as).toBe(cp437Substitute(unmappable));
});

test('the VGA and CGA palettes write their own color codes', () => {
  const paletted = (c, n) => ({ ...color(c), c: n });
  const frame = [{ char: 'a', fg: paletted('#aa0000', 1), bg: paletted('#000000', 0) }, ...grid('b', 'c', 'd', 'e', 'f', 'g', 'h').map((c) => ({ ...c, fg: paletted('#aa0000', 1), bg: paletted('#000000', 0) }))];
  expect(text(AnsiFile.animationBytes(COLS, ROWS, [frame], { utf8: true, colorMode: 'vga' }))).toContain('38;5;1');
  const legacy = art(AnsiFile.animationBytes(COLS, ROWS, [frame], { colorMode: 'cga' }));
  expect(new TextDecoder().decode(legacy)).toContain('\x1b[31;40m');
});
