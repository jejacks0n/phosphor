// Reading an art file into cells: encoding, width and wrapping, controls, escape sequences, colors and limits.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ART_EXTENSIONS, isArtFile, readArtFile } from '../../src/lib/ArtFile.js';

const cp = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const utf = (text) => new TextEncoder().encode(text);
const read = (text, name = 'a.ans') => readArtFile(cp(text), name);
const at = (art, col, row = 0) => art.cells[row * art.cols + col];
const text = (art, row = 0) => art.cells.slice(row * art.cols, (row + 1) * art.cols).map((c) => c.char).join('');
const error = (fn) => { try { fn(); } catch (e) { return e; } assert.fail('did not throw'); };

test('isArtFile checks the extension, ignoring case', () => {
  assert.deepEqual(ART_EXTENSIONS, ['ans', 'utf8ans', 'asc', 'txt', 'nfo', 'diz']);
  assert.equal(isArtFile('A.ANS'), true);
  assert.equal(isArtFile('release.NFO'), true);
  assert.equal(isArtFile('file_id.diz'), true);
  for (const name of ['a.xb', 'a.sue', 'a.tnd', 'a.ttf']) assert.equal(isArtFile(name), false);
  assert.equal(isArtFile('x.utf8ans'), true);
  assert.equal(isArtFile('a.png'), false);
  assert.equal(isArtFile('ans'), false);
});

test('a .utf8ans is UTF-8, and a wide character holds two columns', () => {
  const art = readArtFile(utf('漢x'), 'a.utf8ans');
  assert.equal(art.cols, 3);
  assert.equal(at(art, 0).char, '漢');
  assert.equal(at(art, 1).char, ' ');
  assert.equal(at(art, 2).char, 'x');
});

test('another extension is UTF-8 only when it is valid UTF-8 with a multi-byte sequence, else CP437', () => {
  assert.equal(text(readArtFile(utf('é█'), 'a.txt')), 'é█');
  // 0xB0 0xDB (a shade and a block) is not valid UTF-8.
  assert.equal(text(readArtFile(Uint8Array.from([0xb0, 0xdb]), 'a.txt')), '░█');
  assert.equal(text(readArtFile(utf('abc'), 'a.txt')), 'abc');
});

test('a UTF-8 byte-order mark makes the file UTF-8 and is not a cell', () => {
  const art = readArtFile(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41, 0x42]), 'a.txt');
  assert.equal(art.cols, 2);
  assert.equal(text(art), 'AB');
});

test('CP437 shows control bytes other than 7, 8, 9, 10, 13, 26 and 27 as glyphs', () => {
  const art = readArtFile(Uint8Array.from([1, 2, 7, 65]), 'a.txt');
  assert.equal(text(art), '☺☻A');
});

test('width is the SAUCE width for dataType 1, else 80 for .ans, else the widest line', () => {
  const record = (width, dataType) => {
    const sauce = new Uint8Array(128);
    sauce.set(cp('SAUCE00'), 0);
    sauce[94] = dataType; sauce[95] = 1; sauce[96] = width;
    return sauce;
  };
  const withSauce = (body, width, dataType = 1) => Uint8Array.from([...cp(body), 26, ...record(width, dataType)]);
  assert.equal(readArtFile(withSauce('ABCDEF', 4), 'a.ans').cols, 4);
  assert.equal(readArtFile(withSauce('ABCDEF', 4), 'a.txt').rows, 2);
  assert.equal(readArtFile(withSauce('AB', 4, 5), 'a.ans').cols, 80);
  assert.equal(readArtFile(withSauce('AB', 0), 'a.ans').cols, 80);
  assert.equal(read('AB').cols, 80);
  const loose = readArtFile(cp('AB\r\nABCDE\r\nA'), 'a.txt');
  assert.deepEqual([loose.cols, loose.rows], [5, 3]);
  assert.equal(readArtFile(cp('AB'), 'a.asc').sauce, null);
});

