// The headless terminal QA plays exports in, to compare with what the screen shows.
import { test, expect } from 'vitest';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { castText } from '../../src/lib/CastFile.js';
import { PALETTES } from '../../src/lib/ColorUtils.js';
import { readArtFile } from '../../src/lib/ArtFile.js';
import { makeLongAns, makeSceneAns } from '../qa/files.js';
import { castFinalCells, diffCells, normalizeHidden, terminalCells } from '../qa/terminal.js';

const vga = (i) => PALETTES.vga[i].hex.toLowerCase();
const bytes = (text) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const cell = (char, fg, bg) => ({ char, fg, bg });

test('SGR colors come out as the VGA palette entries they name', async () => {
  const { cells } = await terminalCells(bytes('\x1b[0;31mA\x1b[44mB'), { cols: 4, rows: 1, encoding: 'cp437' });
  expect(cells[0]).toEqual(cell('A', vga(1), vga(0)));
  expect(cells[1]).toEqual(cell('B', vga(1), vga(4)));
  expect(cells[2]).toEqual(cell(' ', vga(7), vga(0)));
});

test('a bright background written as blink reads as the bright color', async () => {
  const { cells } = await terminalCells(bytes('\x1b[0;1;5;31;44mA'), { cols: 2, rows: 1, encoding: 'cp437' });
  expect(cells[0]).toEqual(cell('A', vga(9), vga(12)));
});

test('a bare bold or blink brightens the default colors, as the app reads an opened file', async () => {
  const { cells } = await terminalCells(bytes('\x1b[0;1mA\x1b[0;5mB'), { cols: 2, rows: 1, encoding: 'cp437' });
  expect(cells[0]).toEqual(cell('A', vga(15), vga(0)));
  expect(cells[1]).toEqual(cell('B', vga(7), vga(8)));
});

test('a byte is read as CP437, and as UTF-8 when the file is', async () => {
  const shown = await terminalCells(Uint8Array.of(0xdb, 0xe9), { cols: 2, rows: 1, encoding: 'cp437' });
  expect(shown.cells.map((c) => c.char)).toEqual(['█', 'Θ']);
  const utf8 = await terminalCells(new TextEncoder().encode('█é'), { cols: 2, rows: 1, encoding: 'utf8' });
  expect(utf8.cells.map((c) => c.char)).toEqual(['█', 'é']);
});

test('a cast ends with what its last frame left in a cell', async () => {
  const cast = [
    JSON.stringify({ version: 2, width: 3, height: 1 }),
    JSON.stringify([0, 'o', '\x1b[2J\x1b[1;1HA\x1b[1;2HB']),
    JSON.stringify([0.5, 'i', 'ignored']),
    JSON.stringify([1, 'o', '\x1b[1;1HZ']),
  ].join('\n');
  const { cells } = await castFinalCells(cast, { cols: 3, rows: 1 });
  expect(cells.map((c) => c.char)).toEqual(['Z', 'B', ' ']);
});

const hexOf = (color) => color.hex.toLowerCase();
const appScreen = (cols, rows, cells) => ({ cols, rows, cells: cells.map((c) => cell(c.wide === 'trail' ? ' ' : c.char, hexOf(c.fg), hexOf(c.bg))) });
const exported = async (file, options) => new Uint8Array(await file.toBlob(options).arrayBuffer());
// A wide character as the app's grid holds it: a lead cell and a trail.
const wide = (char, fg, bg) => [{ char, fg, bg, wide: 'lead' }, { char, fg, bg, wide: 'trail' }];

test('a grid the app wrote reads back with the same characters and colors', async () => {
  const cga = PALETTES.cga;
  const cells = [[1, 9, 'a'], [14, 4, '█'], [7, 12, 'é'], [0, 7, ' ']].map(([f, b, char]) => ({ char, fg: cga[f], bg: cga[b] }));
  const file = new AnsiFile(2, 2, cells);
  const expected = appScreen(2, 2, cells);
  const ans = await exported(file, { colorMode: 'cga' });
  expect(await terminalCells(ans, { cols: 2, rows: 2, encoding: 'cp437' })).toEqual(expected);
  // A .utf8ans ends with a line feed, so a terminal exactly as tall as the art would scroll it away.
  const utf8 = await terminalCells(await exported(file, { colorMode: 'cga', utf8: true }), { cols: 2, rows: 3, encoding: 'utf8' });
  expect(utf8.cells.slice(0, 4)).toEqual(expected.cells);
  const cast = castText(2, 2, [cells], [1], { colorMode: 'cga' });
  expect(await castFinalCells(cast, { cols: 2, rows: 2 })).toEqual(expected);
});

