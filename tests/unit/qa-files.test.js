// The ANSI files QA personas bring: made on the spot, and read back by the app's own reader.
import { test, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { readArtFile } from '../../src/lib/ArtFile.js';
import { makeLogoAns, makeLongAns, makeSceneAns, writeFiles } from '../qa/files.js';

const at = (art, char) => {
  const i = art.cells.findIndex((cell) => cell.char === char);
  return { col: i % art.cols, row: Math.floor(i / art.cols), cell: art.cells[i] };
};

test('the scene is 80 columns with the SAUCE a persona expects', () => {
  const art = readArtFile(makeSceneAns(), 'scene.ans');
  expect(art.cols).toBe(80);
  expect(art.sauce).toMatchObject({ title: 'QA Scene', author: 'Phosphor QA', group: 'QA', iceColors: true });
});

test('the scene has CP437 high bytes, and a bright background written as blink', () => {
  const art = readArtFile(makeSceneAns(), 'scene.ans');
  expect(art.cells.some((cell) => cell.char === '█')).toBe(true);
  expect(art.cells.some((cell) => cell.char === 'é')).toBe(true);
  expect(at(art, '!').cell.bg).toBe('#ff5555');
});

test('the character after a forward move is at the column the move names', () => {
  const art = readArtFile(makeSceneAns(), 'scene.ans');
  // "ab", then ESC[10C
  expect(at(art, 'Z').col).toBe(12);
  expect(art.cells[at(art, 'Z').row * 80 + 1].char).toBe('b');
});

test('a restored cursor goes back to where it was saved', () => {
  const art = readArtFile(makeSceneAns(), 'scene.ans');
  const z = at(art, 'Z'), r = at(art, 'R');
  expect(r.row).toBe(z.row);
  expect(r.col).toBe(z.col + 1);
});

test('a character past column 80 starts the next line', () => {
  const art = readArtFile(makeSceneAns(), 'scene.ans');
  const w = at(art, 'W');
  expect(w.col).toBe(0);
  expect(art.cells[(w.row - 1) * 80 + 79].char).toBe('9');
});

test('the long file reads back as 300 by 1600 and uses every color', () => {
  const art = readArtFile(makeLongAns(), 'long.ans');
  expect([art.cols, art.rows]).toEqual([300, 1600]);
  expect(new Set(art.cells.map((cell) => cell.fg)).size).toBeGreaterThanOrEqual(240);
  expect(new Set(art.cells.map((cell) => cell.bg)).size).toBeGreaterThanOrEqual(240);
});

test('the logo reads back as 20 by 5 with spaces around the shape', () => {
  const art = readArtFile(makeLogoAns(), 'logo.ans');
  expect([art.cols, art.rows]).toEqual([20, 5]);
  expect(art.cells[0].char).toBe(' ');
  expect(art.cells.some((cell) => cell.char !== ' ')).toBe(true);
});

test('the files are written into a folder, each as the bytes the generator makes', () => {
  const dir = mkdtempSync(join(os.tmpdir(), 'qa-files-'));
  const paths = writeFiles(dir);
  expect(Object.keys(paths)).toEqual(['long', 'scene', 'logo']);
  expect(readFileSync(paths.logo)).toEqual(Buffer.from(makeLogoAns()));
});