test('writing the last column waits to wrap, so an 80-column line then CR LF is not an extra row', () => {
  const art = read('A'.repeat(80) + '\r\nB');
  assert.equal(art.rows, 2);
  assert.equal(at(art, 0, 1).char, 'B');
  assert.equal(read('A'.repeat(81)).rows, 2);
  const moved = read('A'.repeat(80) + '\x1b[DB'); // a cursor move clears the wait
  assert.equal(moved.rows, 1);
  assert.equal(at(moved, 78).char, 'B');
  assert.equal(at(moved, 79).char, 'A');
});

test('a move right while waiting to wrap starts on the next line, as DOS art drawn past the edge expects', () => {
  const art = read('A'.repeat(80) + '\x1b[5CB'); // the row after a full one, indented by a move (VD-HUMA.ANS)
  assert.equal(art.rows, 2);
  assert.equal(at(art, 79).char, 'A');
  assert.equal(at(art, 5, 1).char, 'B');
  assert.equal(at(art, 4, 1).char, ' ');

  // A report's rows: line 16 is 159 columns, its second row indented by a move right from the edge (VD-HUMA.ANS, 1995).
  const report = readArtFile(new Uint8Array(readFileSync(new URL('../fixtures/ansi/past-the-edge.ans', import.meta.url))), 'past-the-edge.ans');
  assert.equal(report.rows, 18);
  assert.equal(text(report, 15), '    ░▓▓▓    ░▐▓▓▓▌   ▓▓▓    ░▐▓▓▓▌  ▓▓▓    ░▐▓▓▓▌   ▓▓▓    ░▐▓▓▓▌ ░▓▓▓    ░▐▓▓▓▌');
  assert.equal(text(report, 16), '     █▓█▄■  ▄▓█▓▀    █▓█▄■  ▄▓█▓▀   █▓█▄■  ▄▓█▓▀    █▓█▄■  ▄▓█▓▀   █▓█▄■  ▄▓█▓▀ ');
});

test('a wide character that does not fit in the last column wraps first', () => {
  assert.equal(readArtFile(utf('ab漢'), 'a.ans').rows, 1);
  const wrapped = readArtFile(utf('x'.repeat(79) + '漢'), 'a.ans');
  assert.equal(wrapped.rows, 2);
  assert.equal(at(wrapped, 78).char, 'x');
  assert.equal(at(wrapped, 79).char, ' ');
  assert.equal(at(wrapped, 0, 1).char, '漢');
});

test('CR, LF, TAB and the end mark', () => {
  assert.equal(text(read('ABC\rX\n'), 0).slice(0, 3), 'XBC'); // CR returns to column 0 when the file has an LF
  assert.equal(at(read('A\nB'), 0, 1).char, 'B'); // LF returns to column 0
  assert.equal(at(read('A\tB'), 8).char, 'B');
  assert.equal(at(read('A\x08B'), 0).char, 'B');
  assert.equal(text(read('AB\x1aSAUCE00junk')).slice(0, 3), 'AB ');
  assert.equal(read('AB\x1aCD').cols, 80);
  assert.equal(read('AB\x1aCD').rows, 1);
  assert.equal(at(read('AB\x1aCD'), 2).char, ' ');
});

test('cursor movement clamps to the grid', () => {
  assert.equal(at(read('\x1b[255DX'), 0).char, 'X');
  assert.equal(at(read('\x1b[999CX'), 79).char, 'X');
  assert.equal(at(read('\x1b[3CX'), 3).char, 'X');
  assert.equal(at(read('\x1b[CX'), 1).char, 'X');
  assert.equal(at(read('A\r\n\x1b[AB'), 0, 0).char, 'B');
  assert.equal(read('\x1b[5AX').rows, 1);
  assert.equal(at(read('\x1b[2BX'), 0, 2).char, 'X');
  assert.equal(at(read('\x1b[3;5HX'), 4, 2).char, 'X');
  assert.equal(at(read('\x1b[4fX'), 0, 3).char, 'X');
  assert.equal(at(read('\x1b[2;2H\x1b[HX'), 0, 0).char, 'X');
});

