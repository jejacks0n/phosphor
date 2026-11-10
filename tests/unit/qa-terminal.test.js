// The headless terminal QA plays exports in, to compare with what the screen shows.
import { test, expect } from 'vitest';
import { AnsiFile } from '../../src/lib/AnsiFile.js';
import { castText } from '../../src/lib/CastFile.js';
import { PALETTES } from '../../src/lib/ColorUtils.js';
import { readArtFile } from '../../src/lib/ArtFile.js';
import { makeLongAns, makeSceneAns } from '../qa/files.js';
import { castFinalCells, diffCells, terminalCells } from '../qa/terminal.js';

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

test('a grid the app wrote reads back with the same characters and colors', async () => {
  const cga = PALETTES.cga;
  const cells = [[1, 9, 'a'], [14, 4, '█'], [7, 12, 'é'], [0, 7, ' ']].map(([f, b, char]) => ({ char, fg: cga[f], bg: cga[b] }));
  const file = new AnsiFile(2, 2, cells);
  const expected = cells.map((c) => cell(c.fg.hex === c.bg.hex ? ' ' : c.char, c.fg.hex, c.bg.hex));
  const ans = new Uint8Array(await file.toBlob({ colorMode: 'cga' }).arrayBuffer());
  expect((await terminalCells(ans, { cols: 2, rows: 2, encoding: 'cp437' })).cells).toEqual(expected);
  const utf8 = new Uint8Array(await file.toBlob({ colorMode: 'cga', utf8: true }).arrayBuffer());
  // A .utf8ans ends with a line feed, so a terminal exactly as tall as the art would scroll it away.
  expect((await terminalCells(utf8, { cols: 2, rows: 3, encoding: 'utf8' })).cells.slice(0, 4)).toEqual(expected);
  const cast = castText(2, 2, [cells], [1], { colorMode: 'cga' });
  expect((await castFinalCells(cast, { cols: 2, rows: 2 })).cells).toEqual(expected);
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
