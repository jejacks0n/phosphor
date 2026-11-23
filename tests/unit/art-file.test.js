// Reading an art file into cells: encoding, width and wrapping, controls, escape sequences, colors and limits.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ART_EXTENSIONS, isArtFile, readArtFile } from '../../src/lib/ArtFile.js';
import { Sauce } from '../../src/lib/Sauce.js';
import { PALETTES } from '../../src/lib/ColorUtils.js';

const cp = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const utf = (text) => new TextEncoder().encode(text);
const read = (text, name = 'a.ans') => readArtFile(cp(text), name);
const at = (art, col, row = 0) => art.cells[row * art.cols + col];
const text = (art, row = 0) => art.cells.slice(row * art.cols, (row + 1) * art.cols).map((c) => c.char).join('');
const error = (fn) => { try { fn(); } catch (e) { return e; } assert.fail('did not throw'); };

test('isArtFile checks the extension, ignoring case', () => {
  assert.deepEqual(ART_EXTENSIONS, ['ans', 'utf8ans', 'asc', 'txt', 'nfo', 'diz', 'xb', 'bin']);
  assert.equal(isArtFile('A.ANS'), true);
  assert.equal(isArtFile('release.NFO'), true);
  assert.equal(isArtFile('file_id.diz'), true);
  for (const name of ['a.sue', 'a.tnd', 'a.ttf']) assert.equal(isArtFile(name), false);
  assert.equal(isArtFile('x.utf8ans'), true);
  assert.equal(isArtFile('A.XB'), true);
  assert.equal(isArtFile('A.BIN'), true);
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

test('a .utf8ans that is no UTF-8 at all (an .ans renamed) reads as an .ans does, CP437 at 80 columns, and says so', () => {
  const art = read('\xb0\xdb\xb1 A\xdb'.repeat(20), 'renamed.utf8ans');   // 120 CP437 characters, no line end
  assert.equal(art.notUtf8, true);
  assert.equal(art.cols, 80);
  assert.equal(art.rows, 2);
  assert.equal(text(art).slice(0, 6), '░█▒ A█');
  assert.equal(art.cells.some((cell) => cell.char === '\uFFFD'), false);
});

test('a .utf8ans with a stray bad byte among its UTF-8 stays UTF-8, the byte a replacement character', () => {
  const bytes = Uint8Array.from([...utf('漢字 ░▒▓█'.repeat(4)), 0xb0, ...utf('x')]);   // 1 bad byte, 24 good characters
  const art = readArtFile(bytes, 'a.utf8ans');
  assert.equal(art.notUtf8, false);
  assert.equal(at(art, 0).char, '漢');
  assert.equal(art.cells.filter((cell) => cell.char === '\uFFFD').length, 1);
  assert.equal(read('\xb0\xdb', 'a.ans').notUtf8, false);   // an .ans is CP437 by its name, nothing to say
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

test('a 256-color code sets the palette to VGA and a 24-bit one to none, only when a cell gets one', () => {
  const art = read('\x1b[38;5;196mX');
  assert.equal(at(art, 0).fg, '#ff0000');
  assert.equal(art.palette, 'vga');
  const bg = read('\x1b[48;2;18;52;86mX');
  assert.equal(at(bg, 0).bg, '#123456');
  assert.equal(bg.palette, 'none');
  assert.equal(at(read('\x1b[38;2;255;0;170mX'), 0).fg, '#ff00aa');
  const low = read('\x1b[38;5;9;48;5;4mX');
  assert.equal(at(low, 0).fg, '#ff5555');
  assert.equal(at(low, 0).bg, '#0000aa');
  assert.equal(low.palette, 'cga'); // the 16, as a CGA .utf8ans writes them
  const deepBg = read('\x1b[48;5;100mX');
  assert.equal(at(deepBg, 0).bg, '#878700');
  assert.equal(deepBg.palette, 'vga');
  assert.equal(read('\x1b[38;5;196mX\x1b[48;2;1;2;3mY').palette, 'none'); // 24-bit anywhere is full color
  assert.equal(read('\x1b[38;5;196m\x1b[0mX').palette, 'cga'); // set and never written with
});

// xterm's 16 and 231 are fixed black and white, 0 and 15 a terminal's own (its theme's): the same colors here, so a
// cell keeps the index it was given, for the export to write back.
test('a 256-color index that shares its color with a lower one is kept with the cell', () => {
  const art = read('\x1b[38;5;16;48;5;231mA\x1b[38;5;0;48;5;15mB\x1b[7mC\x1b[0;38;5;196mD');
  assert.deepEqual(at(art, 0), { char: 'A', fg: '#000000', bg: '#ffffff', fgIndex: 16, bgIndex: 231 });
  assert.deepEqual(at(art, 1), { char: 'B', fg: '#000000', bg: '#ffffff' });
  assert.deepEqual(at(art, 2), { char: 'C', fg: '#ffffff', bg: '#000000' }); // inverse swaps them, indexes and all
  assert.deepEqual(at(read('\x1b[38;5;16;48;5;15;7mX'), 0), { char: 'X', fg: '#ffffff', bg: '#000000', bgIndex: 16 });
  assert.deepEqual(at(art, 3), { char: 'D', fg: '#ff0000', bg: '#000000' });
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

// BinaryText: a character byte and an attribute a cell, its width from SAUCE, or 160 with no record.
const CGA = PALETTES.cga.map((c) => c.hex);
const binRecord = (data, opts) => new Sauce({ cols: 0, rows: 0 }, { dataType: 5, fileType: 2, width: 0, height: 0, flags: 0, ...opts }).appendTo(Uint8Array.from(data));

test('the .bin fixture opens 8 wide from its record: DOS colors, iCE backgrounds, a 0x1A that\'s a character, a short last row', () => {
  const art = readArtFile(new Uint8Array(readFileSync(new URL('../fixtures/ansi/binarytext.bin', import.meta.url))), 'BINARYTEXT.BIN');
  assert.deepEqual([art.cols, art.rows], [8, 3]);
  assert.equal(text(art, 0), 'BIN TEXT');
  assert.equal(at(art, 0).fg, CGA[4]); // DOS 1 is blue, ANSI 4
  assert.equal(at(art, 3).fg, CGA[1]); // DOS 4 is red, ANSI 1
  assert.deepEqual([at(art, 0).fgIndex, at(art, 0).bgIndex], [4, 0]);
  assert.equal(text(art, 1), '→█░▒▓▄▀A');
  assert.deepEqual(art.cells.slice(8, 16).map((c) => c.bg), [8, 12, 10, 14, 9, 13, 11, 15].map((i) => CGA[i])); // iCE: bright
  assert.equal(text(art, 2), 'BC      ');
  assert.deepEqual([at(art, 0, 2).fg, at(art, 0, 2).bg], [CGA[11], CGA[4]]);
  assert.deepEqual([at(art, 2, 2).fg, at(art, 2, 2).bg], [CGA[7], CGA[0]]); // past the data: a blank cell
  assert.equal(art.sauce.title, 'Bin');
  assert.deepEqual([art.sauce.width, art.sauce.height], [8, 3]); // the grid's size, for an export's record
  assert.equal(art.palette.length, 16);
  assert.equal(art.binNoSauce, false);
});

test('a .bin without iCE colors takes the blink bit off the background', () => {
  const art = readArtFile(binRecord([65, 0x9f, 66, 0x1f]), 'a.bin');
  assert.deepEqual(art.cells.slice(0, 2).map((c) => c.bg), [CGA[4], CGA[4]]);
  assert.equal(readArtFile(binRecord([65, 0x9f], { flags: 1 }), 'a.bin').cells[0].bg, CGA[12]);
});

test('a .bin with no record is 160 wide, said so, when it\'s whole rows of that; otherwise it isn\'t BinaryText', () => {
  const row = Array.from({ length: 320 }, (_, i) => (i % 2 ? 0x07 : 65));
  const art = readArtFile(Uint8Array.from([...row, ...row, 0x1a]), 'old.bin'); // an EOF byte after it
  assert.deepEqual([art.cols, art.rows, art.binNoSauce, art.sauce], [160, 2, true, null]);
  for (const bytes of [Uint8Array.from(row.slice(2)), Uint8Array.from({ length: 4096 }), new Uint8Array(0)]) {
    assert.equal(error(() => readArtFile(bytes, 'FIRMWARE.BIN')).userMessage, "FIRMWARE.BIN isn't a BinaryText file.");
  }
  const ansi = new Sauce({ cols: 80, rows: 1 }, {}).appendTo(cp('hello'));
  assert.equal(error(() => readArtFile(ansi, 'a.bin')).userMessage, "a.bin isn't a BinaryText file."); // its record is an ANSI file's
});

test('a .bin\'s record of width 0 is 160 wide; one over the limits or with no data says so before reading cells', () => {
  assert.equal(readArtFile(binRecord([65, 7], { fileType: 0 }), 'a.bin').cols, 160);
  assert.match(error(() => readArtFile(binRecord([65, 7], { fileType: 255 }), 'a.bin')).userMessage, /510 × 1\. Phosphor opens at most/);
  assert.match(error(() => readArtFile(binRecord(new Uint8Array(320 * 5001), { fileType: 80 }), 'a.bin')).userMessage, /160 × 5001\. Phosphor opens at most/);
  assert.equal(error(() => readArtFile(binRecord([]), 'a.bin')).userMessage, "There's no art in this file.");
});

test('an XBin named .bin opens as XBin', () => {
  const art = readArtFile(Uint8Array.from([0x58, 0x42, 0x49, 0x4e, 0x1a, 2, 0, 1, 0, 16, 0, 65, 7, 66, 7]), 'a.bin');
  assert.deepEqual([art.xbin, text(art)], [true, 'AB']);
});