test('save and restore the cursor', () => {
  const art = read('AB\x1b[s\r\nCD\x1b[uX');
  assert.equal(at(art, 2).char, 'X');
});

test('2J clears what was written and homes the cursor; other J and unknown sequences are ignored', () => {
  const art = read('AAAA\r\nBBBB\x1b[2JX');
  assert.equal(art.rows, 1);
  assert.equal(at(art, 0).char, 'X');
  assert.equal(at(art, 1).char, ' ');
  assert.equal(text(read('AB\x1b[JC')).slice(0, 3), 'ABC');
  assert.equal(text(read('\x1b[?33hAB\x1b[=7lC\x1b[5zD')).slice(0, 4), 'ABCD');
  assert.equal(text(read('A\x1bcB')).slice(0, 2), 'AB'); // ESC c skips two bytes
});

test('K erases to the end of the line in the current background and counts as reaching the line', () => {
  const art = read('\x1b[44mABCD\x1b[2D\x1b[K');
  assert.equal(at(art, 1).bg, '#0000aa');
  assert.equal(at(art, 2).char, ' ');
  assert.equal(at(art, 2).bg, '#0000aa');
  assert.equal(at(art, 79).bg, '#0000aa');
  assert.equal(at(art, 0).char, 'A');
  assert.equal(read('A\r\n\x1b[41m\x1b[K').rows, 2);
  const loose = readArtFile(cp('ABCDE\r\n\x1b[41mx\x1b[K'), 'a.txt');
  assert.equal(loose.cols, 5);
  assert.equal(at(loose, 4, 1).bg, '#aa0000');
});

test('ESC[1K erases from the start of the line through the cursor, ESC[2K the whole line', () => {
  assert.equal(text(read('abcdef\x1b[3D\x1b[1KZ')).slice(0, 6), '   Zef');
  assert.equal(text(read('abcdef\x1b[3D\x1b[2KZ')).slice(0, 6), '   Z  ');
  assert.equal(text(read('abcdef\x1b[3D\x1b[0KZ')).slice(0, 6), 'abcZ  '); // 0 is cursor to end, as no number is
  assert.equal(at(read('\x1b[44mabc\x1b[1K'), 0).bg, '#0000aa');
});

test('a huge SAUCE width with thousands of ESC[K is read fast and still reports the real size', () => {
  const sauce = new Uint8Array(128);
  sauce.set(cp('SAUCE00'), 0);
  sauce[94] = 1; sauce[95] = 1; sauce[96] = 0xff; sauce[97] = 0xff; // width 65535
  const bytes = Uint8Array.from([...cp('A' + '\x1b[K'.repeat(20000)), 26, ...sauce]);
  const started = performance.now();
  assert.throws(() => readArtFile(bytes, 'a.ans'), /65535 × 1\. Phosphor opens at most/);
  assert.ok(performance.now() - started < 500);
});

test('with no width, a long cursor move then an erase is read fast and never walks past the widest line', () => {
  const started = performance.now();
  for (const k of ['1K', '2K', '0K', 'K']) {
    const art = readArtFile(cp(`A\x1b[99999999C\x1b[${k}`), 'a.txt');
    assert.deepEqual([art.cols, art.rows], [1, 1]);
    assert.equal(text(art), k === '0K' || k === 'K' ? 'A' : ' ');
  }
  assert.throws(() => readArtFile(cp('A\x1b[99999999CB'), 'a.txt'), /Phosphor opens at most/);
  assert.ok(performance.now() - started < 500);
});