test('wide characters and emoji take the columns the app gives them', async () => {
  const [fg, bg] = [PALETTES.cga[14], PALETTES.cga[1]];
  const cells = [...wide('日', fg, bg), ...wide('😀', fg, bg), ...wide('👍', fg, bg), { char: 'X', fg, bg }, { char: ' ', fg, bg }];
  const file = new AnsiFile(8, 1, cells);
  const expected = appScreen(8, 1, cells);
  const shown = await terminalCells(await exported(file, { colorMode: 'cga', utf8: true }), { cols: 8, rows: 2, encoding: 'utf8' });
  expect(diffCells(expected, { ...shown, rows: 1, cells: shown.cells.slice(0, 8) })).toEqual([]);
  expect(shown.cells[6].char).toBe('X');
});

test('a hidden character comes back as a space, which normalizeHidden says of the app side', async () => {
  const same = PALETTES.cga[4];
  const cells = [{ char: 'h', fg: same, bg: same }, { char: 'v', fg: PALETTES.cga[2], bg: PALETTES.cga[0] }];
  const shown = await terminalCells(await exported(new AnsiFile(2, 1, cells), { colorMode: 'cga' }), { cols: 2, rows: 1, encoding: 'cp437' });
  const app = appScreen(2, 1, cells);
  expect(diffCells(app, shown)).toHaveLength(1);
  expect(diffCells(normalizeHidden(app), shown)).toEqual([]);
});

// Where a modern terminal (Unicode 11 widths) still disagrees with the app's character widths. These are
// real differences, not bugs in the check: QA reports one when it sees it on a screen.
test.each([
  ['an emoji with a variation selector is one column, the app has two', '❤️', ['❤️', 'X'], 1],
  ['a skin tone modifier is split into its own cell, the app has one cell', '👍🏽', ['👍', ' ', '🏽', ' ', 'X'], 4],
  ['a flag is two one-column cells, the app has one two-column cell', '🇺🇸', ['🇺', '🇸', 'X'], 2],
])('known difference: %s', async (_, char, shownCells, xAt) => {
  const [fg, bg] = [PALETTES.cga[14], PALETTES.cga[1]];
  const cells = [...wide(char, fg, bg), { char: 'X', fg, bg }];
  const shown = await terminalCells(await exported(new AnsiFile(3, 1, cells), { colorMode: 'cga', utf8: true }), { cols: 6, rows: 2, encoding: 'utf8' });
  expect(shown.cells.slice(0, shownCells.length).map((c) => c.char)).toEqual(shownCells);
  expect(shown.cells[xAt].char).toBe('X');
  expect(cells.findIndex((c) => c.char === 'X')).toBe(2); // the app puts X in column 2
});

test('diffCells returns exactly the cells that differ', () => {
  const a = { cols: 2, rows: 2, cells: [cell('a', '#1', '#2'), cell('b', '#1', '#2'), cell('c', '#1', '#2'), cell('d', '#1', '#2')] };
  const b = { ...a, cells: a.cells.map((c, i) => (i === 2 ? cell('X', '#1', '#2') : c)) };
  expect(diffCells(a, b)).toEqual([{ col: 0, row: 1, a: a.cells[2], b: b.cells[2] }]);
  expect(diffCells(a, a)).toEqual([]);
});

test('the scene shows in the terminal as the app reads it', async () => {
  const bytes = makeSceneAns(), art = readArtFile(bytes, 'scene.ans');
  const shown = await terminalCells(bytes, { cols: art.cols, rows: art.rows, encoding: 'cp437' });
  expect(diffCells(shown, { ...shown, cells: art.cells })).toEqual([]);
});

test('the long file shows in the terminal as the app reads its first rows', async () => {
  const bytes = makeLongAns({ cols: 300, lines: 4 }), art = readArtFile(bytes, 'long.ans');
  const shown = await terminalCells(bytes, { cols: art.cols, rows: art.rows, encoding: 'cp437' });
  expect(diffCells(shown, { ...shown, cells: art.cells })).toEqual([]);
});