test('a file with CR and no LF reads each CR as a line break, in any kind of file', () => {
  const two = readArtFile(cp('abc\rde'), 'a.txt');
  assert.deepEqual([two.cols, two.rows, text(two, 0), text(two, 1)], [3, 2, 'abc', 'de ']);
  assert.equal(read('abc\rde').rows, 2);
  const wide = read('A'.repeat(80) + '\rB');
  assert.equal(wide.rows, 2); // the wait to wrap is not an extra row before the CR
  assert.equal(at(wide, 0, 1).char, 'B');
  assert.equal(read('A'.repeat(80) + '\r\rB').rows, 3);
  assert.equal(text(read('abc\r\nde'), 1).slice(0, 2), 'de'); // CR LF is one break, not two
  assert.equal(read('abc\r\nde').rows, 2);
  const mixed = readArtFile(cp('abc\rde\nf'), 'a.txt'); // an LF anywhere keeps CR as column 0
  assert.deepEqual([mixed.rows, text(mixed, 0), text(mixed, 1)], [2, 'dec', 'f  ']);
  assert.equal(read('abc\rde\x1a\nf').rows, 2); // an LF after the end mark is not in the art
});

test('K under inverse erases with the swapped colors', () => {
  const art = read('\x1b[7;44mA\x1b[K');
  assert.deepEqual(at(art, 0), { char: 'A', fg: '#0000aa', bg: '#aaaaaa' });
  assert.deepEqual(at(art, 1), { char: ' ', fg: '#0000aa', bg: '#aaaaaa' });
  assert.deepEqual(at(art, 79), { char: ' ', fg: '#0000aa', bg: '#aaaaaa' });
});

test('a 0 in a cursor position is the first row or column', () => {
  assert.equal(at(read('AB\r\nCD\x1b[0;0HX'), 0, 0).char, 'X');
  assert.equal(at(read('AB\r\nCD\x1b[0;0HX'), 1, 0).char, 'B');
});

test('default colors, reset, and the 16 colors', () => {
  const art = read('A\x1b[31;42mB\x1b[0mC\x1b[91;104mD\x1b[39;49mE');
  assert.deepEqual([at(art, 0).fg, at(art, 0).bg], ['#aaaaaa', '#000000']);
  assert.deepEqual([at(art, 1).fg, at(art, 1).bg], ['#aa0000', '#00aa00']);
  assert.deepEqual([at(art, 2).fg, at(art, 2).bg], ['#aaaaaa', '#000000']);
  assert.deepEqual([at(art, 3).fg, at(art, 3).bg], ['#ff5555', '#5555ff']);
  assert.deepEqual([at(art, 4).fg, at(art, 4).bg], ['#aaaaaa', '#000000']);
  assert.equal(art.palette, 'cga');
});

test('bold brightens the foreground whichever order it is set in', () => {
  assert.equal(at(read('\x1b[1;31mX'), 0).fg, '#ff5555');
  assert.equal(at(read('\x1b[31;1mX'), 0).fg, '#ff5555');
  assert.equal(at(read('\x1b[1mX'), 0).fg, '#ffffff');
  assert.equal(at(read('\x1b[1;22;31mX'), 0).fg, '#aa0000');
  assert.equal(at(read('\x1b[1;38;5;1mX'), 0).fg, '#aa0000'); // bold does not touch 256-color indices
  assert.equal(at(read('\x1b[1;91mX'), 0).fg, '#ff5555');
});

test('blink gives a bright background', () => {
  assert.equal(at(read('\x1b[5;44mX'), 0).bg, '#5555ff');
  assert.equal(at(read('\x1b[44;5mX'), 0).bg, '#5555ff');
  assert.equal(at(read('\x1b[6;44mX'), 0).bg, '#5555ff');
  assert.equal(at(read('\x1b[5;25;44mX'), 0).bg, '#0000aa');
});

test('inverse swaps the colors as written to the cell', () => {
  const art = read('\x1b[1;31;44;7mX');
  assert.equal(at(art, 0).fg, '#0000aa');
  assert.equal(at(art, 0).bg, '#ff5555');
  assert.equal(at(read('\x1b[7;27;31mX'), 0).fg, '#aa0000');
});

test('256-color and 24-bit colors set the palette to none only when a cell gets one', () => {
  const art = read('\x1b[38;5;196mX');
  assert.equal(at(art, 0).fg, '#ff0000');
  assert.equal(art.palette, 'none');
  const bg = read('\x1b[48;2;18;52;86mX');
  assert.equal(at(bg, 0).bg, '#123456');
  assert.equal(bg.palette, 'none');
  assert.equal(at(read('\x1b[38;2;255;0;170mX'), 0).fg, '#ff00aa');
  const low = read('\x1b[38;5;9;48;5;4mX');
  assert.equal(at(low, 0).fg, '#ff5555');
  assert.equal(at(low, 0).bg, '#0000aa');
  assert.equal(low.palette, 'cga');
  const deepBg = read('\x1b[48;5;100mX');
  assert.equal(at(deepBg, 0).bg, '#878700');
  assert.equal(deepBg.palette, 'none');
  assert.equal(read('\x1b[38;5;196m\x1b[0mX').palette, 'cga'); // set and never written with
});

test('cells never written are spaces in the default colors, and rows is the last line reached', () => {
  const art = read('\x1b[3;3HX');
  assert.equal(art.rows, 3);
  assert.equal(art.cells.length, 80 * 3);
  assert.deepEqual(at(art, 0, 0), { char: ' ', fg: '#aaaaaa', bg: '#000000' });
  assert.equal(read('A\r\n\r\n').rows, 1);
});

test('a wide character repeats its colors in the trail', () => {
  const art = readArtFile(utf('\x1b[31;44m漢'), 'a.utf8ans');
  assert.deepEqual(at(art, 1), { char: ' ', fg: '#aa0000', bg: '#0000aa' });
});

test('a CR LF pair in UTF-8 text is a line end', () => {
  const art = readArtFile(utf('é\r\nb'), 'a.txt');
  assert.equal(art.rows, 2);
  assert.equal(at(art, 0, 1).char, 'b');
});

test('too big names the size reached', () => {
  const e = error(() => readArtFile(cp('x'.repeat(301)), 'a.txt'));
  assert.equal(e.userMessage, 'This file is 301 × 1. Phosphor opens at most 300 columns, 5,000 lines and 500,000 cells.');
  const lines = error(() => readArtFile(cp('x\n'.repeat(5001)), 'a.txt'));
  assert.match(lines.userMessage, /^This file is 1 × 5001\./);
  const fixed = error(() => read('x\r\n'.repeat(6000)));
  assert.match(fixed.userMessage, /^This file is 80 × 6000\./);
  const record = new Uint8Array(128); // SAUCE: dataType 1, width 300
  record.set(cp('SAUCE00'), 0);
  record[94] = 1; record[95] = 1; record[96] = 300 & 0xff; record[97] = 300 >> 8;
  const wide = error(() => readArtFile(Uint8Array.from([...cp('x\r\n'.repeat(2000)), 26, ...record]), 'a.txt'));
  assert.match(wide.userMessage, /^This file is 300 × 2000\./);
  const cells = error(() => readArtFile(cp(('x'.repeat(200) + '\n').repeat(2600)), 'a.txt'));
  assert.match(cells.userMessage, /^This file is 200 × \d+\./);
});

test('no art in an empty file or one that never wrote a cell', () => {
  assert.equal(error(() => readArtFile(new Uint8Array(0), 'a.ans')).userMessage, "There's no art in this file.");
  assert.equal(error(() => read('\r\n\r\n\x1b[31m')).userMessage, "There's no art in this file.");
  assert.equal(error(() => read('\x1a')).userMessage, "There's no art in this file.");
});

test('.nfo and .diz read as CP437 text, the way .asc does', () => {
  const bytes = Uint8Array.from([0xb0, 0xdb, 0x0d, 0x0a, 0x41]);
  for (const name of ['a.nfo', 'a.diz']) {
    const art = readArtFile(bytes, name);
    assert.equal(text(art, 0).trim(), '░█');
    assert.equal(at(art, 0, 1).char, 'A');
  }
});
